# `WEBPET-3133` · View Time Cards – an employee's punches read oldest first when sorted by Employee

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3133 (Done; customer Anthony); fix web-pet #1027 |
| Plan | test-plans/client-feedback/webpet-3133-vtc-punches-oldest-first.md |
| Spec | tests/web/client-feedback/view-time-cards/webpet-3133-vtc-punches-oldest-first.spec.ts |
| Data | src/data/client-feedback/webpet-3133-vtc-punches-oldest-first.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3133` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3133`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy 09-21 |
| Evidence | none |
| Fix | web-pet #1027 |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: CF CREW C, day -2, both employees: 06:30 Time In (CF JOB), then 10:30 Time In (CF PIECE JOB, standing in for lunch) with a 15:00 Time Out = 6 cards | |
| 1 | Open View > Time Cards, scope the day and Time Card Crew, Apply Filter (6 rows) | |
| 2 | Sort by Employee (ascending) | |
| 3 | Each employee reads 6:30 AM Time In, 10:30 AM Time In, 3:00 PM Time Out | PASS |

## Expected outcomes

- Each employee's rows read oldest first, Time In first and Time Out last.
- Not asserted: no CF break/lunch job exists, so the 10:30 Time In on CF PIECE JOB stands in for the lunch rows.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| View ▸ Time Cards | View, Time Cards | `src/pages/processing/ViewTimeCardsPage.ts` | exists; adds `cardGrid` (uses `DataGridComponent`) |

## Data

CF CREW C with CF C ONE and CF C TWO. The (crew, day) pair is C at -2.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 12 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards (own-id capture). The proof is on screen: step 3 |
| cleanup | before-phase sweep and by-id teardown |

## Cleanup

Own time cards by id, then a crew-day sweep.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3133` | An employee's punches on View > Time Cards read oldest first when sorted by Employee | `regression` | 1 after the first green run |

## Open questions for the tester

None.
