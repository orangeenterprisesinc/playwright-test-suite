import { z } from 'zod';
import { CleanupStepSchema } from './cleanupStep';

// Journey E (weekly payroll close and export). E2 is California daily overtime: one crew day
// (a time-in and a time-out, one job card) is split by the engine into three paid buckets —
// regular up to rule.dailyOvertimeAfterHours, time-and-a-half up to rule.doubleTimeAfterHours,
// double beyond. The refinements encode the plan's arithmetic so the data cannot drift out of
// agreement with itself. Every derivation keys on NET hours (gross minus any meal), never on gross.

const TimeOfDay = z.object({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) }).strict();

function minutes(t: z.infer<typeof TimeOfDay>): number {
    return t.hour * 60 + t.minute;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const JourneyE2DailyOvertimeCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        workflow: z.literal('E2'),
        label: z.string().min(1),
        /** Journey B owns 0..-9, C -10, D6 -11, D9 -12, D10 -13 — E2 is -14, inside maximumDaysForTransferExport = 21. */
        dayOffset: z.number().int(),
        rule: z
            .object({
                name: z.string().min(1),
                dailyOvertimeAfterHours: z.number().positive(),
                doubleTimeAfterHours: z.number().positive(),
                overtimeMultiplier: z.number().positive(),
                doubleTimeMultiplier: z.number().positive(),
            })
            .strict(),
        capture: z.object({ timeIn: TimeOfDay, timeOut: TimeOfDay }).strict(),
        expected: z
            .object({
                timeCards: z.number().int().positive(),
                jobCards: z.number().int().positive(),
                hourlyRate: z.number().positive(),
                grossMinutes: z.number().int().positive(),
                /** 0 when the crew has no lunch length; the flow refuses a crew whose lunch disagrees. */
                mealMinutes: z.number().int().min(0),
                netMinutes: z.number().int().positive(),
                netHours: z.number().positive(),
                employees: z.number().int().positive(),
                pieces: z.number().int().min(0),
                regularHours: z.number().positive(),
                overtimeHours: z.number().positive(),
                doubleTimeHours: z.number().positive(),
                regularAmount: z.number(),
                overtimeAmount: z.number(),
                doubleTimeAmount: z.number(),
                totalAmount: z.number(),
            })
            .strict(),
        /** Pushed by the flow before the test body — what the workflow deliberately does NOT run, and why. */
        annotations: z.array(z.object({ type: z.string().min(1), description: z.string().min(1) }).strict()).default([]),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
        const { capture, expected, rule } = s;

        if (s.dayOffset !== -14) issue(['dayOffset'], 'E2 owns day -14 (Journey B: 0..-9, C: -10, D6: -11, D9: -12, D10: -13)');
        if (!(minutes(capture.timeIn) < minutes(capture.timeOut))) issue(['capture'], 'timeIn must be before timeOut');

        // The day: gross is the span, any meal is deducted once, net is what remains.
        if (expected.grossMinutes !== minutes(capture.timeOut) - minutes(capture.timeIn)) {
            issue(['expected', 'grossMinutes'], 'must equal timeOut - timeIn');
        }
        if (expected.netMinutes !== expected.grossMinutes - expected.mealMinutes) issue(['expected', 'netMinutes'], 'must equal grossMinutes - mealMinutes');
        if (expected.netHours !== expected.netMinutes / 60) issue(['expected', 'netHours'], 'must equal netMinutes / 60');

        if (expected.timeCards !== 2) issue(['expected', 'timeCards'], 'a crew time-in and a crew time-out');
        if (expected.jobCards !== 1) issue(['expected', 'jobCards'], 'one job card for the one crew day');

        // The precondition is real: a day that does not exceed both thresholds after the meal cannot exercise E2.
        if (!(expected.netHours > rule.doubleTimeAfterHours)) issue(['expected', 'netHours'], 'netHours must exceed rule.doubleTimeAfterHours or there is no double time to prove');

        // The buckets are derived, not typed twice, and every one keys on netHours — never on gross.
        if (expected.regularHours !== Math.min(expected.netHours, rule.dailyOvertimeAfterHours)) {
            issue(['expected', 'regularHours'], 'must equal min(netHours, rule.dailyOvertimeAfterHours)');
        }
        if (expected.overtimeHours !== Math.min(expected.netHours, rule.doubleTimeAfterHours) - rule.dailyOvertimeAfterHours) {
            issue(['expected', 'overtimeHours'], 'must equal min(netHours, rule.doubleTimeAfterHours) - rule.dailyOvertimeAfterHours');
        }
        if (expected.doubleTimeHours !== expected.netHours - rule.doubleTimeAfterHours) {
            issue(['expected', 'doubleTimeHours'], 'must equal netHours - rule.doubleTimeAfterHours');
        }
        for (const [key, value] of [
            ['regularHours', expected.regularHours],
            ['overtimeHours', expected.overtimeHours],
            ['doubleTimeHours', expected.doubleTimeHours],
        ] as const) {
            if (!(value > 0)) issue(['expected', key], 'must be positive — all three buckets carry time in E2');
        }

        // Conservation: the rule reclassifies the net day, it does not lengthen or shorten it.
        if (expected.regularHours + expected.overtimeHours + expected.doubleTimeHours !== expected.netHours) {
            issue(['expected'], 'conservation: regularHours + overtimeHours + doubleTimeHours must equal netHours (not gross)');
        }

        // Money on the regular rate; the premium may not introduce a third decimal (that would be E6 rounding).
        if (expected.regularAmount !== expected.regularHours * expected.hourlyRate) issue(['expected', 'regularAmount'], 'must equal regularHours x hourlyRate');
        if (expected.overtimeAmount !== expected.overtimeHours * expected.hourlyRate * rule.overtimeMultiplier) {
            issue(['expected', 'overtimeAmount'], 'must equal overtimeHours x hourlyRate x rule.overtimeMultiplier');
        }
        if (expected.doubleTimeAmount !== expected.doubleTimeHours * expected.hourlyRate * rule.doubleTimeMultiplier) {
            issue(['expected', 'doubleTimeAmount'], 'must equal doubleTimeHours x hourlyRate x rule.doubleTimeMultiplier');
        }
        if (expected.totalAmount !== expected.regularAmount + expected.overtimeAmount + expected.doubleTimeAmount) {
            issue(['expected', 'totalAmount'], 'must equal regularAmount + overtimeAmount + doubleTimeAmount');
        }
        for (const [key, value] of [
            ['regularAmount', expected.regularAmount],
            ['overtimeAmount', expected.overtimeAmount],
            ['doubleTimeAmount', expected.doubleTimeAmount],
            ['totalAmount', expected.totalAmount],
        ] as const) {
            if (round2(value) !== value) issue(['expected', key], 'must be exact to two decimals — a third decimal puts E6 rounding in scope');
        }

        const timeCardsStep = s.cleanup.find((step) => step.kind === 'timeCards');
        if (!timeCardsStep?.cardTypes?.includes(0) || !timeCardsStep.cardTypes.includes(1)) {
            issue(['cleanup'], 'a timeCards cleanup step with cardTypes:[0,1] is required (the crew time-in and time-out)');
        }
        // E2 writes no preference, so unlike D6/D10 it declares no restore. Forbid one so the data cannot claim otherwise.
        if (s.cleanup.some((step) => step.kind === 'restore')) issue(['cleanup'], 'E2 writes no preference — a restore step is not allowed');
    });

