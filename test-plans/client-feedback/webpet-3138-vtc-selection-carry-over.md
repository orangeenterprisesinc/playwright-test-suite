# `WEBPET-3138` · View Time Cards – the screen keeps the earlier filter on return, waits for Apply Filter, and the top section can be hidden

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3138 (Done; customer Anthony); fix web-pet #1028 / #1084 |
| Plan | test-plans/client-feedback/webpet-3138-vtc-selection-carry-over.md |
| Spec | tests/web/client-feedback/view-time-cards/webpet-3138-vtc-selection-carry-over.spec.ts |
| Data | src/data/client-feedback/webpet-3138-vtc-selection-carry-over.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3138` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3138`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy 09-23 |
| Evidence | none |
| Fix | web-pet #1028 / #1084 |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`. CF CREW C, day -1, both employees, CF JOB, 07:00-11:00 = 4 cards | |
| 1 | Open View > Time Cards, scope the day and Search by Time Card Crew contains, Apply Filter (4 rows) | |
| 2 | Hide top section, then show it | toggle reads "Show top section", aria-expanded false, legend and pickers gone; Show brings them back |
| 3 | Leave through View > Job Cards and come back from the menu | |
| 4 | Range and the line `Time Card Crew contains "CF CREW C"` restored; grid empty; Report disabled; no time-cards request | 0 GET /time-cards |
| 5 | Apply Filter loads 4 rows (browser request count annotated) | 6 rows on the walked data, one GET |
| 6 | Columns picker has Work Crew, Employee, Reference, Memo ticked; Memo hidden then shown again | 18 ticked checkboxes |

## Expected outcomes

- The selection carries over, nothing loads until Apply Filter, and the top section hides and shows.
- Not asserted: the scroll bar (viewport-dependent layout); the Records radios stay visible when the top section is hidden (separate ticket); the grid Work Crew chip is not carried over.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| View ▸ Time Cards | View, Time Cards | `src/pages/processing/ViewTimeCardsPage.ts` | exists; adds `cardGrid`, `report`, toolbar and criteria members |
| View ▸ Job Cards | View, Job Cards | `src/pages/processing/ViewJobCardsPage.ts` | exists, used only to leave the screen |

## Data

CF CREW C with CF C ONE and CF C TWO, CF JOB. The (crew, day) pair is C at -1.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 12 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards (own-id capture). The proof is on screen |
| observed request | step 4 counts the browser's own GET time-cards (`network-evidence` annotation); no API call is made |
| cleanup | before-phase sweep and by-id teardown |

## Cleanup

Own time cards by id, then a crew-day sweep. The column hidden in step 6 is shown again in a `finally` (the layout is per user, server-side).

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3138` | On View > Time Cards the screen keeps the earlier filter when you come back, waits for Apply Filter, and the top section can be hidden | `regression` | 1 after the first green run |

## Open questions for the tester

None.
