# `WEBPET-3890` · View Time Cards – each row has a trash bin icon that deletes that one time card

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3890 (Done; customer Anthony); fix web-pet #1495 |
| Plan | test-plans/client-feedback/webpet-3890-vtc-row-trash-delete.md |
| Spec | tests/web/client-feedback/view-time-cards/webpet-3890-vtc-row-trash-delete.spec.ts |
| Data | src/data/client-feedback/webpet-3890-vtc-row-trash-delete.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3890` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3890`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy 10-26 |
| Evidence | none |
| Fix | web-pet #1495 |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: CF CREW C, day -6, CF C ONE Time In 07:00 = 1 card | |
| 1 | Open View > Time Cards, scope the day and Time Card Crew, Apply Filter (1 row) | |
| 2 | The row's + button is left of its trash icon, which is left of the Employee cell | x 282 / 326 / 530 |
| 3 | Click the trash icon, confirm `Delete "Time Card <ref>"?` ("Are you sure? This action cannot be undone.") | |
| 4 | Toast "Time card record deleted"; the row is gone; the empty state shows | PASS |

## Expected outcomes

- Each row has a trash icon that deletes that one card after a confirmation.
- The delete is the workflow itself and happens on screen.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| View ▸ Time Cards | View, Time Cards | `src/pages/processing/ViewTimeCardsPage.ts` | exists; adds `rowTrashButton`, `rowAddButton`, `leftEdge`, `confirmDelete` |

## Data

CF CREW C with CF C ONE and CF C TWO. The (crew, day) pair is C at -6.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 12 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards (own-id capture). The proof is on screen: steps 2 to 4 |
| cleanup | before-phase sweep and by-id teardown (`forgetCards` drops the deleted id) |

## Cleanup

Own time cards by id, then a crew-day sweep. The deleted card leaves the by-id list.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3890` | Each row on View > Time Cards has a trash bin icon that deletes that one time card | `regression` | 1 after the first green run |

## Open questions for the tester

None.
