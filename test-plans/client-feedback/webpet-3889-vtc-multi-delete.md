# `WEBPET-3889` · View Time Cards – several checked time cards can be deleted together

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3889 (Done; customer Anthony); fix web-pet #1496 |
| Plan | test-plans/client-feedback/webpet-3889-vtc-multi-delete.md |
| Spec | tests/web/client-feedback/view-time-cards/webpet-3889-vtc-multi-delete.spec.ts |
| Data | src/data/client-feedback/webpet-3889-vtc-multi-delete.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3889` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3889`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy 10-26 |
| Evidence | none |
| Fix | web-pet #1496 |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: CF CREW C, day -5, CF C ONE Time In 07:00 + Time Out 11:00 = 2 cards | |
| 1 | Open View > Time Cards, scope the day and Time Card Crew, Apply Filter (2 rows) | |
| 2 | Delete is disabled with nothing ticked; tick both own rows, Delete is enabled | Modify disables |
| 3 | Delete, then confirm `Delete "2 Time Cards"?` ("A card the system refuses to delete is skipped and reported.") | |
| 4 | Toast "Deleted 2 Time Card record(s)."; both rows gone; the empty state shows | PASS |

## Expected outcomes

- Several checked cards are deleted together and the count is reported.
- The deletes are the workflow itself and happen on screen. Not covered: WEBPET-3940 (the bulk delete never appears on Reverse Multi Delete, a manual fail), whose runner row stays `draft,0`.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| View ▸ Time Cards | View, Time Cards | `src/pages/processing/ViewTimeCardsPage.ts` | exists; adds `deleteButton`, `confirmDelete`, `cardGrid` |

## Data

CF CREW C with CF C ONE and CF C TWO. The (crew, day) pair is C at -5.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 12 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards (own-id capture). The proof is on screen: steps 2 to 4 |
| cleanup | before-phase sweep and by-id teardown (`forgetCards` drops the deleted ids from the by-id list) |

## Cleanup

Own time cards by id, then a crew-day sweep. The two deleted cards leave the by-id list.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3889` | Several checked time cards can be deleted together on View > Time Cards | `regression` | 1 after the first green run |

## Open questions for the tester

None.
