# `WEBPET-2971` · Transfer to Job Cards – Time Cards tab totals follow the Work Crew / Employee filter

| Artifact | Path |
|---|---|
| Ticket | WEBPET-2971 (customer Anthony, client feedback) |
| Plan | test-plans/client-feedback/webpet-2971-tjc-time-cards-totals-follow-filter.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-2971-tjc-time-cards-totals-follow-filter.spec.ts |
| Data | src/data/client-feedback/webpet-2971-tjc-time-cards-totals-follow-filter.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-2971` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-2971`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data (CF CREW A, day -12) |

## Steps

| # | Step | Locator / note |
|---|---|---|
| 0 | Arrange: per employee Time In 07:00 on CF JOB, Time In 11:00 on CF MEAL JOB (designated as the tenant Meal Job for the run, restored after), Time In back on CF JOB, Time Out. ONE: lunch 30 min, out 15:00; TWO: lunch 60 min, out 16:00 = 8 cards | seed `lunch` field |
| 1-2 | Open from the menu, scope the day and crew, analyze (8) | |
| 3 | With no filter Gross, Net and Meals read the whole-transfer figures | `totalsNumber` |
| 4 | Pick the Employee filter `: CF A ONE` | `pickGridFilter` |
| 5 | Time Cards totals follow the filter (each below the whole figure) and equal the Job Cards bar; no "still cover the whole transfer" banner | `jobCardsTotalsNumber` |
| 6 | Tick, then un-tick, CF A ONE's Time In and Time Out rows: totals stay on the filter; select-all untouched | `selectCandidate`, `deselectCandidate` |
| 7 | Clear the filter: "All employees" and the totals are back to the whole transfer | `clearGridFilter` |

## Expected outcomes

- Gross, Net and Meals narrow to the filtered employee and equal the Job Cards bar.
- Selecting rows does not change them; clearing the filter restores the whole figures.
- The expected figures are predicted (lunch unpaid, Meals = Gross - Net); measure on dev and replace in the JSON.

## Screens and page objects

| Screen | Page object | Status |
|---|---|---|
| Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `jobCardsTotalsNumber`, `deselectCandidate` |
| Crew Time In / Crew Time Out | `CrewTimeInPage`, `CrewTimeOutPage` | exist; driven by `seedCrewDay` (`lunch`) |

## Data

CF CREW A with CF A ONE and CF A TWO, CF JOB, CF RANCH, CF FIELD, plus the CF fixture job CF MEAL JOB (9073). The (crew, day) pair is A at -12.

## Preconditions

- [ ] su login from storageState; `maximumDaysForTransferExport` is at least 12.
- [ ] Preferences ▸ Job ▸ Meal Job reads — None — or CF MEAL JOB (anything else fails by name).

## API allowances

| Allowance | Use |
|---|---|
| arrange | CF fixture rows when missing |
| plumbing read | GET preferences and GET time-cards (own ids) |
| cleanup | before-phase sweep, by-id teardown, crew-day sweep. Nothing is committed |

## Cleanup

Own time cards by id, then a crew-day sweep.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-2971`), tag `regression`. The spec title equals the runner `testTitle`.

## Open questions for the tester

None. To measure on dev: the six real figures and decimals, whether the banner shows (a product finding if it does), and whether Multi Update mode changes the totals.
