import { z } from 'zod';
import { CleanupStepSchema } from './cleanupStep';

// Journey D (office processing engine). D6 is the office-side "recalculate after setup change"
// workflow: seed a crew day, run a real transfer, raise the job's piece rate, then recalculate
// exactly the two job cards the transfer wrote. One file per spec, one happy-path case.

const TimeOfDay = z.object({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) }).strict();

function minutes(t: z.infer<typeof TimeOfDay>): number {
    return t.hour * 60 + t.minute;
}

export const JourneyDRecalculateCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        workflow: z.literal('D6'),
        label: z.string().min(1),
        /** The fixture day; Journey B owns 0..-9, Journey C took -10 — D6 is -11. */
        dayOffset: z.number().int(),
        capture: z
            .object({
                punch: TimeOfDay,
                pieceOut: TimeOfDay,
                timeOut: TimeOfDay,
                numOfPieces: z.number().int().positive(),
            })
            .strict(),
        rate: z.object({ before: z.number().positive(), after: z.number().positive() }).strict(),
        expected: z
            .object({
                jobCards: z.number().int().positive(),
                piecesPerCard: z.number().int().positive(),
                amountBefore: z.number(),
                amountAfter: z.number(),
                updated: z.number().int(),
                skipped: z.number().int(),
                failed: z.number().int(),
            })
            .strict(),
        /** Pushed by the flow before the test body — what the workflow deliberately does NOT run, and why. */
        annotations: z.array(z.object({ type: z.string().min(1), description: z.string().min(1) }).strict()).default([]),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        if (s.dayOffset !== -11) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dayOffset'], message: 'D6 owns day -11 (Journey B: 0..-9, Journey C: -10)' });
        }
        if (s.rate.after === s.rate.before) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rate', 'after'], message: 'rate.after must differ from rate.before — nothing to recalculate otherwise' });
        }
        if (!(minutes(s.capture.pieceOut) > minutes(s.capture.punch))) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capture', 'pieceOut'], message: 'pieceOut must be after punch' });
        }
        if (!(minutes(s.capture.timeOut) > minutes(s.capture.pieceOut))) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capture', 'timeOut'], message: 'timeOut must be after pieceOut' });
        }
        if (s.expected.amountBefore !== s.expected.piecesPerCard * s.rate.before) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected', 'amountBefore'], message: 'must equal piecesPerCard x rate.before' });
        }
        if (s.expected.amountAfter !== s.expected.piecesPerCard * s.rate.after) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected', 'amountAfter'], message: 'must equal piecesPerCard x rate.after' });
        }
        const timeCardsStep = s.cleanup.find((step) => step.kind === 'timeCards');
        if (!timeCardsStep || !timeCardsStep.cardTypes || !(timeCardsStep.cardTypes.includes(0) && timeCardsStep.cardTypes.includes(1))) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cleanup'], message: 'a timeCards cleanup step with cardTypes:[0,1] is required (time-in/time-out plus the crew piece-out)' });
        }
        if (!s.cleanup.some((step) => step.kind === 'restore')) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cleanup'], message: 'a restore cleanup step is required — D6 mutates the job\'s piece rate and must put it back' });
        }
    });

export type JourneyDRecalculateCase = z.infer<typeof JourneyDRecalculateCaseSchema>;

// D9 — Group piece-out distribution. One crew piece-out is split across the members who punched in;
// a home-crewed member who did not punch gets nothing. D6's schema is pinned to workflow 'D6' and
// day -11, so D9 has its own.

/** Keys into the `d9` block of src/data/journey-d/fixture.json. */
const D9Picker = z.enum(['pickerOne', 'pickerTwo', 'pickerThree']);
export type D9PickerKey = z.infer<typeof D9Picker>;

export const JourneyD9DistributionCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        workflow: z.literal('D9'),
        label: z.string().min(1),
        /** Journey B owns 0..-9, C -10, D6 -11 — D9 is -12, inside maximumDaysForTransferExport = 21. */
        dayOffset: z.number().int(),
        capture: z
            .object({
                punch: TimeOfDay,
                pieceOut: TimeOfDay,
                timeOut: TimeOfDay,
                numOfPieces: z.number().int().positive(),
            })
            .strict(),
        /** Home-crewed members who punch in. */
        participants: z.array(D9Picker),
        /** Home-crewed members who do not punch in and must receive no job card. */
        nonParticipants: z.array(D9Picker),
        expected: z
            .object({
                /** Candidate rows for the crew: time-in + time-out per participant, plus the one crew piece-out. */
                timeCards: z.number().int().positive(),
                jobCards: z.number().int().positive(),
                piecesPerCard: z.number().int().positive(),
                pieceRate: z.number().positive(),
                pieceAmount: z.number(),
                crewEmployeeCell: z.string().min(1),
                pieceOutType: z.string().min(1),
                payByPiece: z.string().min(1),
                jobCardType: z.string().min(1),
            })
            .strict(),
        /** Pushed by the flow before the test body — what the workflow deliberately does NOT run, and why. */
        annotations: z.array(z.object({ type: z.string().min(1), description: z.string().min(1) }).strict()).default([]),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        const issue = (path: Array<string | number>, message: string) =>
            ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
        if (s.dayOffset !== -12) issue(['dayOffset'], 'D9 owns day -12 (Journey B: 0..-9, C: -10, D6: -11)');
        if (s.capture.numOfPieces > 5) issue(['capture', 'numOfPieces'], 'maximumNumberOfPieces is 5 on dev — a larger count is rejected');
        if (s.participants.length < 2) issue(['participants'], 'a distribution needs at least two participants');
        if (s.nonParticipants.length < 1) issue(['nonParticipants'], 'at least one home-crewed member must not punch in — that is the absence D9 proves');
        if (s.participants.some((p) => s.nonParticipants.includes(p))) issue(['nonParticipants'], 'a member cannot both participate and not participate');
        if (s.expected.piecesPerCard * s.expected.jobCards !== s.capture.numOfPieces) {
            issue(['expected'], 'conservation: piecesPerCard x jobCards must equal capture.numOfPieces');
        }
        if (s.expected.jobCards !== s.participants.length) issue(['expected', 'jobCards'], 'one job card per participant');
        if (s.expected.timeCards !== s.participants.length * 2 + 1) issue(['expected', 'timeCards'], 'time-in + time-out per participant plus one crew piece-out');
        if (s.expected.pieceAmount !== s.expected.piecesPerCard * s.expected.pieceRate) issue(['expected', 'pieceAmount'], 'must equal piecesPerCard x pieceRate');
        if (!(minutes(s.capture.punch) < minutes(s.capture.pieceOut) && minutes(s.capture.pieceOut) < minutes(s.capture.timeOut))) {
            issue(['capture'], 'punch < pieceOut < timeOut');
        }
        const timeCardsStep = s.cleanup.find((step) => step.kind === 'timeCards');
        if (!timeCardsStep?.cardTypes?.includes(0) || !timeCardsStep.cardTypes.includes(1)) {
            issue(['cleanup'], 'a timeCards cleanup step with cardTypes:[0,1] is required (time-in/time-out plus the crew piece-out)');
        }
    });

export type JourneyD9DistributionCase = z.infer<typeof JourneyD9DistributionCaseSchema>;
