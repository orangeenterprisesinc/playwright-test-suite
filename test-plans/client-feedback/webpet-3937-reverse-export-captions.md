# `WEBPET-3937` · The reverse export menu items read 'Reverse Export to Accounting (Cost Accounting)' and '(Payroll)'

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3937 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3937-reverse-export-captions.md |
| Spec | tests/web/client-feedback/admin/webpet-3937-reverse-export-captions.spec.ts |
| Data | src/data/client-feedback/webpet-3937-reverse-export-captions.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3937` |

## Catalog entry
| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3937`) |
| Journey | none |
| Surface | ui |
| Bucket | A: read-only menu |

## Steps
| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 1 | Open the app; File ▸ Restore or Reverse | PASS |
| 2 | 'Reverse Export to Accounting (Cost Accounting)' and '(Payroll)' are listed as links | PASS |
| 3 | 'Reverse Job Costing Export to Accounting' and 'Reverse Payroll Export to Accounting' are not listed | PASS |

## Expected outcomes
- Both new captions are listed; both old captions are gone.
- Not asserted: the screens behind the items (read-only ticket); both captions open /export-to-accounting/reverse (finding F4).

## Screens and page objects
| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Sidebar File group | File ▸ Restore or Reverse | `src/pages/shell/FileMenu.ts` | new |

## Data
None.

## API allowances
| Allowance | Use |
|---|---|
| arrange / plumbing read / cleanup | none |

## Cleanup
None.

## Test case
| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3937` | The reverse export items read the legacy captions | `regression` | 1 |

## Open questions for the tester
None.
