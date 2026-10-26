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
        // E2 writes no preference but does set the job's rule and rate on the Job form, so it must put them back.
        if (!s.cleanup.some((step) => step.kind === 'restore' && step.target === 'e2JobRuleAndRate')) {
            issue(['cleanup'], "a restore step for 'e2JobRuleAndRate' is required — E2 changes the job's overtime rule and hourly rate");
        }
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
        if (!s.cleanup.some((step) => step.kind === 'restore' && step.target === 'e2JobRuleAndRate')) {
            issue(['cleanup'], "a restore step for 'e2JobRuleAndRate' is required — E8 changes the job's overtime rule and hourly rate");
        }
    });

export type JourneyE8FinalizeCase = z.infer<typeof JourneyE8FinalizeCaseSchema>;

// E11 (reverse export) transfers E2's crew day on day -20 with its own job, exports it, reverses the run, corrects the
// card's Field and exports again. It satisfies the flow's E2Setup structurally. Gross <= the daily threshold: no overtime.
export const JourneyE11ReverseExportCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        workflow: z.literal('E11'),
        label: z.string().min(1),
        /** E8 owns -18; E11 is -20, inside maximumDaysForTransferExport = 21. */
        dayOffset: z.number().int(),
        /** Typed into E11 JOB's comma-separated earning-code field on its Job form on every run (catalog A3). */
        job: z.object({ earningCodes: z.string().min(1) }).strict(),
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
                hourlyRate: z.number().positive(),
                mealMinutes: z.number().int().min(0),
                grossHours: z.number().positive(),
                regularHours: z.number().positive(),
                overtimeHours: z.number().min(0),
                doubleTimeHours: z.number().min(0),
                totalAmount: z.number(),
                transferToast: z.object({ jobCards: z.number().int().positive(), timeCards: z.number().int().positive() }).strict(),
                exportedNo: z.string().min(1),
                exportedYes: z.string().min(1),
            })
            .strict(),
        export: z
            .object({
                type: z.enum(['Payroll', 'Cost Accounting']),
                candidateStatus: z.string().min(1),
                destination: z.string().min(1),
                runCreatedToast: z.string().min(1),
                nothingToExport: z.string().min(1),
            })
            .strict(),
        reverse: z
            .object({
                type: z.string().min(1),
                performedBy: z.string().min(1),
                /** `{n}` is the job-card count. */
                prompt: z.string().min(1),
                confirmButton: z.string().min(1),
            })
            .strict(),
        /** Keys of the Journey B fixture's entities: the card moves from `fromField` to `toField`. */
        correction: z.object({ fromField: z.enum(['field', 'field2']), toField: z.enum(['field', 'field2']) }).strict(),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
        const { capture, expected, rule } = s;

        if (s.dayOffset !== -20) issue(['dayOffset'], 'E11 owns day -20 (E2: -14, E8: -18)');
        if (!(minutes(capture.timeIn) < minutes(capture.timeOut))) issue(['capture'], 'timeIn must be before timeOut');
        if (expected.mealMinutes !== 0) issue(['expected', 'mealMinutes'], 'E2 CREW carries no lunch, and prepareJourneyE2 refuses a crew that does');
        if (expected.grossHours !== (minutes(capture.timeOut) - minutes(capture.timeIn)) / 60) issue(['expected', 'grossHours'], 'must equal (timeOut - timeIn) / 60');
        if (expected.timeCards !== 2) issue(['expected', 'timeCards'], 'a crew time-in and a crew time-out');
        if (expected.jobCards !== 1) issue(['expected', 'jobCards'], 'one job card for the one crew day');
        if (expected.transferToast.jobCards !== expected.jobCards) issue(['expected', 'transferToast', 'jobCards'], 'must equal expected.jobCards');
        if (expected.transferToast.timeCards !== expected.timeCards) issue(['expected', 'transferToast', 'timeCards'], 'must equal expected.timeCards');

        if (!(expected.grossHours <= rule.dailyOvertimeAfterHours)) issue(['expected', 'grossHours'], 'must not exceed rule.dailyOvertimeAfterHours: E11 carries no overtime');
        if (expected.regularHours !== Math.min(expected.grossHours, rule.dailyOvertimeAfterHours)) issue(['expected', 'regularHours'], 'must equal min(grossHours, rule.dailyOvertimeAfterHours)');
        if (expected.overtimeHours !== 0) issue(['expected', 'overtimeHours'], 'must be 0');
        if (expected.doubleTimeHours !== 0) issue(['expected', 'doubleTimeHours'], 'must be 0');
        if (expected.totalAmount !== round2(expected.regularHours * expected.hourlyRate)) issue(['expected', 'totalAmount'], 'must equal regularHours x hourlyRate');

        if (s.correction.fromField === s.correction.toField) issue(['correction'], 'the correction must change the Field');

        const timeCardsStep = s.cleanup.find((step) => step.kind === 'timeCards');
        if (timeCardsStep?.kind !== 'timeCards' || timeCardsStep.dayOffset !== -20) issue(['cleanup'], 'a timeCards cleanup step with dayOffset -20 is required');
        if (!s.cleanup.some((step) => step.kind === 'restore' && step.target === 'e2JobRuleAndRate')) {
            issue(['cleanup'], "a restore step for 'e2JobRuleAndRate' is required — E11 changes the job's overtime rule and hourly rate");
        }
    });

