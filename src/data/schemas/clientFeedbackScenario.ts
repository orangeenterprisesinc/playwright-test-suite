import { z } from 'zod';
import { CleanupStepSchema } from './cleanupStep';

// Client-feedback suite (tests/web/client-feedback/<area>/): one ticket, one scenario file.

const Text = z.string().min(1);
const Annotation = z.object({ type: Text, description: Text }).strict();

const Clock = z.object({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) }).strict();
// A card after midnight of the shift that starts on the step's day (WEBPET-3314's overnight shape); seedCrewDay files it on day + 1.
const SeedClock = z.object({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59), nextDay: z.boolean().optional() }).strict();
const CfEmployeePieceOut = z.object({ employee: z.enum(['one', 'two']), at: SeedClock, pieces: z.number().int().positive().max(5) }).strict();
const CfCrew = z.enum(['A', 'B', 'C', 'D']);
const CfDayOffset = z.number().int().min(-21).max(0); // maximumDaysForTransferExport = 21 on dev
const CfSeed = z.object({
    employees: z.array(z.enum(['one', 'two'])).min(1),
    job: z.enum(['hourly', 'piece', 'paidBreak', 'meal', 'own']).default('hourly'), // 'own' = the job the spec created on screen (run.ownJob)
    phase: Text.optional(), // a tenant Phase by name instead of run.jobs[job] (WEBPET-3491's '0 - Lunch')
    timeIn: Clock,
    timeOut: SeedClock.optional(),
    pieceOut: z.object({ at: SeedClock, pieces: z.number().int().positive().max(5) }).strict().optional(), // maximumNumberOfPieces 5 on dev
    lunch: z.object({ job: Text, at: Clock, backAt: Clock }).strict().optional(), // meal punch: Time In on the lunch job, then back on the step's job
    employeePieceOut: z.union([CfEmployeePieceOut, z.array(CfEmployeePieceOut).min(1)]).optional(), // Transfer ▸ New record ▸ Add Piece-out
}).strict();
export type CfSeedSpec = z.infer<typeof CfSeed>;
// One seed step, or several applied in order (a second employee left open, a second crew-day).
const CfSeedSteps = z.union([CfSeed, z.array(CfSeed).min(1)]);
export type CfSeedInput = z.infer<typeof CfSeedSteps>;
const CfExtraCrew = z.object({ fixtureCrew: CfCrew, dayOffset: CfDayOffset, seed: CfSeedSteps }).strict();
// A day the scenario claims for isolation and the before-sweep, with nothing seeded on it of its own.
const CfClaimedDay = z.object({ fixtureCrew: CfCrew, dayOffset: CfDayOffset }).strict();
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

// ── Cluster 2, part A: commit, piece-outs, Job Cards tab (2982 / 3426 / 2954 / 3184 / 2906) ──

export const TjcHidePieceOutsCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-2982'),
    ...TjcScoped,
    expected: z.object({
        analyzedCaption: Text,
        hiddenCaption: Text,
        pieces: z.number().positive(),
        pieceOutType: Text,
        pieceOutRows: z.number().int().positive(),
        analyzeRequestsOnToggle: z.number().int().nonnegative(),
    }).strict(),
}).strict();
export type TjcHidePieceOutsCase = z.infer<typeof TjcHidePieceOutsCaseSchema>;

export const TjcWarningsCollapseCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3426'),
    ...TjcScoped,
    viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
    expected: z.object({
        bannerText: Text,
        showLabel: Text,
        hideLabel: Text,
        tableMinHeight: Text,
        minRows: z.number().int().positive(),
        rowHeightPx: z.number().int().positive(),
        listOverflowY: Text,
        listMaxHeight: Text,
        listItems: z.number().int().positive(),
    }).strict(),
}).strict();
export type TjcWarningsCollapseCase = z.infer<typeof TjcWarningsCollapseCaseSchema>;

export const TjcReverseAfterTransferCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-2954'),
    ...TjcScoped,
    expected: z.object({ jobCards: z.number().int().positive(), reversedToast: Text, transferred: Text }).strict(),
}).strict();
export type TjcReverseAfterTransferCase = z.infer<typeof TjcReverseAfterTransferCaseSchema>;

