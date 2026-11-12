# `WEBPET-3610` · The Employee Gender select saves Male and shows Male again after reopening

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3610 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3610-employee-gender-saves.md |
| Spec | tests/web/client-feedback/setup/webpet-3610-employee-gender-saves.spec.ts |
| Data | src/data/client-feedback/webpet-3610-employee-gender-saves.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3610` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3610`) |
| Journey | none |
| Surface | ui |
| Bucket | A: fixture employee, restored |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | walk 2026-11-02: Male saves and reopens as Male |
| Fix | not recorded |

## Steps

Revised TC (Gukan agreed, 2026-11-11): the Gender list is Male, Female, Non-Binary; empty comes back through Clear selection.

| # | Step | Confirmed on dev 2026-11-11 |
|---|---|---|
| 0 | Gender on CF D TWO is unset; the before-phase clears a leftover and teardown clears it too | CF D TWO gender = null |
| 1 | Open Setup ▸ Employee ▸ CF D TWO | |
| 2 | The Gender list is exactly Male, Female, Non-Binary, with no Unspecified | confirmed |
| 3 | Choose Male and Save | |
| 4 | Return to the list, reopen: Gender reads Male | |
| 5 | Restore on screen: Clear selection, Save; Gender reads empty | |

## Expected outcomes

- Gender saves Male and reads Male after reopening.
- The Gender list has exactly Male, Female, Non-Binary.
- Not asserted: the stored wire value (Male is stored as 0 per the 11-02 walk); the reopened screen proves the save.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Employee | Setup ▸ Employee | `src/pages/setup/EmployeePage.ts` | exists; adds `genderOptions`, `chooseGender`, `genderClearButton`, `clearGender` |

## Data

CF D TWO (fixture employee, no Gender).

## Preconditions

- [ ] su login from storageState.
- [ ] No other CF spec asserts CF D TWO's Gender.

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| cleanup | before-phase and teardown clear of the employee's Gender (GET, then PUT with gender null) |
| plumbing read | the GET inside that clear |

## Cleanup

`resetCfEmployeeGender` clears Gender before the test and in teardown; the spec also clears it on screen as step 5.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3610` | The Employee Gender select saves Male and shows Male again after reopening | `regression` | 1 after the first green run |

## Open questions for the tester

None. If PUT does not accept `gender: null` as a clear, the cleanup warning attaches and the reset has to switch to the form value the API takes.
