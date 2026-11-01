# `WEBPET-3484` · View Job Cards – Exported to Payroll is offered in Multi Edit

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3484 (Done; customer Anthony; duplicate WEBPET-3570); fix web-pet #1292 |
| Plan | test-plans/client-feedback/webpet-3484-vjc-multi-edit-exported-to-payroll.md |
| Spec | tests/web/client-feedback/view-job-cards/webpet-3484-vjc-multi-edit-exported-to-payroll.spec.ts |
| Data | src/data/client-feedback/webpet-3484-vjc-multi-edit-exported-to-payroll.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3484` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3484`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy 10-05 |
| Evidence | none |
| Fix | web-pet #1292 |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: CF CREW C, day -12, both employees, CF JOB, 07:00-11:00 = 4 cards | |
| 1 | Transfer the crew's day (2 job cards); the app lands on View > Job Cards with `transferRun` | run 615 |
| 2 | The landing lists the 2 own job cards; read their References | |
| 3 | Switch on Multi Edit, tick the 2 own rows (never Select all): "Update Records (2)" | "Select <ref>" checkboxes appear |
| 4 | The Field list offers "Exported to Payroll"; its Value offers No and Yes | |
| 5 | Set Yes: "Review and confirm" reads "2 job card(s) will be updated: Exported to Payroll: Yes."; Confirm update; toast "2 records updated"; with Include Exported on and Apply, Exported reads Yes | PASS |
| 6 | Restore on screen: Multi Edit, same rows, No; Exported reads No | PASS |
| 7 | Multi Edit off; delete the 2 own job cards on screen (Delete ▸ Delete Selected, one at a time) | edited cards refuse the Reverse path by design |

## Expected outcomes

- Exported to Payroll is a Multi Edit field and the change is shown in the Exported column.
- The job cards are put back to No before they are deleted.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| View ▸ Job Cards | landing after the transfer | `src/pages/processing/ViewJobCardsPage.ts` | exists; adds the Multi Edit members |
| Transfer to Job Cards | Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists, driven through `transferCrewDay` |

## Data

CF CREW C with CF C ONE and CF C TWO, CF JOB. The (crew, day) pair is C at -12.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 12 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards and GET job-cards (own ids, recorded by the transfer helper). The proof is on screen: steps 5, 6 |
| cleanup | before-phase sweep and by-id teardown. `jobCardsApi` has no update call, so a test that dies between Yes and No leaves exported cards that the by-id delete may refuse; the next run's before-phase sweep retries them |

## Cleanup

The test restores Exported to No in a `finally` and deletes the own job cards on screen. Teardown deletes any remaining ids.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3484` | Exported to Payroll is offered in Multi Edit on View > Job Cards | `regression` | 1 after the first green run |

## Open questions for the tester

None.