export const TjcTransferCompletesCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3184'),
    ...TjcScoped,
    expected: z.object({ jobCards: z.number().int().positive(), errorText: Text, gridCount: Text }).strict(),
}).strict();
export type TjcTransferCompletesCase = z.infer<typeof TjcTransferCompletesCaseSchema>;

export const TjcDeleteUntransfersCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-2906'),
    ...TjcScoped,
    expected: z.object({
        jobCards: z.number().int().positive(),
        deleteConfirmSuffix: Text,
        transferred: Text,
        pieces: z.number().positive(),
        pieceOutType: Text,
        pieceOuts: z.array(z.object({ employee: Text, pieces: Text }).strict()).min(2),
    }).strict(),
}).strict();
export type TjcDeleteUntransfersCase = z.infer<typeof TjcDeleteUntransfersCaseSchema>;

// ── Cluster 2, part B: Crew In sheet + Time In edit (3301 / 3283 / 3575 / PET-12942) ──

const CrewInCreated = { rosterStatus: Text, status: Text, created: z.number().int().positive(), time: Text, type: Text, job: Text, ranch: Text, field: Text };

export const TjcCrewInLunchCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3301'),
    fixtureCrew: CfCrew,
    dayOffset: CfDayOffset,
    crewIn: z.object({ at: HhMm, phase: Text }).strict(),
    expected: z.object({ ...CrewInCreated, errorText: Text }).strict(),
}).strict();
export type TjcCrewInLunchCase = z.infer<typeof TjcCrewInLunchCaseSchema>;

export const TjcCrewInLabelsCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3283'),
    fixtureCrew: CfCrew,
    expected: z.object({ rosterStatus: Text, labels: z.array(Text).min(2), nameOnly: z.array(Text).min(2) }).strict(),
}).strict();
export type TjcCrewInLabelsCase = z.infer<typeof TjcCrewInLabelsCaseSchema>;

export const TjcCrewInInheritCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3575'),
    ...TjcScoped,
    crewIn: z.object({ at: HhMm }).strict(),
    expected: z.object({ ...CrewInCreated, phaseName: Text, phaseAlias: Text, phaseListed: z.array(z.boolean()).length(2) }).strict(),
}).strict();
export type TjcCrewInInheritCase = z.infer<typeof TjcCrewInInheritCaseSchema>;

export const TjcEditTimeInCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('PET-12942'),
    ...TjcScoped,
    edit: z.object({ employee: z.enum(['one', 'two']), to: HhMm }).strict(),
    expected: z.object({ unsaved: Text, savedToast: Text, errorText: Text, time: Text }).strict(),
}).strict();
export type TjcEditTimeInCase = z.infer<typeof TjcEditTimeInCaseSchema>;

// ── Cluster 3, part A: View ▸ Time Cards (3138 / 3133 / 3573 / 3819 / 3889 / 3890) ──

const Rows = z.number().int().positive();

export const VtcCarryOverCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3138'),
    ...TjcScoped,
    expected: z.object({ rows: Rows, criterionLine: Text, hideLabel: Text, showLabel: Text, pickerColumns: z.array(Text).min(2), toggleColumn: Text }).strict(),
}).strict();
export type VtcCarryOverCase = z.infer<typeof VtcCarryOverCaseSchema>;

export const VtcPunchOrderCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3133'),
    ...TjcScoped,
    expected: z.object({ rows: Rows, sortColumn: Text, sequence: z.array(z.object({ time: Text, type: Text }).strict()).min(3) }).strict(),
}).strict();
export type VtcPunchOrderCase = z.infer<typeof VtcPunchOrderCaseSchema>;

export const VtcSortPlusDblClickCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3573'),
    ...TjcScoped,
    expected: z.object({
        rows: Rows,
        order: z.array(z.object({ employee: z.enum(['one', 'two']), time: Text }).strict()).min(4),
        sheetTitle: Text,
        openTime: HhMm,
        absentBanner: Text,
    }).strict(),
}).strict();
export type VtcSortPlusDblClickCase = z.infer<typeof VtcSortPlusDblClickCaseSchema>;

export const VtcReportWithCrewCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3819'),
    ...TjcScoped,
    expected: z.object({ rows: Rows, criterionLine: Text, blockedMessage: Text, titlePrefix: Text }).strict(),
}).strict();
export type VtcReportWithCrewCase = z.infer<typeof VtcReportWithCrewCaseSchema>;

