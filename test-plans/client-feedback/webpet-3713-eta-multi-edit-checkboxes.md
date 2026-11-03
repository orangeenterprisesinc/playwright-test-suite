# `WEBPET-3713` · On Export to Accounting the row checkboxes are disabled until Multi Edit is switched on

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3713 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3713-eta-multi-edit-checkboxes.md |
| Spec | tests/web/client-feedback/export-to-accounting/webpet-3713-eta-multi-edit-checkboxes.spec.ts |
| Data | src/data/client-feedback/webpet-3713-eta-multi-edit-checkboxes.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3713` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3713`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | not recorded |

## Steps

| # | Step | Confirmed on dev 2026-11-01 |
|---|---|---|
| 0 | Arrange: CF CREW D, day -3, both employees, CF JOB, 07:00-11:00 = 4 cards | |
| 1 | Transfer the crew's day (2 job cards) | |
| 2 | Export to Accounting via the menu, Payroll, the day, Job Card Crew contains CF CREW D, Refresh, all inside the export-draft lock | "Export run created" |
| 3 | Row checkboxes are disabled before Multi Edit; Multi Edit on enables them; ticking one reads "Update Records (1)"; untick and Multi Edit off disables them again (never run the update) | PASS; the first click after Multi Edit only selects the row, the second ticks |
| 4 | The Refresh draft is dropped inside the lock | |

## Expected outcomes

- Row checkboxes are read-only until Multi Edit is switched on, and read-only again after it is switched off.
- Ticking a row in Multi Edit counts it in "Update Records (1)".
- The update is never run.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Export to Accounting | File ▸ Export to Accounting | `src/pages/processing/ExportToAccountingPage.ts` | exists; adds `rowCheckboxes`, `setMultiEdit`, `setRowTicked`, `updateRecordsButton` |
| Transfer to Job Cards | Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists, driven through `transferCrewDay` |

## Data

CF CREW D with CF D ONE and CF D TWO, CF JOB. The (crew, day) pair is D at -3.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 3 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards and GET job-cards (own ids). The proof is on screen: step 3 |
| cleanup | before-phase sweep, the draft DELETE inside the lock, and by-id teardown of job cards and time cards |

## Cleanup

`registerCfCleanup` deletes the own job cards and time cards by id. The Refresh draft is deleted inside the lock by `withCrewEta`.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3713` | On Export to Accounting the row checkboxes are disabled until Multi Edit is switched on | `regression` | 1 after the first green run |

## Open questions for the tester

None.
