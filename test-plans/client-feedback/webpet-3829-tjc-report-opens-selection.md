# `WEBPET-3829` · Transfer to Job Cards – Report opens the report selection instead of running a report

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3829 (Done); fix web-pet #1435 |
| Plan | test-plans/client-feedback/webpet-3829-tjc-report-opens-selection.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3829-tjc-report-opens-selection.spec.ts |
| Data | src/data/client-feedback/webpet-3829-tjc-report-opens-selection.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3829` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3829`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy Sandoval Gonzalez, 2026-10-15 |
| Evidence | image-20261015-152225.png |
| Fix | web-pet #1435 |

## Steps

| # | Step | Confirmed on dev 2026-10-30 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`. CF CREW A, day -9, CF A ONE, Time In 07:00, Time Out 11:00 = 2 cards | |
| 1 | Open Transfer to Job Cards from the left menu | |
| 2 | Scope the day and the crew, analyze | |
| 3 | Display Report is visible and labelled "Display Report" | `v2-toolbar-display-report`, right of Report |
| 4 | Click Report (`tjc.report.open()`) | `v2-toolbar-report` |
| 5 | The dialog is named "Report: …" | alertdialog "Report: All Data — <today>" |
| 6 | The report dropdown lists reports | `report-select`, 69 options |
| 7 | A report parameter control is shown | 3 `report-param-*` controls |
| 8 | No PDF viewer opened | no `iframe[src^=blob:]`, no `/reports/run` request |
| 9 | Close the dialog | |

## Expected outcomes

- Report opens the selection dialog; no report runs.
- Display Report sits beside Report.
- Not asserted (annotations): Cancel from the sheet's expected result was removed by WEBPET-3835 (asserted absent there); Display Report, PDF and Excel stay unclicked.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `report`, `displayReportButton`, `pdfViewer` |
| Report dialog | toolbar Report | `src/pages/processing/ReportDialog.ts`, `src/pages/reports/PdfViewerDialog.ts` | exist; only instantiated |

## Data

CF CREW A (CF A ONE), CF JOB. The (crew, day) pair is A at -9.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 9 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences and GET time-cards (own-id capture). The proof is on screen |
| cleanup | before-phase sweep and by-id teardown. Nothing is committed |

## Cleanup

Own job cards and time cards by id, then a crew-day sweep. Nothing is transferred.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3829`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3829` | Clicking Report on Transfer to Job Cards opens the report selection instead of running a report straight away | `regression` | 1 after the first green run |

## Open questions for the tester

None.
