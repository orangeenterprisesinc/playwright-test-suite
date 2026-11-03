# `WEBPET-3835` · Transfer to Job Cards – the report selection dialog closes with an X, no Cancel

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3835 (Done); fix web-pet #1450 |
| Plan | test-plans/client-feedback/webpet-3835-tjc-report-close-x.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3835-tjc-report-close-x.spec.ts |
| Data | src/data/client-feedback/webpet-3835-tjc-report-close-x.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3835` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3835`) |
| Journey | none |
| Surface | ui |
| Bucket | A: no data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy Sandoval Gonzalez, 2026-10-16 |
| Evidence | image-20261016-151233.png |
| Fix | web-pet #1450 |

## Steps

| # | Step | Confirmed on dev 2026-10-30 |
|---|---|---|
| 1 | Open Transfer to Job Cards from the left menu | |
| 2 | Click Report; the dialog is named "Report: …" | Report is enabled on an empty, unanalyzed screen |
| 3 | The X is inside the dialog's top-right corner within `cornerTolerancePx` | `report-close` 12px from the right and top edges |
| 4 | The button row keeps Edit in Report Editor, Excel, Export, Load, Save, PDF and has no Cancel | row also holds Edit in Layout Designer (containment, not equality); only the hidden `report-cancel-run` "Cancel run" exists |
| 5 | The X closes the dialog | |

## Expected outcomes

- The dialog closes with an X in its top-right corner and shows no Cancel button.
- Not asserted: Save, Load, PDF and Excel stay unclicked (Save writes a shared layout; the others run a report).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `report`, `reportCornerBoxes` |
| Report dialog | toolbar Report | `src/pages/processing/ReportDialog.ts` | exists; `closeX`, `cancelButton`, `buttonRowLabels` reused |

## Data

None.

## Preconditions

- [ ] su login from storageState.

## API allowances

None.

## Cleanup

None; the spec closes the dialog itself.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3835`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3835` | A report selection dialog is closed with an X in the top-right corner instead of a Cancel button | `regression` | 1 after the first green run |

## Open questions for the tester

None.
