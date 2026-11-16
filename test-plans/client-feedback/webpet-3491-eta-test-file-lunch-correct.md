# `WEBPET-3491` · The Payroll Test File analyze log counts a zero-net lunch card as correct and shows the Totals section

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3491 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3491-eta-test-file-lunch-correct.md |
| Spec | tests/web/client-feedback/export-to-accounting/webpet-3491-eta-test-file-lunch-correct.spec.ts |
| Data | src/data/client-feedback/webpet-3491-eta-test-file-lunch-correct.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3491` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3491`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | web-pet #1535 |

## Steps

| # | Step | Confirmed on dev |
|---|---|---|
| 0 | Arrange: CF MEAL JOB (9073) set as the tenant's Meal Job on Preferences ▸ Job ▸ Job Assignments ▸ Meal Job (su has none). CF CREW B, day -19. CF B ONE: Time In CF JOB 07:00, Time In CF MEAL JOB 11:00, Time Out 11:30 = 3 time cards | |
| 1 | Transfer the crew's day (2 job cards); the lunch card's Net Time is 0 | |
| 2 | Export to Accounting via the menu inside the export-draft lock: Payroll, the day, the crew, Refresh | |
| 3 | Test File: the results alert reads Correct 2 / Incorrect 0; the sheet's failure list has no "Meal job with no net time" | |
| 4 | Results alert ▸ Yes downloads the analyze log: no "Meal job with no net time"; under "Exported correct job-cards" the `CF MEAL JOB` card reads "Does not need Exporting"; Job-cards, Employees, Pieces and Totals sections present | |
| 5 | Close the sheet, then restore the Meal Job preference to "— None —" on screen | |

## Expected outcomes

- A zero-net lunch card counts as Correct, not as a meal-job exception.
- The analyze log shows the Totals section along with the others.
- Not asserted: the TC's Reverse step (teardown deletes the own job cards and time cards by id).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Export to Accounting | File ▸ Export to Accounting | `src/pages/processing/ExportToAccountingPage.ts` | exists |
| Test File sheet | Export to Accounting ▸ Test File | `src/pages/processing/TestFileSheet.ts` | exists; adds `saveLog` |
| Transfer to Job Cards | Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists, driven through `transferCrewDay` |

## Data

CF CREW B with CF B ONE, CF JOB, and CF MEAL JOB (9073, Time, rate 1, same Earning Code as CF JOB). The Meal Job preference (`mealJob`, null on su) is set to CF MEAL JOB on screen under the preferences lock and restored to "— None —" on screen at the end (cleanup PUT {mealJob: 0} is the backstop; a non-CF Meal Job is never overwritten). web-pet #1535's fix covers the preference's meal job only, so '0 - Lunch' (an ordinary job on su) cannot stand in. The (crew, day) pair is B at -19.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 19 (dev: 21).
- [ ] CF MEAL JOB is ensured on screen and designated as the Meal Job; Preferences reads it back after a fresh load, and "— None —" after the restore.
- [ ] `mealJob` is null or already a CF job (another person's Meal Job is never overwritten).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards and GET job-cards (own ids). The proof is on screen and in the downloaded log |
| cleanup | before-phase sweep, the Refresh draft DELETE inside the export-draft lock, by-id teardown of job cards and time cards |

## Cleanup

`registerCfCleanup` deletes the own job cards and time cards by id. The Refresh draft is deleted inside the lock by `withCrewEta`.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3491` | The Payroll Test File analyze log counts a zero-net lunch card as correct and shows the Totals section | `regression` | 1 after the first green run |

## Open questions for the tester

None. The log's section headers and the correct-card line format are the Planner's reading of the fix; the first run confirms them.
