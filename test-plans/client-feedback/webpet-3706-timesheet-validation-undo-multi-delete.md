# `WEBPET-3706` · Undo after a Setup multi-delete restores the records and shows success with no error

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3706 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3706-timesheet-validation-undo-multi-delete.md |
| Spec | tests/web/client-feedback/setup/webpet-3706-timesheet-validation-undo-multi-delete.spec.ts |
| Data | src/data/client-feedback/webpet-3706-timesheet-validation-undo-multi-delete.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3706` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3706`) |
| Journey | none |
| Surface | ui |
| Bucket | B: two minted validations |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | not recorded |

## Steps

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 0 | Mint two validation names on one stamp | |
| 1 | Setup ▸ TimeSheet Setup; create both rows on screen | PASS |
| 2 | Filter to the own rows, switch on Multi-Edit, tick both | PASS |
| 3 | More actions ▸ Delete ▸ "Delete 2"; toast "Records deleted", grid "No validations found." | PASS |
| 4 | Undo; both rows return, toast "Delete undone", no error toast | PASS |
| 5 | Delete the rows again on screen and leave them deleted | |

## Expected outcomes

- The rows return after Undo.
- A success message shows and no error message does.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| TimeSheet Validations | Setup ▸ TimeSheet Setup | `src/pages/setup/TimeSheetValidationPage.ts` | new |

## Data

Two run-minted validations (`W3706 NEW VALIDATION <stamp>` and `...-2`). No (crew, day) pair.

## Preconditions

- [ ] su login from storageState.

## API allowances

| Allowance | Use |
|---|---|
| arrange | none |
| plumbing read | none |
| cleanup | by-name validation delete step at teardown; the residue sweep reclaims `NEW VALIDATION` rows older than 2 h |

## Cleanup

On-screen Multi-Delete without Undo. Soft-deleted names stay reserved (WEBPET-1798).

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3706` | Undo after a Setup multi-delete restores the records and shows success with no error | `regression` | 1 after the first green run |

## Open questions for the tester

None.