export type JourneyE2DailyOvertimeCase = z.infer<typeof JourneyE2DailyOvertimeCaseSchema>;

// E8 (finalize gross pay) reuses E2's crew day on a day of its own, so it satisfies the flow's E2Setup structurally.
// Net = Gross - Meals is trivially true at Meals 0; the three buckets are what make Regular + Overtime + Double = Net real.
export const JourneyE8FinalizeCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        workflow: z.literal('E8'),
        label: z.string().min(1),
        /** E2 owns -14; E8 is -18, inside maximumDaysForTransferExport = 21. */
        dayOffset: z.number().int(),
        rule: z
            .object({
                name: z.string().min(1),
                dailyOvertimeAfterHours: z.number().positive(),
                doubleTimeAfterHours: z.number().positive(),
                overtimeMultiplier: z.number().positive(),
                doubleTimeMultiplier: z.number().positive(),
            })
            .strict(),
        capture: z.object({ timeIn: TimeOfDay, timeOut: TimeOfDay }).strict(),
        expected: z
            .object({
                timeCards: z.number().int().positive(),
                jobCards: z.number().int().positive(),
                employees: z.number().int().positive(),
                pieces: z.number().int().min(0),
                hourlyRate: z.number().positive(),
                grossMinutes: z.number().int().positive(),
                mealMinutes: z.number().int().min(0),
                netMinutes: z.number().int().positive(),
                grossHours: z.number().positive(),
                mealHours: z.number().min(0),
                netHours: z.number().positive(),
                regularHours: z.number().positive(),
                overtimeHours: z.number().positive(),
                doubleTimeHours: z.number().positive(),
                totalAmount: z.number(),
                transferToast: z.object({ jobCards: z.number().int().positive(), timeCards: z.number().int().positive() }).strict(),
                /** The Transfer status badge keyword of a clean row. */
                status: z.string().min(1),
                /** The View > Job Cards Exported cell of an unexported card. */
                exportedCell: z.string().min(1),
                employeesChip: z.string().min(1),
                testFileDescription: z.string().min(1),
            })
            .strict(),
        report: z
            .object({
                name: z.string().min(1),
                reportName: z.string().min(1),
                formats: z.array(z.enum(['excel', 'pdf'])).min(1),
                /** Regex source for the Excel download's suggested filename. */
                excelFilename: z.string().min(1),
            })
            .strict(),
        testFile: z.object({ exportType: z.enum(['payroll', 'cost']) }).strict(),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
        const { capture, expected, rule } = s;

        if (s.dayOffset !== -18) issue(['dayOffset'], 'E8 owns day -18 (Journey B: 0..-9, C: -10, D6: -11, D9: -12, D10: -13, E2: -14)');
        if (s.dayOffset === -14) issue(['dayOffset'], "must not share E2's day -14");
        if (!(minutes(capture.timeIn) < minutes(capture.timeOut))) issue(['capture'], 'timeIn must be before timeOut');

        if (expected.grossMinutes !== minutes(capture.timeOut) - minutes(capture.timeIn)) issue(['expected', 'grossMinutes'], 'must equal timeOut - timeIn');
        if (expected.mealMinutes !== 0) issue(['expected', 'mealMinutes'], 'E2 CREW carries no lunch, and prepareJourneyE2 refuses a crew that does');
        if (expected.netMinutes !== expected.grossMinutes - expected.mealMinutes) issue(['expected', 'netMinutes'], 'must equal grossMinutes - mealMinutes');
        if (expected.grossHours !== expected.grossMinutes / 60) issue(['expected', 'grossHours'], 'must equal grossMinutes / 60');
        if (expected.mealHours !== expected.mealMinutes / 60) issue(['expected', 'mealHours'], 'must equal mealMinutes / 60');
        if (expected.netHours !== expected.netMinutes / 60) issue(['expected', 'netHours'], 'must equal netMinutes / 60');

        if (expected.timeCards !== 2) issue(['expected', 'timeCards'], 'a crew time-in and a crew time-out');
        if (expected.jobCards !== 1) issue(['expected', 'jobCards'], 'one job card for the one crew day');
        if (expected.transferToast.jobCards !== expected.jobCards) issue(['expected', 'transferToast', 'jobCards'], 'must equal expected.jobCards');
        if (expected.transferToast.timeCards !== expected.timeCards) issue(['expected', 'transferToast', 'timeCards'], 'must equal expected.timeCards');

        // The buckets key on net hours, as in E2.
        if (!(expected.netHours > rule.doubleTimeAfterHours)) issue(['expected', 'netHours'], 'netHours must exceed rule.doubleTimeAfterHours or there is no double time to prove');
        if (expected.regularHours !== Math.min(expected.netHours, rule.dailyOvertimeAfterHours)) {
            issue(['expected', 'regularHours'], 'must equal min(netHours, rule.dailyOvertimeAfterHours)');
        }
        if (expected.overtimeHours !== Math.min(expected.netHours, rule.doubleTimeAfterHours) - rule.dailyOvertimeAfterHours) {
            issue(['expected', 'overtimeHours'], 'must equal min(netHours, rule.doubleTimeAfterHours) - rule.dailyOvertimeAfterHours');
        }
        if (expected.doubleTimeHours !== expected.netHours - rule.doubleTimeAfterHours) {
            issue(['expected', 'doubleTimeHours'], 'must equal netHours - rule.doubleTimeAfterHours');
        }
        if (expected.regularHours + expected.overtimeHours + expected.doubleTimeHours !== expected.netHours) {
            issue(['expected'], 'conservation: regularHours + overtimeHours + doubleTimeHours must equal netHours');
        }

        const amount = round2(
            expected.regularHours * expected.hourlyRate +
                expected.overtimeHours * expected.hourlyRate * rule.overtimeMultiplier +
                expected.doubleTimeHours * expected.hourlyRate * rule.doubleTimeMultiplier,
        );
        if (expected.totalAmount !== amount) issue(['expected', 'totalAmount'], `must equal the three buckets at their multipliers (${amount})`);

        if (!s.report.formats.includes('excel')) issue(['report', 'formats'], 'excel is required: it is the report whose filename and size the spec proves');

        const timeCardsStep = s.cleanup.find((step) => step.kind === 'timeCards');
        if (timeCardsStep?.kind !== 'timeCards' || timeCardsStep.dayOffset !== -18) {
            issue(['cleanup'], 'a timeCards cleanup step with dayOffset -18 is required');
        }
        if (s.cleanup.some((step) => step.kind === 'restore')) issue(['cleanup'], 'E8 writes no preference — a restore step is not allowed');
    });

export type JourneyE8FinalizeCase = z.infer<typeof JourneyE8FinalizeCaseSchema>;
