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
