# `WEBPET-3181` · View Time Cards Multi Update – typing in the Employee value box shows the typed text and finds matching employees

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3181 (Done; customer Anthony); fix web-pet #1058 (+ #1137, #1374) |
| Plan | test-plans/client-feedback/webpet-3181-vtc-multi-update-employee-typeahead.md |
| Spec | tests/web/client-feedback/view-time-cards/webpet-3181-vtc-multi-update-employee-typeahead.spec.ts |
| Data | src/data/client-feedback/webpet-3181-vtc-multi-update-employee-typeahead.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3181` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3181`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy 09-24 |
| Evidence | none |
| Fix | web-pet #1058 (+ #1137, #1374) |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: CF CREW C, day -9, both employees, CF JOB, 07:00-11:00 = 4 cards | |
| 1 | Open View > Time Cards, scope the day and Time Card Crew, Apply Filter (4 rows) | |
| 2 | Tick two own rows, open Multi Update, Field = Employee | |
| 3 | Type "CF C" into the Value box: the box keeps "CF C" | input value "CF C" |
| 4 | The list shows exactly ": CF C ONE" and ": CF C TWO"; no "No Employees Found" | PASS |
| 5 | Close the list. Update Records is never clicked | |

## Expected outcomes

- The typed text stays in the box and the matching employees are offered.
- Nothing is changed.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| View ▸ Time Cards | View, Time Cards | `src/pages/processing/ViewTimeCardsPage.ts` | exists; adds `muEmployeeValue`, `muComboLabels`, `chooseMuField` |

## Data

CF CREW C with CF C ONE and CF C TWO. The (crew, day) pair is C at -9.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 12 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards (own-id capture). The proof is on screen: steps 3, 4 |
| cleanup | before-phase sweep and by-id teardown |

## Cleanup

Own time cards by id, then a crew-day sweep. Nothing is edited.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3181` | In View > Time Cards Multi Update, typing in the Employee value box shows the typed text and finds matching employees | `regression` | 1 after the first green run |

## Open questions for the tester

None.
