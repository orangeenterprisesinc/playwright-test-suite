# `WEBPET-3931` · The default export file name on Export to Accounting follows the legacy format PET + date and time

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3931 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3931-eta-test-file-name.md |
| Spec | tests/web/client-feedback/export-to-accounting/webpet-3931-eta-test-file-name.spec.ts |
| Data | src/data/client-feedback/webpet-3931-eta-test-file-name.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3931` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3931`) |
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

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 0 | Arrange: CF CREW D, day -10, both employees, CF JOB, 07:00-11:00 = 4 cards | |
| 1 | Transfer the crew's day (2 job cards) | "2 job cards written" |
| 2 | Export to Accounting via the menu, Payroll, the day, Job Card Crew is CF CREW D, Refresh, all inside the export-draft lock | 2 matched, 2 Ready |
| 3 | Test File: summary "2 ready / 0 cannot export"; dismiss the Analyze Results alert with No | confirmed |
| 4 | Export file name matches `^PET\d{17}\.txt$`, not `famous-120-3-payroll-`; "2 records written" | PET20261102100108188.txt, "2 records written" |
| 5 | Close the sheet; "2 matched", 2 Ready | confirmed |

## Expected outcomes

- The Test File export file name is the legacy PET + date/time name and the record count is the own cards.
- Test File changes no data; nothing is exported.
- Not asserted: the time zone of the name's timestamp (UTC on dev; the ticket asks only for PET + date/time).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Export to Accounting | File ▸ Export to Accounting | `src/pages/processing/ExportToAccountingPage.ts` | exists |
| Test File sheet | Export to Accounting ▸ Test File | `src/pages/processing/TestFileSheet.ts` | exists; adds `fileName`, `recordsWritten` |
| Transfer to Job Cards | Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists, driven through `transferCrewDay` |

## Data

CF CREW D with CF D ONE and CF D TWO, CF JOB (Earning Code RH,,OT,,DT,,RDP,,ODT,,DDT). The (crew, day) pair is D at -10.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 10 (dev: 21).
- [ ] CF JOB carries the earning code (`ensureJobOnScreen` repairs it on screen).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards and GET job-cards (own ids). The proof is on screen: steps 3-5 |
| cleanup | before-phase sweep, the Refresh draft DELETE inside the export-draft lock, and by-id teardown of job cards and time cards |

## Cleanup

`registerCfCleanup` deletes the own job cards and time cards by id. The Refresh draft is deleted inside the lock by `withCrewEta`.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3931` | The default export file name on Export to Accounting follows the legacy format PET + date and time | `regression` | 1 after the first green run |

## Open questions for the tester

None.
