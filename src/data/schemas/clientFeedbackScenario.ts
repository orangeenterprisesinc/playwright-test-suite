import { z } from 'zod';
import { CleanupStepSchema } from './cleanupStep';

// Client-feedback suite (tests/web/client-feedback/<area>/): one ticket, one scenario file.

const Text = z.string().min(1);
const Annotation = z.object({ type: Text, description: Text }).strict();

const Clock = z.object({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) }).strict();
const CfCrew = z.enum(['A', 'B', 'C', 'D']);
const CfDayOffset = z.number().int().min(-21).max(0); // maximumDaysForTransferExport = 21 on dev
const CfSeed = z.object({
    employees: z.array(z.enum(['one', 'two'])).min(1),
    job: z.enum(['hourly', 'piece']).default('hourly'),
    timeIn: Clock,
    timeOut: Clock.optional(),
    pieceOut: z.object({ at: Clock, pieces: z.number().int().positive().max(5) }).strict().optional(), // maximumNumberOfPieces 5 on dev
}).strict();
export type CfSeedSpec = z.infer<typeof CfSeed>;
// One seed step, or several applied in order (a second employee left open, a second crew-day).
const CfSeedSteps = z.union([CfSeed, z.array(CfSeed).min(1)]);
export type CfSeedInput = z.infer<typeof CfSeedSteps>;
const CfExtraCrew = z.object({ fixtureCrew: CfCrew, dayOffset: CfDayOffset, seed: CfSeedSteps }).strict();
const HhMm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const ClientFeedbackBase = z.object({
    _notes: z.array(z.string()).optional(),
    ticket: z.string().regex(/^(WEBPET|PET)-\d+$/),
    customer: Text.optional(),
    screen: z.object({ menuPath: z.array(Text).min(1), url: Text, tab: Text.optional() }).strict(),
    fixtureCrew: CfCrew.optional(),
    dayOffset: CfDayOffset.optional(),
    seed: CfSeedSteps.optional(),
    extraCrews: z.array(CfExtraCrew).min(1).optional(),
    annotations: z.array(Annotation).default([]),
    cleanup: z.array(CleanupStepSchema).default([]),
});

export const TjcPiecesColumnCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3311'),
    expected: z.object({ pickerEntry: Text, columnHeader: Text }).strict(),
}).strict();
export type TjcPiecesColumnCase = z.infer<typeof TjcPiecesColumnCaseSchema>;

export const TjcTotalsLoadCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3064'),
    fixtureCrew: CfCrew,
    dayOffset: CfDayOffset,
    seed: CfSeed,
    expected: z.object({
        caption: Text,
        loadWithinMs: z.number().int().positive(),
        labels: z.array(Text).length(5),
        exact: z.record(Text, Text),
        positive: z.array(Text).min(1),
        unavailableText: Text,
    }).strict(),
}).strict();
export type TjcTotalsLoadCase = z.infer<typeof TjcTotalsLoadCaseSchema>;

const TjcScoped = { fixtureCrew: CfCrew, dayOffset: CfDayOffset, seed: CfSeedSteps };

// ── Cluster 1, part A: layout, time window, report dialog (3183 / 3431 / 3829 / 3835 / 3830) ──

export const TjcDateControlCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3183'),
    ...TjcScoped,
    expected: z.object({ dateColumn: Text, filteredColumn: Text }).strict(),
}).strict();
export type TjcDateControlCase = z.infer<typeof TjcDateControlCaseSchema>;

export const TjcTimeWindowCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3431'),
    expected: z.object({ defaultBegin: HhMm, defaultEnd: HhMm, pickedEnd: HhMm }).strict(),
}).strict();
export type TjcTimeWindowCase = z.infer<typeof TjcTimeWindowCaseSchema>;

export const TjcReportSelectionCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3829'),
    ...TjcScoped,
    expected: z.object({
        titlePrefix: Text,
        minReportOptions: z.number().int().min(2),
        paramTestIdPrefix: Text,
        displayReportLabel: Text,
    }).strict(),
}).strict();
export type TjcReportSelectionCase = z.infer<typeof TjcReportSelectionCaseSchema>;

export const TjcReportCloseXCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3835'),
    expected: z.object({
        titlePrefix: Text,
        buttonRowIncludes: z.array(Text).min(1),
        absentButton: Text,
        cornerTolerancePx: z.number().int().positive(),
    }).strict(),
}).strict();
export type TjcReportCloseXCase = z.infer<typeof TjcReportCloseXCaseSchema>;

export const TjcIssuesPanelCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3830'),
    ...TjcScoped,
    expected: z.object({
        issueGroup: Text,
        affected: z.number().int().positive(),
        tolerancePx: z.number().int().nonnegative(),
    }).strict(),
}).strict();
export type TjcIssuesPanelCase = z.infer<typeof TjcIssuesPanelCaseSchema>;

// ── Cluster 1, part B: grid filters, status pill, Single select, issue click (3433 / 3834 / 2986 / 3831) ──

export const TjcColumnFilterCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3433'),
    ...TjcScoped,
    expected: z.object({
        column: Text,
        filterText: Text,
        matchText: Text,
        analyzedCaption: Text,
        filteredCaption: Text,
        filtered: z.number().int().positive(),
    }).strict(),
}).strict();
export type TjcColumnFilterCase = z.infer<typeof TjcColumnFilterCaseSchema>;

export const TjcStatusPillCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3834'),
    ...TjcScoped,
    expected: z.object({
        pill: z.enum(['ready', 'blocking', 'warnings', 'deferred']),
        status: Text,
        pillCount: z.number().int().positive(),
        analyzedCaption: Text,
        filteredCaption: Text,
        otherStatus: Text,
    }).strict(),
}).strict();
export type TjcStatusPillCase = z.infer<typeof TjcStatusPillCaseSchema>;

export const TjcSingleSelectCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-2986'),
    ...TjcScoped,
    extraCrews: z.array(CfExtraCrew).length(1),
    expected: z.object({
        filters: z.array(z.object({ kind: z.enum(['Work Crew', 'Employee']), column: Text, allLabel: Text }).strict()).length(2),
        analyzed: z.number().int().positive(),
        analyzedCaption: Text,
    }).strict(),
}).strict();
export type TjcSingleSelectCase = z.infer<typeof TjcSingleSelectCaseSchema>;

export const TjcIssueClickCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3831'),
    ...TjcScoped,
    expected: z.object({
        issueCode: Text,
        issueLabel: Text,
        affected: z.number().int().positive(),
        decoration: Text,
        affectedCard: z.object({ employee: z.enum(['one', 'two']), kind: z.enum(['timeIn', 'timeOut']) }).strict(),
    }).strict(),
}).strict();
export type TjcIssueClickCase = z.infer<typeof TjcIssueClickCaseSchema>;
