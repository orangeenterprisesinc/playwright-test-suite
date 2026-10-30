# `WEBPET-3183` · Transfer to Job Cards – the date range picker moved to the top-left, out of the Date column

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3183 (Done; customer Anthony; label anthony-feedback); fix web-pet #1052 |
| Plan | test-plans/client-feedback/webpet-3183-tjc-date-control-top-left.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3183-tjc-date-control-top-left.spec.ts |
| Data | src/data/client-feedback/webpet-3183-tjc-date-control-top-left.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3183` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3183`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy Sandoval Gonzalez, 2026-09-22, PASSED QA |
| Evidence | image-20260922-170541.png |
| Fix | web-pet #1052 |

## Steps

| # | Step | Confirmed on dev 2026-10-30 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`. CF CREW A, day -10, CF A ONE, CF JOB, Time In 07:00, Time Out 11:00 = 2 cards | an unseeded day analyzes 0 cards, so the picked-day check needs the seed |
| 1 | Open Transfer to Job Cards from the left menu (`tjc.openFromMenu()`) | |
| 2 | Dates sits left of Search by on the same row (`tjc.dateControlBoxes()`) | Dates x313–471, y123–151; Search by x486–616, y134–162 |
| 3 | Scope the day (`tjc.scopeToDay(run.day)`) | chip "10/19/2026 – 10/19/2026" style |
| 4 | Scope Time Card Crew to CF CREW A and analyze (`analyzeCandidates({ expected: 2 })`) | |
| 5 | The date column has no filter control, Field keeps its Filter… textbox (`gridFilterControls`); read after analyze because the empty grid renders no headers | date filter cell empty, Field's holds a "Filter…" textbox |
| 6 | Every loaded row's date equals the picked day (`candidateDates`) | rows dated the seeded day |

## Expected outcomes

- Dates is left of Search by, on the same filter row.
- The date column has no range filter; Field still has its text filter.
- After picking the day and analyzing, every loaded row is on that day.
- Not asserted: View > Time Cards / Job Cards placement parity (other screens; the fix is on Transfer), recorded as a `not-asserted` annotation.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `searchByControl`, `dateControlBoxes`, `gridFilterControls`, `candidateDates`, `usDay` |
| Crew Time In / Crew Time Out | Input ▸ Batch | `CrewTimeInPage`, `CrewTimeOutPage` | exist; driven by `seedCrewDay` |

## Data

CF CREW A with CF A ONE, CF JOB, CF RANCH, CF FIELD from `src/data/client-feedback/fixture.json`. The (crew, day) pair is A at -10; the loader rejects a second scenario file on it.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 10 (dev: 21); a smaller window fails by name.

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences (day-window gate) and GET time-cards (own-id capture, before asserting). The proof is on screen: steps 2, 5, 6 |
| cleanup | before-phase sweep and by-id teardown of time cards. Nothing is committed |

## Cleanup

Registered with the cleanup scope before any write: own job cards and time cards by id, then a crew-day sweep. Nothing is transferred.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3183`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3183` | The date range picker sits top-left beside the search selector on Transfer to Job Cards, not inside the Date column | `regression` | 1 after the first green run |

## Open questions for the tester

None.
