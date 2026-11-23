# `WEBPET-3937` · The reverse export card reads 'Reverse Export to Accounting (Payroll / Cost Accounting)'

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
| Bucket | A: read-only hub |

## Steps
New shell (web-pet #1569): File ▸ Restore or Reverse is gone; its two reverse-export items are one card on the Export hub.
On the classic shell (walked 2026-11-02) the two items read 'Reverse Export to Accounting (Cost Accounting)' and '(Payroll)'.

| # | Step | Confirmed on dev 2026-11-20 |
|---|---|---|
| 1 | Open the app; Export hub | PASS |
| 2 | The card for /export-to-accounting/reverse reads 'Reverse Export to Accounting (Payroll / Cost Accounting)' | PASS |
| 3 | 'Reverse Job Costing Export to Accounting' and 'Reverse Payroll Export to Accounting' are not on the hub | PASS |

## Expected outcomes
- The card carries the legacy caption; both old captions are gone.
- Not asserted: the screen behind the card (read-only ticket); the two separate captions '(Cost Accounting)' and '(Payroll)', which the new shell shows as one card.

## Screens and page objects
| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Export hub | Export | `src/pages/shell/LeftNavigationPage.ts` (`openHub`, `hubCard`) | existing |

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
| `WEBPET-3937` | The reverse export card reads the legacy caption | `regression` | 1 |

## Open questions for the tester
None.
