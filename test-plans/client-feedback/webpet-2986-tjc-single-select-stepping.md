# `WEBPET-2986` · Transfer to Job Cards – Single select steps the Work Crew and Employee filters with the arrow keys

| Artifact | Path |
|---|---|
| Ticket | WEBPET-2986 (Done; customer Anthony); fix web-pet #1035 rev 2 |
| Plan | test-plans/client-feedback/webpet-2986-tjc-single-select-stepping.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-2986-tjc-single-select-stepping.spec.ts |
| Data | src/data/client-feedback/webpet-2986-tjc-single-select-stepping.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-2986` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-2986`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data (two crews) |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy Sandoval Gonzalez, FAILED QA 2026-09-18 (Employee), no re-test on record |
| Evidence | image-20260918-223741.png |
| Fix | web-pet #1035 rev 2 |

## Steps

| # | Step | Confirmed on dev 2026-10-30 |
|---|---|---|
| 0 | Arrange: `prepareCfRun` (builds CF CREW A and B), `seedCrewDay` for A (2 employees x In/Out), then for B (1 employee x In/Out) = 6 cards | crew B did not exist on dev yet; the first run creates it |
| 1 | Open, scope the day, scope both crews (`scopeToTimeCardCrews`), analyze (6) | |
| 2 | The Single select switch is left of the Work Crew filter, which is left of the Employee filter | switch is the first control of the filter row |
| 3 | Turn Single select on | `transfer-grid-filter-single`, role switch |
| 4 | For Work Crew and for Employee: pick the first value (rows narrow to it), ArrowDown (next value, rows follow), ArrowUp (back), clear (all values, 6 of 6) | employee stepping and the crew trigger's first ArrowDown walked by hand; crew-to-crew not walked |

## Expected outcomes

- With Single select on, ArrowDown/ArrowUp step each filter through its values and the grid follows.
- Clearing returns to "All work crews" / "All employees" and every row.
- Not asserted: nothing beyond the sheet; the mode lives in the throwaway context's localStorage.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `singleSelectSwitch`, `setSingleSelect`, `gridFilterTrigger/Value/Options`, `pickGridFilter`, `stepGridFilter`, `clearGridFilter`, `filterControlBoxes`, `scopeToTimeCardCrews` |

## Data

CF CREW A (CF A ONE, CF A TWO) at -5 and CF CREW B at -5 (extraCrews), CF JOB. Cluster 2 must skip B@-5.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 5 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows for both crews via ensureOnScreen, when missing |
| plumbing read | GET preferences and GET time-cards (own-id capture on both crew-days). The proof is on screen |
| cleanup | before-phase sweep and by-id teardown for both crew-days. Nothing is committed |

## Cleanup

Own job cards and time cards by id, then a day sweep per crew. Nothing is transferred.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-2986`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-2986` | The Single select switch lets the Work Crew and Employee filters step through values with the arrow keys | `regression` | 1 after the first green run |

## Open questions for the tester

None.
