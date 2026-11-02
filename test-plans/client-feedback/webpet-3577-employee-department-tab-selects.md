# `WEBPET-3577` · Pressing Tab in a dropdown after typing a single match selects that value

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3577 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3577-employee-department-tab-selects.md |
| Spec | tests/web/client-feedback/setup/webpet-3577-employee-department-tab-selects.spec.ts |
| Data | src/data/client-feedback/webpet-3577-employee-department-tab-selects.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3577` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3577`) |
| Journey | none |
| Surface | ui |
| Bucket | B: fixture; CF D ONE, department Guerrero (Journey A fixture) |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | not recorded |

## Steps

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 1 | Open the employee from the Setup ▸ Employee list | |
| 2 | Type `Guerr` into Department: one option, Guerrero | PASS |
| 3 | Tab: Department holds Guerrero and focus moves to Crew | PASS |
| 4 | Discard changes, then Don't Save; the grid's Department is still `—` | PASS |

## Expected outcomes

- Department shows the single match after Tab.
- Focus moves to the next field with the value kept.
- Nothing is saved.
- Not asserted: the `Create "Guerr"` button under the match (negative case).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Employee | Setup ▸ Employee | `src/pages/setup/EmployeePage.ts` | exists; adds `typeDepartment`, `leaveWithoutSaving` |

## Data

CF CREW D with CF D ONE / CF D TWO from `fixture.json`. The department is the protected Journey A department Guerrero. The employee is never saved and no (crew, day) pair is claimed.

## Preconditions

- [ ] su login from storageState.

## API allowances

| Allowance | Use |
|---|---|
| arrange | none in steady state (`ensureCfFixtures`) |
| plumbing read | fixture GETs |
| cleanup | none |

## Cleanup

None; the form is left through Don't Save.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3577` | Pressing Tab in a dropdown after typing a single match selects that value | `regression` | 1 after the first green run |

## Open questions for the tester

None.