export type JourneyE11ReverseExportCase = z.infer<typeof JourneyE11ReverseExportCaseSchema>;

// E13 (department and multi-state overtime split): two jobs on two wage-order rules, one day, no overtime.
// Thresholds live in the fixture, so the checks that need them (per-job hours under the threshold, pooled
// contrast) run in the flow; here the scenario is made to agree with itself.
const E13Bucket = z
    .object({
        hours: z.number().positive(),
        regular: z.number().min(0),
        overtime: z.number().min(0),
        double: z.number().min(0),
        amount: z.number(),
    })
    .strict();

export const JourneyE13WageOrderSplitCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        workflow: z.literal('E13'),
        label: z.string().min(1),
        /** E2 -14, E8 -18; E13 sits on the edge of maximumDaysForTransferExport = 21. */
        dayOffset: z.number().int(),
        hourlyRate: z.number().positive(),
        overtimeMultiplier: z.number().positive(),
        doubleTimeMultiplier: z.number().positive(),
        segments: z.array(z.object({ job: z.enum(['jobA', 'jobB']), start: TimeOfDay }).strict()).length(2),
        timeOut: TimeOfDay,
        /** Expected values of the environment gates; read, never written. */
        gates: z.object({ groupOvertimeByWageOrder: z.string().min(1), payOvertimeBasedOnWeeklyAvg: z.string().min(1) }).strict(),
        preferenceLabels: z.object({ groupByWageOrder: z.string().min(1) }).strict(),
        expected: z
            .object({
                timeCards: z.number().int().positive(),
                jobCards: z.number().int().positive(),
                status: z.string().min(1),
                perJob: z.object({ jobA: E13Bucket, jobB: E13Bucket }).strict(),
                totals: z
                    .object({
                        gross: z.number().positive(),
                        regular: z.number().min(0),
                        overtime: z.number().min(0),
                        double: z.number().min(0),
                        amount: z.number(),
                    })
                    .strict(),
                /** What a single pooled daily bucket would read; the split must NOT show this. */
                pooledContrast: z.object({ regular: z.number(), overtime: z.number(), double: z.number(), amount: z.number() }).strict(),
                transferToast: z.object({ jobCards: z.number().int().positive(), timeCards: z.number().int().positive() }).strict(),
            })
            .strict(),
        /** Pushed by the flow: what the workflow deliberately does not run, and why. */
        annotations: z.array(z.object({ type: z.string().min(1), description: z.string().min(1) }).strict()).default([]),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
        const { expected, segments } = s;

        if (s.dayOffset !== -21) issue(['dayOffset'], 'E13 owns day -21 (E2: -14, E8: -18), the edge of maximumDaysForTransferExport = 21');
        if (segments[0].job === segments[1].job) issue(['segments'], 'the two segments must be on different jobs');

        const spans = segments.map((seg, i) => {
            const end = segments[i + 1]?.start ?? s.timeOut;
            return (minutes(end) - minutes(seg.start)) / 60;
        });
        if (spans.some((h) => !(h > 0))) issue(['segments'], 'segment starts must increase and end before timeOut');

        let total = 0;
        segments.forEach((seg, i) => {
            const bucket = expected.perJob[seg.job];
            total += spans[i];
            if (bucket.hours !== spans[i]) issue(['expected', 'perJob', seg.job, 'hours'], `must equal the segment span (${spans[i]})`);
            if (bucket.regular !== bucket.hours || bucket.overtime !== 0 || bucket.double !== 0) {
                issue(['expected', 'perJob', seg.job], 'the split exists to keep each wage order all-regular: regular = hours, overtime 0, double 0');
            }
            if (bucket.amount !== round2(bucket.hours * s.hourlyRate)) issue(['expected', 'perJob', seg.job, 'amount'], 'must equal hours x hourlyRate');
        });

        const { totals, pooledContrast: pooled } = expected;
        const sum = (pick: (b: z.infer<typeof E13Bucket>) => number) => pick(expected.perJob.jobA) + pick(expected.perJob.jobB);
        if (totals.gross !== total || totals.gross !== sum((b) => b.hours)) issue(['expected', 'totals', 'gross'], 'must equal the sum of both jobs');
        if (totals.regular !== sum((b) => b.regular)) issue(['expected', 'totals', 'regular'], 'must equal the sum of both jobs');
        if (totals.overtime !== sum((b) => b.overtime)) issue(['expected', 'totals', 'overtime'], 'must equal the sum of both jobs');
        if (totals.double !== sum((b) => b.double)) issue(['expected', 'totals', 'double'], 'must equal the sum of both jobs');
        if (totals.amount !== sum((b) => b.amount)) issue(['expected', 'totals', 'amount'], 'must equal the sum of both jobs');

        if (pooled.regular + pooled.overtime + pooled.double !== total) issue(['expected', 'pooledContrast'], 'conservation: the pooled buckets must add up to the day total');
        if (!(pooled.overtime > 0)) issue(['expected', 'pooledContrast', 'overtime'], 'pooling must create overtime, or the split proves nothing');
        const pooledAmount = round2(
            pooled.regular * s.hourlyRate + pooled.overtime * s.hourlyRate * s.overtimeMultiplier + pooled.double * s.hourlyRate * s.doubleTimeMultiplier,
        );
        if (pooled.amount !== pooledAmount) issue(['expected', 'pooledContrast', 'amount'], `must equal the pooled buckets at their multipliers (${pooledAmount})`);

        if (expected.timeCards !== segments.length + 1) issue(['expected', 'timeCards'], 'one crew time-in per segment plus the crew time-out');
        if (expected.jobCards !== segments.length) issue(['expected', 'jobCards'], 'one job card per segment');
        if (expected.transferToast.jobCards !== expected.jobCards) issue(['expected', 'transferToast', 'jobCards'], 'must equal expected.jobCards');
        if (expected.transferToast.timeCards !== expected.timeCards) issue(['expected', 'transferToast', 'timeCards'], 'must equal expected.timeCards');

        const timeCardsStep = s.cleanup.find((step) => step.kind === 'timeCards');
        if (timeCardsStep?.kind !== 'timeCards' || timeCardsStep.dayOffset !== -21) {
            issue(['cleanup'], 'a timeCards cleanup step with dayOffset -21 is required');
        }
    });

