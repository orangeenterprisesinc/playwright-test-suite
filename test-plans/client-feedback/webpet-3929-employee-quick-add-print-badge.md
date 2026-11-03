# `WEBPET-3929` · After saving a Quick Add employee, the banner has a Print badge link

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3929 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3929-employee-quick-add-print-badge.md |
| Spec | tests/web/client-feedback/setup/webpet-3929-employee-quick-add-print-badge.spec.ts |
| Data | src/data/client-feedback/webpet-3929-employee-quick-add-print-badge.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3929` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3929`) |
| Journey | none |
| Surface | ui |
| Bucket | B: one minted employee |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | not recorded |

## Steps

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 0 | Mint the employee names | |
| 1-2 | Open Employee Add ▸ Quick; clear Crew; fill First and Last Name (and Name) | |
| 3-4 | Save employee; the banner offers Print badge and Open record | PASS |
| 5 | Print badge: POST employees/<id>/badge answers 200 with a PDF, a hidden blob print frame is attached, the page stays on Quick Add, the PDF text holds the last and first name | PASS |
| 6 | Open record, then Delete on screen | |

## Expected outcomes

- The banner after Save has a Print badge button and an Open record link.
- Print badge prints the badge without opening the record.
- Not asserted: the OS print dialog is not automatable; the hidden print frame and the PDF are the proof.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Employee Add Quick | Employee Add ▸ Quick | `src/pages/setup/EmployeeQuickAddPage.ts` | new |

## Data

One run-minted employee (`W3929 NEW EMPLOYEE <stamp>`). Name is filled because, left blank, the server composes "<Last> <First>", which the residue sweep cannot date. No (crew, day) pair.

## Preconditions

- [ ] su login from storageState.

## API allowances

| Allowance | Use |
|---|---|
| arrange | none |
| plumbing read | none; the PDF is the response body of the app's own POST |
| cleanup | by-name employee delete step at teardown |

## Cleanup

On-screen Delete via Open record. The soft-deleted name stays reserved (WEBPET-1798).

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3929` | After saving a Quick Add employee, the banner has a Print badge link | `regression` | 1 after the first green run |

## Open questions for the tester

None.
