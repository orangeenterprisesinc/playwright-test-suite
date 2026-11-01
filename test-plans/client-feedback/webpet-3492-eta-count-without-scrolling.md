# `WEBPET-3492` · The Export button count equals the number of job cards matched without scrolling through the grid

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3492 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3492-eta-count-without-scrolling.md |
| Spec | tests/web/client-feedback/export-to-accounting/webpet-3492-eta-count-without-scrolling.spec.ts |
| Data | src/data/client-feedback/webpet-3492-eta-count-without-scrolling.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3492` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3492`) |
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
| 0 | Arrange: CF CREW D, day -6, both employees, CF JOB, 07:00-11:00 = 4 cards | |
| 1 | Transfer the crew's day (2 job cards) | |
| 2 | Export to Accounting via the menu, Payroll, the day, Job Card Crew contains CF CREW D, Refresh, all inside the export-draft lock | "Export run created" |
| 3 | "2 matched" = "Export 2 JobCards" = "Job-cards 2 of 2" = 2 Ready; scroll the grid and the matched count and Export label do not change (never click Export) | PASS; with 2 rows the grid has no scroll area |
| 4 | The Refresh draft is dropped inside the lock | |

## Expected outcomes

- The Export button count equals the matched count, before and after scrolling the grid.
- Volume half (counts stay right while rows are not all rendered): not asserted, smoke concern. Two own cards render without a scroll area.
- Nothing is exported.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Export to Accounting | File ▸ Export to Accounting | `src/pages/processing/ExportToAccountingPage.ts` | exists; adds `matchedCount`, `recordCountLine`, `scrollGrid` |
| Transfer to Job Cards | Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists, driven through `transferCrewDay` |

## Data

CF CREW D with CF D ONE and CF D TWO, CF JOB. The (crew, day) pair is D at -6.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 6 (dev: 21).

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
| `WEBPET-3492` | The Export button count equals the number of job cards matched without scrolling through the grid | `regression` | 1 after the first green run |

## Open questions for the tester

None.