export const VtcMultiDeleteCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3889'),
    ...TjcScoped,
    expected: z.object({ rows: Rows, confirmHeading: Text, confirmText: Text, toast: Text }).strict(),
}).strict();
export type VtcMultiDeleteCase = z.infer<typeof VtcMultiDeleteCaseSchema>;

export const VtcRowTrashCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3890'),
    ...TjcScoped,
    expected: z.object({ rows: Rows, confirmHeading: Text, confirmText: Text, toast: Text }).strict(),
}).strict();
export type VtcRowTrashCase = z.infer<typeof VtcRowTrashCaseSchema>;

// ── Cluster 3, part B: Multi Update / Reverse Multi Edit / Job Cards Multi Edit (3895 / 3181 / 3180 / 3574 / 3484) ──

export const VtcMuFieldsCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3895'),
    ...TjcScoped,
    expected: z.object({ rows: Rows, updateLabel: Text, fields: z.array(Text).min(5) }).strict(),
}).strict();
export type VtcMuFieldsCase = z.infer<typeof VtcMuFieldsCaseSchema>;

export const VtcMuEmployeeTypeCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3181'),
    ...TjcScoped,
    expected: z.object({ rows: Rows, field: Text, typed: Text, options: z.array(Text).min(1), notFound: Text }).strict(),
}).strict();
export type VtcMuEmployeeTypeCase = z.infer<typeof VtcMuEmployeeTypeCaseSchema>;

export const VtcMuEmployeeLabelCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3180'),
    ...TjcScoped,
    expected: z.object({ rows: Rows, field: Text, ownLabels: z.array(Text).length(2), labelPattern: Text }).strict(),
}).strict();
export type VtcMuEmployeeLabelCase = z.infer<typeof VtcMuEmployeeLabelCaseSchema>;

export const VtcReverseMultiEditCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3574'),
    ...TjcScoped,
    expected: z.object({
        rows: Rows,
        field: Text,
        value: Text,
        fieldName: Text,
        recordType: Text,
        toast: Text,
        active: Text,
        undone: Text,
        undoText: Text,
    }).strict(),
}).strict();
export type VtcReverseMultiEditCase = z.infer<typeof VtcReverseMultiEditCaseSchema>;

export const VjcExportedMultiEditCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3484'),
    ...TjcScoped,
    expected: z.object({
        jobCards: z.number().int().positive(),
        field: Text,
        values: z.array(Text).length(2),
        set: Text,
        restore: Text,
        review: Text,
        toast: Text,
        column: Text,
        deleteConfirmSuffix: Text,
    }).strict(),
}).strict();
export type VjcExportedMultiEditCase = z.infer<typeof VjcExportedMultiEditCaseSchema>;

// ── Cluster 4A: Export to Accounting screen-only (3712 / 3713 / 3714 / 3715 / 3716 / 3492 / 3930) ──

const EtaCounts = { jobCards: Rows, matched: Text, exportLabel: Text, jobCardsLine: Text };

export const EtaNoTotalLineCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3712'),
    ...TjcScoped,
    expected: z.object({ jobCards: Rows, totalLine: Text, needsReexport: z.number().int().nonnegative(), warnings: z.number().int().nonnegative() }).strict(),
}).strict();
export type EtaNoTotalLineCase = z.infer<typeof EtaNoTotalLineCaseSchema>;

export const EtaMultiEditCheckboxesCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3713'),
    ...TjcScoped,
    expected: z.object({ jobCards: Rows, updateLabel: Text }).strict(),
}).strict();
export type EtaMultiEditCheckboxesCase = z.infer<typeof EtaMultiEditCheckboxesCaseSchema>;

export const EtaRowDrawerCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3714'),
    ...TjcScoped,
    expected: z.object({ jobCards: Rows, side: Text, fieldLabels: z.array(Text).min(6), crew: Text, matched: Text }).strict(),
}).strict();
export type EtaRowDrawerCase = z.infer<typeof EtaRowDrawerCaseSchema>;

export const EtaNoScopeAdjustmentsCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3715'),
    expected: z.object({ absent: z.array(Text).length(2), firstItems: z.array(Text).length(3) }).strict(),
}).strict();
export type EtaNoScopeAdjustmentsCase = z.infer<typeof EtaNoScopeAdjustmentsCaseSchema>;

export const EtaCountEqualsExportCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3716'),
    ...TjcScoped,
    expected: z.object(EtaCounts).strict(),
}).strict();
export type EtaCountEqualsExportCase = z.infer<typeof EtaCountEqualsExportCaseSchema>;

export const EtaCountNoScrollCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3492'),
    ...TjcScoped,
    expected: z.object(EtaCounts).strict(),
}).strict();
export type EtaCountNoScrollCase = z.infer<typeof EtaCountNoScrollCaseSchema>;

export const EtaTotalsAboveGridCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3930'),
    ...TjcScoped,
    expected: z.object({ jobCards: Rows, stripLabels: z.array(Text).min(3), totalsLabels: z.array(Text).min(4) }).strict(),
}).strict();
export type EtaTotalsAboveGridCase = z.infer<typeof EtaTotalsAboveGridCaseSchema>;

// ── Cluster 4B: Save export file dialog and Test File name (3464 / 3931 / 3938); nothing is exported ──

const EtaSaveDialogBase = { jobCards: Rows, fileName: Text, discardConfirm: Text, discardWarning: Text, candidateStatus: Text };

export const EtaRenameBeforeSaveCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3464'),
    ...TjcScoped,
    expected: z.object({ ...EtaSaveDialogBase, title: Text, folderLine: Text, saveAsLabel: Text, newName: Text }).strict(),
}).strict();
export type EtaRenameBeforeSaveCase = z.infer<typeof EtaRenameBeforeSaveCaseSchema>;

export const EtaTestFileNameCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3931'),
    ...TjcScoped,
    expected: z.object({ jobCards: Rows, fileName: Text, legacyPrefix: Text, recordsWritten: Text, matched: Text }).strict(),
}).strict();
export type EtaTestFileNameCase = z.infer<typeof EtaTestFileNameCaseSchema>;

export const EtaCopyFileNameCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3938'),
    ...TjcScoped,
    expected: z.object({ ...EtaSaveDialogBase, copyLabel: Text, copied: Text }).strict(),
}).strict();
export type EtaCopyFileNameCase = z.infer<typeof EtaCopyFileNameCaseSchema>;

// ── Cluster 5A: Setup screens and report PDFs (3424 / 3425 / 3577 / 3701 / 3703) ──

const CfWho = z.enum(['one', 'two']);

export const SetupRanchReportFilterCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3424'),
    filter: z.object({ column: Text, value: Text }).strict(),
    expected: z.object({ rows: Rows, dialogTitlePrefix: Text, filterLine: Text, reportTitle: Text, rowMarker: Text }).strict(),
}).strict();
export type SetupRanchReportFilterCase = z.infer<typeof SetupRanchReportFilterCaseSchema>;

export const SetupEmployeeAddFieldsCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3425'),
    expected: z.object({ caption: Text, rawKeyMarker: Text }).strict(),
}).strict();
export type SetupEmployeeAddFieldsCase = z.infer<typeof SetupEmployeeAddFieldsCaseSchema>;

export const SetupEmployeeTabSelectsCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3577'),
    fixtureCrew: CfCrew,
    employee: CfWho,
    department: z.object({ typed: Text, match: Text }).strict(),
    expected: z.object({ departmentAfterLeave: Text }).strict(),
}).strict();
export type SetupEmployeeTabSelectsCase = z.infer<typeof SetupEmployeeTabSelectsCaseSchema>;

export const SetupFieldInactiveBadgeCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3701'),
    filter: z.object({ column: Text }).strict(),
    expected: z.object({ rows: Rows, recordsScope: Text, viewerTitlePrefix: Text, badges: Rows }).strict(),
}).strict();
export type SetupFieldInactiveBadgeCase = z.infer<typeof SetupFieldInactiveBadgeCaseSchema>;

export const SetupEmployeeContactCrewCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3703'),
    fixtureCrew: CfCrew,
    filter: z.object({ column: Text }).strict(),
    report: Text,
    expected: z.object({ errorText: Text, filterLinePrefix: Text, rowSuffix: Text, listed: z.array(Text).min(1) }).strict(),
}).strict();
export type SetupEmployeeContactCrewCase = z.infer<typeof SetupEmployeeContactCrewCaseSchema>;

