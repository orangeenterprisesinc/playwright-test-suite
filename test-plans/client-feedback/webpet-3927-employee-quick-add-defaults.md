# `WEBPET-3927` · Employee Add > Quick has Name, Middle, Export Identifier and Time Card Defaults, and saves them

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3927 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3927-employee-quick-add-defaults.md |
| Spec | tests/web/client-feedback/setup/webpet-3927-employee-quick-add-defaults.spec.ts |
| Data | src/data/client-feedback/webpet-3927-employee-quick-add-defaults.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3927` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3927`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data. CF RANCH / CF FIELD / CF JOB (fixture) plus one minted employee |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | not recorded |

## Steps

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 0 | Arrange CF RANCH, CF FIELD, CF JOB when missing; mint the employee names | |
| 1 | Open Employee Add ▸ Quick from the menu; the labels and the Time Card Defaults section | PASS |
| 2-3 | Clear the pre-filled Crew; fill First/Last Name, Name, Middle, Export Identifier and the three defaults | |
| 4 | Save employee; the banner names the employee (Barcode assigned by the server) | PASS |
| 5 | Open record; Middle, Export Identifier and defaults are as saved | PASS |
| 6 | Delete the employee on screen | |

## Expected outcomes

- The Quick form shows Name, First Name, Last Name, Middle, Export Identifier and the Time Card Defaults section.
- The banner reads "<name> was added. Ready for the next employee."
- The saved record keeps Middle, Export Identifier, Default Ranch / Field / Job; Always Use Default Job is off.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Employee Add Quick | Employee Add ▸ Quick | `src/pages/setup/EmployeeQuickAddPage.ts` | new |
| Employee Edit | Setup ▸ Employee | `src/pages/setup/EmployeePage.ts` | exists; `readQuickAddFields`, `deleteOpenRecord` added |

## Data

CF fixture rows plus one run-minted employee (`W3927 NEW EMPLOYEE <stamp>`). The spec claims no (crew, day) pair. Crew is cleared because Quick Add pre-fills B1 CREW.

## Preconditions

- [ ] su login from storageState.

## API allowances

| Allowance | Use |
|---|---|
| arrange | `ensureOnScreen` for the three fixture rows when missing |
| plumbing read | none |
| cleanup | by-name employee delete step at teardown; finds nothing once the screen delete ran |

## Cleanup

On-screen Delete. The soft-deleted name stays reserved (WEBPET-1798). A 409 on save fails by name and points at the employee barcode counter; a test never bumps it.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3927` | Employee Add > Quick has Name, Middle, Export Identifier and Time Card Defaults, and saves them | `regression` | 1 after the first green run |

## Open questions for the tester

None.
