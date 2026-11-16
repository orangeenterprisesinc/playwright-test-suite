# `PET-12959` · Transfer to Job Cards – the Work Crew and Employee filters stay visible and work on the Job Cards tab

| Artifact | Path |
|---|---|
| Ticket | PET-12959 (client feedback, Transfer to Job Cards) |
| Plan | test-plans/client-feedback/pet-12959-tjc-job-cards-crew-employee-filters.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/pet-12959-tjc-job-cards-crew-employee-filters.spec.ts |
| Data | src/data/client-feedback/pet-12959-tjc-job-cards-crew-employee-filters.json |
| Runner row | src/data/runner/client-feedback.csv → `PET-12959` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `PET-12959`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data (CF CREW A, day -11) |

## Steps

| # | Step | Locator / note |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`: both employees, CF JOB, Time In 07:00, Time Out 11:00 = 4 cards | fixture rows built on screen when missing |
| 1 | Open Transfer to Job Cards from the left menu (`tjc.openFromMenu()`) | |
| 2 | Scope the day and Time Card Crew to CF CREW A, analyze (4) | |
| 3 | Open the Job Cards tab: the Work Crew filter, Employee filter, Single select and "Filter displayed rows" are visible; the preview lists 2 job cards | `transfer-grid-filter-*` testids |
| 4 | Pick the Employee filter `: CF A ONE`: 1 preview row, ending CF A ONE; the bar reads "Includes 1 of 2 Job Cards" | `pickGridFilter`, `previewColumn`, `jobcards-totals-bar` |
| 5 | Switch to Time Cards and back: the Employee choice holds and the preview and bar repeat step 4 | |

## Expected outcomes

- The filters and Single select are on the Job Cards tab.
- Only CF A ONE's card shows, with "Includes 1 of 2 Job Cards".
- The choice survives a tab switch.
- Not asserted: the Work Crew filter narrowing (deferred: one crew is scoped).

## Screens and page objects

| Screen | Page object | Status |
|---|---|---|
| Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `jobCardsTotalsBar`, `previewColumn`, `filterDisplayedRowsLabel`; `pickGridFilter` dismisses an open popover |

## Data

CF CREW A with CF A ONE and CF A TWO, CF JOB, CF RANCH, CF FIELD from `src/data/client-feedback/fixture.json`. The (crew, day) pair is A at -11. CF employees carry no Export ID, so the option reads `: CF A ONE`.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 11 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences (21-day gate) and GET time-cards (own-id capture before asserting). The proof is on screen |
| cleanup | before-phase sweep of the crew's day and by-id teardown. Nothing is committed |

## Cleanup

Registered with the cleanup scope before any write: own time cards by id, then a crew-day sweep. Nothing is transferred.

## Test case

One ticket, one happy-path test, one runner row (id `PET-12959`), tag `regression`. The spec title equals the runner `testTitle`.

## Open questions for the tester

None.
