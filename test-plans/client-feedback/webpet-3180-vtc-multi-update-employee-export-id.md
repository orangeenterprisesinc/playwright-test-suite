# `WEBPET-3180` · View Time Cards Multi Update – the Employee list shows 'Export ID : Name' for each employee

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3180 (Done; customer Anthony; also WEBPET-3254); fixes web-pet #1057 / #1062 |
| Plan | test-plans/client-feedback/webpet-3180-vtc-multi-update-employee-export-id.md |
| Spec | tests/web/client-feedback/view-time-cards/webpet-3180-vtc-multi-update-employee-export-id.spec.ts |
| Data | src/data/client-feedback/webpet-3180-vtc-multi-update-employee-export-id.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3180` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3180`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy 09-24 |
| Evidence | none |
| Fix | web-pet #1057 / #1062 |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: CF CREW C, day -11, both employees, CF JOB, 07:00-11:00 = 4 cards | |
| 1 | Open View > Time Cards, scope the day and Time Card Crew, Apply Filter (4 rows) | |
| 2 | Tick two own rows, open Multi Update, Field = Employee, click the Value box | |
| 3 | Every option reads "<Export ID> : <Name>"; ": CF C ONE" and ": CF C TWO" are offered; the bare name is not | 44 options, e.g. "2345 : A Kishore" |
| 4 | Close the list. Nothing is updated | |

## Expected outcomes

- Every employee in the list reads Export ID : Name.
- Not asserted: a populated Export ID on own data; the CF fixture employees carry none (WEBPET-3283 relies on ": NAME"), so they read ": CF C ONE".

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| View ▸ Time Cards | View, Time Cards | `src/pages/processing/ViewTimeCardsPage.ts` | exists; adds `muEmployeeValue`, `muComboLabels`, `chooseMuField` |

## Data

CF CREW C with CF C ONE and CF C TWO. The (crew, day) pair is C at -11.

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

Own time cards by id, then a crew-day sweep. Nothing is edited.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3180` | The Multi Update employee list shows 'Export ID : Name' for each employee | `regression` | 1 after the first green run |

## Open questions for the tester

None.