// ── Cluster 5B: Employee Quick Add, Time Sheet Validations, Scripts (3927 / 3929 / 3706 / 3864) ──

export const QuickAddDefaultsCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3927'),
    employee: z.object({ firstName: Text, middle: Text }).strict(),
    expected: z.object({ labels: z.array(Text).min(1), section: Text, bannerSuffix: Text, alwaysUseDefaultJob: z.boolean() }).strict(),
}).strict();
export type QuickAddDefaultsCase = z.infer<typeof QuickAddDefaultsCaseSchema>;

export const QuickAddPrintBadgeCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3929'),
    employee: z.object({ firstName: Text }).strict(),
    expected: z.object({ bannerSuffix: Text, pdfMagic: Text }).strict(),
}).strict();
export type QuickAddPrintBadgeCase = z.infer<typeof QuickAddPrintBadgeCaseSchema>;

export const ValidationUndoMultiDeleteCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3706'),
    rows: z.number().int().min(2),
    expected: z.object({ deletedToast: Text, emptyGrid: Text, undoneToast: Text }).strict(),
}).strict();
export type ValidationUndoMultiDeleteCase = z.infer<typeof ValidationUndoMultiDeleteCaseSchema>;

export const FilterScriptEditCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3864'),
    script: Text,
    expected: z.object({ screenLabel: Text, screen: Text, scriptType: Text, absentField: Text, addUsersPlaceholder: Text }).strict(),
}).strict();
export type FilterScriptEditCase = z.infer<typeof FilterScriptEditCaseSchema>;

// ── Cluster 6A: Reports screens (3462 / 3858 / 3817 / 3503) ──

const DateCriterion = z.object({ field: Text, key: Text, match: Text }).strict();
const SelectionButtons = z.array(Text).length(3);

export const JobCardReportSelectionCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3462'),
    fixtureCrew: CfCrew,
    range: z.object({ fromOffset: CfDayOffset, toOffset: CfDayOffset, start: HhMm, end: HhMm }).strict(),
    expected: z.object({
        title: Text,
        startTime: Text,
        endTime: Text,
        buttons: SelectionButtons,
        dateLineTemplate: Text,
        crewLineTemplate: Text,
        dialogTitlePrefix: Text,
    }).strict(),
}).strict();
export type JobCardReportSelectionCase = z.infer<typeof JobCardReportSelectionCaseSchema>;

export const TimeInInRangeDefaultsCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3858'),
    criterion: DateCriterion,
    expected: z.object({ fromTime: HhMm, toTime: HhMm, summaryTemplate: Text }).strict(),
}).strict();
export type TimeInInRangeDefaultsCase = z.infer<typeof TimeInInRangeDefaultsCaseSchema>;

export const ReportScriptThisWeekCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3817'),
    criterion: z.object({ field: Text, key: Text, match: Text, range: Text }).strict(),
    expected: z.object({
        summaryLine: Text,
        savedToast: Text,
        landingTitle: Text,
        viewerTitlePrefix: Text,
        runCriterion: z.object({ f: Text, op: Text, v: z.array(Text).min(1) }).strict(),
        pdfFilterLine: Text,
        deletedToast: Text,
    }).strict(),
}).strict();
export type ReportScriptThisWeekCase = z.infer<typeof ReportScriptThisWeekCaseSchema>;

export const ReportsHubForFilterCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3503'),
    expected: z.object({
        filters: z.array(z.object({ module: Text, absent: z.array(Text).min(1) }).strict()).length(2),
    }).strict(),
}).strict();
export type ReportsHubForFilterCase = z.infer<typeof ReportsHubForFilterCaseSchema>;

// ── Cluster 6B: File menu captions, Time In range (3937 / 3932) ──

export const RestoreReverseCaptionsCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3937'),
    expected: z.object({ captions: z.array(Text).length(2), oldCaptions: z.array(Text).length(2) }).strict(),
}).strict();
export type RestoreReverseCaptionsCase = z.infer<typeof RestoreReverseCaptionsCaseSchema>;

export const TimeInDateTimeRangeCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3932'),
    ...TjcScoped,
    range: z.object({ fromOffset: CfDayOffset, start: HhMm, end: HhMm }).strict(),
    expected: z.object({ title: Text, inside: CfWho, insideAt: HhMm, outside: CfWho, maxRows: z.number().int().positive() }).strict(),
}).strict();
export type TimeInDateTimeRangeCase = z.infer<typeof TimeInDateTimeRangeCaseSchema>;

// ── Batch 3: Test File content, Time In selection, User alias set, Employee gender (PET-12958 / 3491 / 3781 / 3888 / 3610) ──

export const EtaTestFileLegacyCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('PET-12958'),
    ...TjcScoped,
    expected: z.object({
        jobCards: Rows,
        fileName: Text,
        recordsWritten: Text,
        lineLength: Rows,
        employeeIdColumn: z.object({ start: z.number().int().nonnegative(), length: Rows }).strict(),
        employees: Rows,
    }).strict(),
}).strict();
export type EtaTestFileLegacyCase = z.infer<typeof EtaTestFileLegacyCaseSchema>;

export const EtaTestFileLunchCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3491'),
    ...TjcScoped,
    expected: z.object({
        jobCards: Rows,
        correct: Rows,
        incorrect: z.number().int().min(0),
        absentException: Text,
        correctSection: Text,
        lunchLine: Text,
        sections: z.array(Text).min(1),
    }).strict(),
}).strict();
export type EtaTestFileLunchCase = z.infer<typeof EtaTestFileLunchCaseSchema>;

export const TimeInReportSelectionCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3781'),
    expected: z.object({
        breadcrumb: z.array(Text).length(3),
        title: Text,
        searchByPlaceholder: Text,
        clearAll: Text,
        noFilters: Text,
        buttons: SelectionButtons,
        dialogTitlePrefix: Text,
    }).strict(),
}).strict();
export type TimeInReportSelectionCase = z.infer<typeof TimeInReportSelectionCaseSchema>;

export const UserAliasSetCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3888'),
    aliasType: Text,
    expected: z.object({ dialogTitle: Text, aliasFieldColumn: Text, aliasFields: Rows }).strict(),
}).strict();
export type UserAliasSetCase = z.infer<typeof UserAliasSetCaseSchema>;

export const EmployeeGenderCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3610'),
    fixtureCrew: CfCrew,
    employee: CfWho,
    pick: Text,
    expected: z.object({ options: z.array(Text).min(1), absent: Text }).strict(),
}).strict();
export type EmployeeGenderCase = z.infer<typeof EmployeeGenderCaseSchema>;

// ── Batch 2: Crew In ALL EMPLOYEES, Break Preparation Job, Setup hub admin cards (3893 / 3941 / 3788) ──

export const TjcCrewInAllEmployeesCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3893'),
    ...TjcScoped,
    extraCrews: z.array(CfExtraCrew).length(1),
    preference: z.object({ section: z.literal('Defaults'), fieldId: Text, label: Text, noneLabel: Text }).strict(),
    crewIn: z.object({ at: HhMm }).strict(),
    expected: z.object({
        employees: z.number().int().positive(),
        labels: z.array(Text).min(2),
        rosterStatus: Text,
        toggleAll: Text,
        status: Text,
        errorText: Text,
        created: z.number().int().positive(),
    }).strict(),
}).strict();
export type TjcCrewInAllEmployeesCase = z.infer<typeof TjcCrewInAllEmployeesCaseSchema>;

const PreviewSegment = z.object({ job: z.enum(['hourly', 'paidBreak', 'breakPrep']), start: HhMm, end: HhMm, minutes: z.number().int().positive() }).strict();

export const TjcBreakPreparationCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3941'),
    ...TjcScoped,
    breakPreparation: z.object({ lengthMinutes: z.number().int().positive(), onlyPieceJobs: z.literal(false) }).strict(),
    expected: z.object({
        timeCards: z.number().int().positive(),
        jobCards: z.number().int().positive(),
        employees: z.number().int().positive(),
        pieces: z.number().int().nonnegative(),
        breakPunch: HhMm,
        totalMinutes: z.number().int().positive(),
        segments: z.array(PreviewSegment).min(4),
    }).strict(),
}).strict();
export type TjcBreakPreparationCase = z.infer<typeof TjcBreakPreparationCaseSchema>;

