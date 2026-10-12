import { z } from 'zod';
import { CleanupStepSchema } from './cleanupStep';

// Journey E (weekly payroll close and export). E2 is California daily overtime: one crew day
// (a time-in and a time-out, one job card) is split by the engine into three paid buckets —
// the first eight net hours regular, hours eight to ten at time-and-a-half, the rest at double.
// The refinements encode the plan's arithmetic so the data cannot drift out of agreement with
// itself. Every derivation keys on NET hours (gross minus the unpaid meal), never on gross.

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
                mealMinutes: z.number().int().positive(),
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

        // The day: gross is the span, the meal is deducted once, net is what remains.
        if (expected.grossMinutes !== minutes(capture.timeOut) - minutes(capture.timeIn)) {
            issue(['expected', 'grossMinutes'], 'must equal timeOut - timeIn');
        }
        if (!(expected.mealMinutes > 0)) issue(['expected', 'mealMinutes'], 'a zero meal describes a different environment — fail rather than pass silently');
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
