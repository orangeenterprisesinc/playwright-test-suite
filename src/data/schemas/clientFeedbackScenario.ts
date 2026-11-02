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
    employeePieceOut: z.object({ employee: z.enum(['one', 'two']), at: Clock, pieces: z.number().int().positive().max(5) }).strict().optional(), // Transfer ▸ New record ▸ Add Piece-out
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