const HubCard = z.object({ route: z.string().regex(/^\/setup\//), title: Text }).strict();

export const SetupHubAdminCardsCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3788'),
    hub: Text,
    hidden: z.array(HubCard).length(2),
    visible: z.array(HubCard).min(1),
    deepLinkReason: Text,
    expected: z.object({ notAuthorized: Text, permissionText: Text, backLink: Text }).strict(),
}).strict();
export type SetupHubAdminCardsCase = z.infer<typeof SetupHubAdminCardsCaseSchema>;

// ── Batch 1: Transfer to Job Cards (PET-12959 / 12960 / 12961, WEBPET-2971 / 3314) ──

export const TjcJobCardsFiltersCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('PET-12959'),
    ...TjcScoped,
    filter: z.object({ label: Text }).strict(),
    expected: z.object({ analyzed: Rows, jobCardsBefore: Rows, jobCardsAfter: Rows, jobCardsCaption: Text, employeeTail: Text }).strict(),
}).strict();
export type TjcJobCardsFiltersCase = z.infer<typeof TjcJobCardsFiltersCaseSchema>;

export const TjcRateFallbackCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('PET-12960'),
    ...TjcScoped,
    rate: z.object({ employee: CfWho, ifMissing: z.number().positive() }).strict(),
    expected: z.object({ analyzed: Rows, absentIssue: Text, warnings: z.literal(0), absentStatus: Text, netColumn: Text, amountColumn: Text, employeeTail: Text }).strict(),
}).strict();
export type TjcRateFallbackCase = z.infer<typeof TjcRateFallbackCaseSchema>;

const RunEmployee = z.object({ firstName: z.string().min(1).max(20), exportIdentifier: Text }).strict();

export const TjcExportIdOrderCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('PET-12961'),
    ...TjcScoped,
    // 'one' sorts first as text (38161); 'two' (4243) punches first and would lead under time order or a numeric collator.
    employees: z.object({ one: RunEmployee, two: RunEmployee }).strict(),
    expected: z.object({
        analyzed: Rows,
        exportIdColumn: Text,
        labelTemplate: Text,
        rows: z.array(z.object({ employee: CfWho, time: Text }).strict()).length(4),
        filterOrder: z.array(CfWho).length(2),
    }).strict(),
}).strict();
export type TjcExportIdOrderCase = z.infer<typeof TjcExportIdOrderCaseSchema>;

const Figures = z.object({ Gross: z.number(), Net: z.number(), Meals: z.number() }).strict();

export const TjcTotalsFollowFilterCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-2971'),
    ...TjcScoped,
    filter: z.object({ label: Text }).strict(),
    expected: z.object({
        analyzed: Rows,
        labels: z.array(z.enum(['Gross', 'Net', 'Meals'])).length(3),
        all: Figures,
        filtered: Figures,
        decimals: z.number().int().min(0).max(4),
        allEmployees: Text,
        ticked: z.array(z.object({ employee: CfWho, kind: z.enum(['timeIn', 'timeOut']) }).strict()).length(2),
        absentBanner: Text,
    }).strict(),
}).strict();
export type TjcTotalsFollowFilterCase = z.infer<typeof TjcTotalsFollowFilterCaseSchema>;

export const TjcTwoDayPieceOutsCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3314'),
    ...TjcScoped,
    extraCrews: z.array(CfClaimedDay).length(1),
    ownJob: z.object({ noun: z.string().regex(/^[A-Z]+( [A-Z]+)*$/), paymentType: z.literal('TimeAndPiece'), hourlyRate: z.number().positive(), pieceRate: z.number().positive() }).strict(),
    expected: z.object({ analyzed: Rows, analyzedCaption: Text, ready: Rows, blocking: z.literal(0), warnings: z.literal(0), status: Text, footer: Text }).strict(),
}).strict().superRefine((s, ctx) => {
    const [x] = s.extraCrews;
    if (x.fixtureCrew !== s.fixtureCrew || x.dayOffset !== s.dayOffset + 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['extraCrews', 0], message: 'the overnight day must be the same crew on dayOffset + 1' });
    }
});
export type TjcTwoDayPieceOutsCase = z.infer<typeof TjcTwoDayPieceOutsCaseSchema>;
