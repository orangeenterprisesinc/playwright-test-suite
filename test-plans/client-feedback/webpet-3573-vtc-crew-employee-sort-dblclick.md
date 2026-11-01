# `WEBPET-3573` · View Time Cards – sorts by Crew then Employee, a + button on each row, a double-click opens the record

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3573 (Done; customer Anthony); fixes web-pet #1358 / #1350 / #1382 |
| Plan | test-plans/client-feedback/webpet-3573-vtc-crew-employee-sort-dblclick.md |
| Spec | tests/web/client-feedback/view-time-cards/webpet-3573-vtc-crew-employee-sort-dblclick.spec.ts |
| Data | src/data/client-feedback/webpet-3573-vtc-crew-employee-sort-dblclick.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3573` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3573`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy 10-07 |
| Evidence | none |
| Fix | web-pet #1358 / #1350 / #1382 |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: CF CREW C, day -3; TWO 06:00-10:00 seeded first, then ONE 07:00-11:00 = 4 cards | |
| 1 | Open View > Time Cards, scope the day and Time Card Crew, Apply Filter (4 rows) | |
| 2 | With no header click the order is ONE 7:00 AM, ONE 11:00 AM, TWO 6:00 AM, TWO 10:00 AM; one Work Crew | crew → employee → time |
| 3 | Every own row has a + button; no "25,000" banner | "Add a record for <ref>" on every row |
| 4 | Double-click ONE's Time In: the "Edit Time In" sheet opens on 07:00 for CF C ONE; Cancel | single click only selects the row |

## Expected outcomes

- Default order is crew, then employee, then time; each row has +; a double-click opens the record.
- Not asserted: grouping across two crews (one fixture crew per ticket); employee-before-time inside the crew proves the cascade.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| View ▸ Time Cards | View, Time Cards | `src/pages/processing/ViewTimeCardsPage.ts` | exists; adds `cardGrid`, `rowAddButton`, `openRecordByDoubleClick` |

## Data

CF CREW C with CF C ONE and CF C TWO, CF JOB. The (crew, day) pair is C at -3.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 12 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards (own-id capture). The proof is on screen: steps 2 to 4 |
| cleanup | before-phase sweep and by-id teardown |

## Cleanup

Own time cards by id, then a crew-day sweep. The record sheet is left through Cancel, never Save.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3573` | View > Time Cards sorts by Crew then Employee, shows a + button on each row, and a double-click opens the record | `regression` | 1 after the first green run |

## Open questions for the tester

None.
