# `WEBPET-3433` · Transfer to Job Cards – a grid column filter narrows the loaded rows and clearing it restores them

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3433 (Done; customer Anthony); fix web-pet #1233 |
| Plan | test-plans/client-feedback/webpet-3433-tjc-column-filter.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3433-tjc-column-filter.spec.ts |
| Data | src/data/client-feedback/webpet-3433-tjc-column-filter.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3433` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3433`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Rahul Jha, dev PASS 2026-10-10 (no QA-team verdict) |
| Evidence | none |
| Fix | web-pet #1233 |

## Steps

| # | Step | Confirmed on dev 2026-10-30 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`. CF CREW A, day -3, both employees, CF JOB, Time In 07:00, Time Out 11:00 = 4 cards | |
| 1 | Open, scope the day and the crew, analyze (4); read the references; start counting analyze requests | |
| 2 | Type "cf j" in the Job filter (`cardGrid.columnFilter`) | narrowed 3 rows to the 2 CF JOB Time Ins |
| 3 | Totals caption reads "Includes 2 Time Cards of 2 initial selection"; the Job cells are all "CF JOB" | |
| 4 | Clear the filter | same references return |
| 5 | The grid keeps its analyzed name, and the browser sent no analyze request | no analyze request, Analyze never went busy |

## Expected outcomes

- Typing narrows the loaded rows to the matching ones; clearing brings back the same rows.
- No new Analyze runs.
- Not asserted: the original bug needed a blank Job in the grid's first data row; the cascade sort puts a Time In first, so the seed cannot force it (`not-asserted` annotation). Lower-case partial text proves the contains / ignore-case match.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `cardGrid`, `analyzedGrid`, `countAnalyzeRequests` (uses `DataGridComponent`) |

## Data

CF CREW A with CF A ONE and CF A TWO, CF JOB. The (crew, day) pair is A at -3.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 3 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences and GET time-cards (own-id capture). The proof is on screen: steps 3, 4 |
| observed request | step 5 counts the browser's own POST analyze requests (`network-evidence` annotation); no API call is made |
| cleanup | before-phase sweep and by-id teardown. Nothing is committed |

## Cleanup

Own job cards and time cards by id, then a crew-day sweep. Nothing is transferred.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3433`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3433` | Typing in a grid column filter narrows the loaded time cards and clearing it brings them all back | `regression` | 1 after the first green run |

## Open questions for the tester

None.
