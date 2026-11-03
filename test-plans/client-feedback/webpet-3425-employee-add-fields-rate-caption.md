# `WEBPET-3425` · The Add fields picker on Setup > Employee shows a real caption 'Rate' instead of a raw key

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3425 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3425-employee-add-fields-rate-caption.md |
| Spec | tests/web/client-feedback/setup/webpet-3425-employee-add-fields-rate-caption.spec.ts |
| Data | src/data/client-feedback/webpet-3425-employee-add-fields-rate-caption.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3425` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3425`) |
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

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 1 | Open Setup ▸ Employee from the menu | |
| 2 | Add fields opens "Add columns"; it lists Rate and no `form.field…` text | PASS |

## Expected outcomes

- The Add columns list contains the caption Rate.
- No caption is a raw `form.field…` key.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Employee | Setup ▸ Employee | `src/pages/setup/EmployeePage.ts` | exists; `SetupScreenPage.addFieldsCaptions` added |

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

None. The dialog is closed with Escape and nothing is ticked, because the column layout is saved per user.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3425` | The Add fields picker on Setup > Employee shows a real caption 'Rate' instead of a raw key | `regression` | 1 after the first green run |

## Open questions for the tester

None.
