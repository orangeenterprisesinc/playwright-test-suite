# `WEBPET-3715` · Export to Accounting no longer has the Scope Adjustments panel or the Include re-export candidates toggle

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3715 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3715-eta-no-scope-adjustments.md |
| Spec | tests/web/client-feedback/export-to-accounting/webpet-3715-eta-no-scope-adjustments.spec.ts |
| Data | src/data/client-feedback/webpet-3715-eta-no-scope-adjustments.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3715` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3715`) |
| Journey | none |
| Surface | ui |
| Bucket | A: screen only, no rows |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | not recorded |

## Steps

| # | Step | Confirmed on dev 2026-11-01 |
|---|---|---|
| 1 | Open Export to Accounting from the menu (no arrange, no draft, no lock) | |
| 2 | "Scope Adjustments" and "Include re-export candidates" are not on the screen | PASS, with and without rows |
| 3 | The first labels under the step bar are Refine, Dates, Search by | PASS |

## Expected outcomes

- Neither the Scope Adjustments panel nor the Include re-export candidates toggle is present.
- The first items under the step bar are Refine, Dates, Search by.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Export to Accounting | File ▸ Export to Accounting | `src/pages/processing/ExportToAccountingPage.ts` | exists; adds `screenText`, `labelsUnderStepBar` |

## Data

None. The spec seeds nothing and claims no (crew, day) pair.

## Preconditions

- [ ] su login from storageState.

## API allowances

| Allowance | Use |
|---|---|
| arrange | none |
| plumbing read | none |
| cleanup | none |

## Cleanup

None; the spec creates nothing.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3715` | Export to Accounting no longer has the Scope Adjustments panel or the Include re-export candidates toggle | `regression` | 1 after the first green run |

## Open questions for the tester

None.