export type JourneyE13WageOrderSplitCase = z.infer<typeof JourneyE13WageOrderSplitCaseSchema>;

// E6 (decimal-rounding reconciliation): one 8-hour crew day in three 160-minute jobs, transferred at each
// Time Decimal Accuracy. 160/60 repeats, so no precision holds the three cards exactly: the first two round
// half-up and the last card carries the difference. The refinements recompute that arithmetic so the data
// cannot drift out of agreement with itself.

const roundHalfUp = (n: number, places: number): number => Math.round((n + Number.EPSILON) * 10 ** places) / 10 ** places;

export const JourneyE6RoundingCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        workflow: z.literal('E6'),
        label: z.string().min(1),
        /** Journey B 0..-9, C -10, D6 -11, D9 -12, D10 -13, E2 -14, D5 -16, E8 -18; E6 is -19, inside maximumDaysForTransferExport = 21. */
        dayOffset: z.number().int(),
        rule: z
            .object({
                name: z.string().min(1),
                dailyOvertimeAfterHours: z.number().positive(),
                doubleTimeAfterHours: z.number().positive(),
            })
            .strict(),
        /** Mirrors the fixture jobs' rate; amounts are evidence only (money rounding is a separate preference). */
        hourlyRate: z.number().positive(),
        /** Each segment runs from its start to the next start; the last runs to `timeOut`. */
        segments: z.array(z.object({ job: z.enum(['jobA', 'jobB', 'jobC']), start: TimeOfDay }).strict()).min(2),
        timeOut: TimeOfDay,
        baselinePrecision: z.number().int().min(2).max(4),
        passes: z
            .array(z.object({ precision: z.number().int().min(2).max(4), cardHours: z.array(z.number()).min(1) }).strict())
            .min(1),
        expected: z
            .object({
                timeCards: z.number().int().positive(),
                jobCards: z.number().int().positive(),
                dayHours: z.number().positive(),
                overtimeHours: z.number().min(0),
                doubleTimeHours: z.number().min(0),
                transferToast: z.object({ jobCards: z.number().int().positive(), timeCards: z.number().int().positive() }).strict(),
                /** The Transfer status badge keyword of a clean row. */
                status: z.string().min(1),
                roundJobChange: z.boolean(),
                reverseDialog: z.object({ title: z.string().min(1), text: z.string().min(1) }).strict(),
            })
            .strict(),
        preferenceLabels: z
            .object({
                section: z.string().min(1),
                timeDecimalAccuracy: z.string().min(1),
                roundingSection: z.string().min(1),
                roundJobChange: z.string().min(1),
                /** Recorded as evidence only. */
                roundingMinutes: z.string().min(1),
                roundingType: z.string().min(1),
            })
            .strict(),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
        const { expected } = s;

        if (s.dayOffset !== -19) issue(['dayOffset'], 'E6 owns day -19 (E2 is -14, D5 -16, E8 -18)');

        const starts = s.segments.map((g) => minutes(g.start));
        const lengths = [...starts.slice(1), minutes(s.timeOut)].map((end, i) => end - starts[i]);
        if (lengths.some((m) => m <= 0)) issue(['segments'], 'segment starts must be strictly increasing and before timeOut');
        if (new Set(s.segments.map((g) => g.job)).size !== s.segments.length) issue(['segments'], 'every segment must be a different job');

        if (expected.timeCards !== s.segments.length + 1) issue(['expected', 'timeCards'], 'one crew time-in per segment plus the crew time-out');
        if (expected.jobCards !== s.segments.length) issue(['expected', 'jobCards'], 'one job card per segment');
        if (expected.transferToast.jobCards !== expected.jobCards) issue(['expected', 'transferToast', 'jobCards'], 'must equal expected.jobCards');
        if (expected.transferToast.timeCards !== expected.timeCards) issue(['expected', 'transferToast', 'timeCards'], 'must equal expected.timeCards');

        const sumMinutes = lengths.reduce((a, b) => a + b, 0);
        if (sumMinutes / 60 !== expected.dayHours) issue(['expected', 'dayHours'], `must equal the segments' minutes / 60 (${sumMinutes / 60})`);
        if (!(expected.dayHours <= s.rule.dailyOvertimeAfterHours)) {
            issue(['expected', 'dayHours'], 'must not exceed rule.dailyOvertimeAfterHours, or overtime 0 is not the honest expectation');
        }
        if (expected.overtimeHours !== 0 || expected.doubleTimeHours !== 0) issue(['expected'], 'an eight-hour day has no overtime or double time');

        if (s.passes[0].precision !== s.baselinePrecision) issue(['passes', 0, 'precision'], 'the first pass runs at the tenant baseline, before anything is written');
        if (JSON.stringify(s.passes.map((p) => p.precision).sort()) !== JSON.stringify([2, 3, 4])) issue(['passes'], 'the passes must cover exactly the precisions 2, 3 and 4');

        const last = lengths.length - 1;
        s.passes.forEach((pass, p) => {
            const places = pass.precision;
            if (pass.cardHours.length !== lengths.length) {
                issue(['passes', p, 'cardHours'], `must have one entry per segment (${lengths.length})`);
                return;
            }
            const want = lengths.map((m) => roundHalfUp(m / 60, places));
            // The correction: the last card is the day minus what the others already took.
            want[last] = roundHalfUp(expected.dayHours - want.slice(0, last).reduce((a, b) => a + b, 0), places);
            pass.cardHours.forEach((hours, i) => {
                if (hours !== want[i]) issue(['passes', p, 'cardHours', i], `must be ${want[i]} (segments round half-up at ${places} dp, the last card takes the difference)`);
            });
            if (roundHalfUp(pass.cardHours.reduce((a, b) => a + b, 0), places) !== expected.dayHours) {
                issue(['passes', p, 'cardHours'], `must sum to ${expected.dayHours} at ${places} dp`);
            }
            if (!lengths.some((m) => roundHalfUp(m / 60, places) !== m / 60)) {
                issue(['passes', p], `at ${places} dp every segment is exact, so there is no rounding to reconcile`);
            }
        });

        const timeCardsStep = s.cleanup.find((step) => step.kind === 'timeCards');
        if (timeCardsStep?.kind !== 'timeCards' || timeCardsStep.dayOffset !== -19) issue(['cleanup'], 'a timeCards cleanup step with dayOffset -19 is required');
        if (!s.cleanup.some((step) => step.kind === 'restore' && step.target === 'timeDecimalRounding')) {
            issue(['cleanup'], "a restore step for 'timeDecimalRounding' is required — E6 changes the tenant's Time Decimal Accuracy");
        }
    });

export type JourneyE6RoundingCase = z.infer<typeof JourneyE6RoundingCaseSchema>;
