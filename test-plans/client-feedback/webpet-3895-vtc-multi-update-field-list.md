# `WEBPET-3895` · View Time Cards – the Multi Update field list includes the fields Windows PET offers

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3895 (Done; customer Cesar); fix web-pet #1502 |
| Plan | test-plans/client-feedback/webpet-3895-vtc-multi-update-field-list.md |
| Spec | tests/web/client-feedback/view-time-cards/webpet-3895-vtc-multi-update-field-list.spec.ts |
| Data | src/data/client-feedback/webpet-3895-vtc-multi-update-field-list.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3895` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3895`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Cesar 10-26 |
| Evidence | none |
| Fix | web-pet #1502 |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: CF CREW C, day -8, both employees, CF JOB, 07:00-11:00 = 4 cards | |
| 1 | Open View > Time Cards, scope the day and Time Card Crew, Apply Filter (4 rows) | |
| 2 | Tick two own rows, open Multi Update: the button reads "Update Records (2)" | |
| 3 | The Field list contains Date, Time / Employee Selection / GPS Reading / Run / Traceability and the original fields. Nothing is updated | 19 fields |

## Expected outcomes

- The Field list offers every field Windows PET offers.
- Nothing is changed: Update Records is never clicked.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| View ▸ Time Cards | View, Time Cards | `src/pages/processing/ViewTimeCardsPage.ts` | exists; adds `openMultiUpdate`, `muFieldLabels`, `updateRecordsButton` |

## Data

CF CREW C with CF C ONE and CF C TWO. The (crew, day) pair is C at -8. Day -7 stays reserved for WEBPET-3940 (manual fail).

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 12 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards (own-id capture). The proof is on screen: steps 2, 3 |
| cleanup | before-phase sweep and by-id teardown |

## Cleanup

Own time cards by id, then a crew-day sweep. Nothing is edited.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3895` | The Multi Update field list on View > Time Cards includes the fields Windows PET offers | `regression` | 1 after the first green run |

## Open questions for the tester

None.
