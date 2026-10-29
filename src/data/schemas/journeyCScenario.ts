import { z } from 'zod';
import { CleanupStepSchema } from './cleanupStep';

// Journey C (pack-house day) scenarios. C6 is the office-side half of a kiosk workflow: a table is
// set up under a crew, workers are clocked in against it, and the day's cards are grouped by table.
// One file per spec, one happy-path case; run-unique values arrive through
// `{tableName}` tokens substituted by src/utils/journeys/journeyCFlow.ts.

const Code = z.string().regex(/^[1-9]\d{3,}$/);
const Clock = z.object({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) }).strict();

export const CrewTableCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        workflow: z.literal('C6'),
        label: z.string().min(1),
        /** The fixture day; must not collide with any Journey B offset (they own 0 … -9). */
        dayOffset: z.number().int().max(0),
        /** Crew Time In moment on the fixture day — deterministic, never `now`. */
        timeIn: Clock,
        /** Crew Time Out moment on the fixture day; must be later than `timeIn`. */
        timeOut: Clock,
        table: z
            .object({
                /**
                 * `minted`: a run-unique `{tableName}` the case creates itself, on screen.
                 * `fixture`: the fixed `C6 TABLE A` row, ensured on screen when missing and never deleted
                 * — tables cannot be deleted on dev today, see crewTablesApi.ts.
                 */
                source: z.enum(['minted', 'fixture']),
                /** Name the fixture supervisor on the table (C6: "under a shared supervisor"). */
                withSupervisor: z.boolean(),
                active: z.boolean().default(true),
            })
            .strict(),
        /** Who is clocked in (all together, no table) and then out. */
        capture: z
            .object({
                /** Fixture workers clocked out WITH the table selected. */
                workerCodes: z.array(Code).min(1),
                /** Fixture members clocked out with NO table, so the roll-up has something to partition. */
                offTableCodes: z.array(Code).default([]),
            })
            .strict()
            .optional(),
        expected: z
            .object({
                /** Time Out (0) — the card type the table is read back from. */
                cardType: z.number().int(),
                cardsOnTable: z.number().int().positive(),
                cardsOffTable: z.number().int().nonnegative(),
                /** Rows View > Time Cards shows for the crew's day: one Time In plus one Time Out per member. */
                crewDayRows: z.number().int().positive(),
            })
            .strict()
            .optional(),
        /** Screen-facing reference values the spec asserts (toasts, labels). */
        screen: z.object({ messages: z.record(z.string(), z.string().min(1)) }).strict().optional(),
        /** Pushed by the flow before the test body — what the workflow deliberately does NOT run, and why. */
        annotations: z.array(z.object({ type: z.string().min(1), description: z.string().min(1) }).strict()).default([]),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        if (s.capture && !s.cleanup.some((step) => step.kind === 'timeCards')) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cleanup'], message: 'a capture case creates cards — declare a timeCards cleanup step' });
        }
        const ownsTable = s.cleanup.some(
            (step) => (step.kind === 'delete' || step.kind === 'unremovable') && step.entity === 'crewTable',
        );
        if (s.table.source === 'minted' && !ownsTable) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cleanup'], message: 'a minted table needs a crewTable delete (or unremovable) step' });
        }
        if (s.capture && s.expected && s.expected.cardsOnTable !== s.capture.workerCodes.length) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected', 'cardsOnTable'], message: 'must equal capture.workerCodes.length' });
        }
        if (s.capture && s.expected && s.expected.cardsOffTable !== s.capture.offTableCodes.length) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected', 'cardsOffTable'], message: 'must equal capture.offTableCodes.length' });
        }
        if (s.expected && s.expected.crewDayRows !== 2 * (s.expected.cardsOnTable + s.expected.cardsOffTable)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected', 'crewDayRows'], message: 'must equal 2 * (cardsOnTable + cardsOffTable): one Time In and one Time Out per member' });
        }
        if (s.timeOut.hour * 60 + s.timeOut.minute <= s.timeIn.hour * 60 + s.timeIn.minute) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['timeOut'], message: 'the Time Out must be later than the Time In' });
        }
        if (s.capture && s.capture.workerCodes.some((code) => s.capture!.offTableCodes.includes(code))) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capture'], message: 'workerCodes and offTableCodes must be disjoint' });
        }
        const timeCardsStep = s.cleanup.find((step) => step.kind === 'timeCards');
        if (s.capture && (!timeCardsStep?.cardTypes?.includes(0) || !timeCardsStep.cardTypes.includes(1))) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cleanup'], message: 'a timeCards cleanup step with cardTypes:[0,1] is required (the crew time-in and time-out)' });
        }
    });

export type CrewTableCase = z.infer<typeof CrewTableCaseSchema>;
