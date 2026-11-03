# `WEBPET-3701` · Print Badges prints a badge for an inactive record that the grid shows

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3701 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3701-field-inactive-print-badge.md |
| Spec | tests/web/client-feedback/setup/webpet-3701-field-inactive-print-badge.spec.ts |
| Data | src/data/client-feedback/webpet-3701-field-inactive-print-badge.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3701` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3701`) |
| Journey | none |
| Surface | ui |
| Bucket | B: fixture; CF INACTIVE FIELD 9005 (new fixed row under CF RANCH) |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | not recorded |

## Steps

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 1 | Menu Setup ▸ Field, Name filter leaves 1 row with Active unticked | PASS (walked on 5215-Grape Embryos) |
| 2 | Print Badges (Records = Current filter) → Print opens the viewer | PASS |
| 3 | The PDF holds one badge: the ranch name and the field name | PASS |

## Expected outcomes

- A badge is printed for the inactive field, and the report is not empty.
- The badge carries the field's ranch.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Field | Setup ▸ Field | `src/pages/setup/FieldPage.ts` | exists; adds `SetupScreenPage.printBadges`, `DataGridComponent.activeCheckbox` |

## Data

CF INACTIVE FIELD (code 9005, Active = No) under CF RANCH, from `fixture.json`. Created on screen the first time (restored from the recycle bin if it was binned) and kept inactive by `ensureFieldOnScreen` (`active: false`). Never deleted. No (crew, day) pair.

## Preconditions

- [ ] su login from storageState.

## API allowances

| Allowance | Use |
|---|---|
| arrange | CF INACTIVE FIELD created on screen the first time; recycle-bin restore if it was binned |
| plumbing read | field GETs inside the fixture lookup |
| cleanup | none |

## Cleanup

None; the field is a fixed fixture row.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3701` | Print Badges prints a badge for an inactive record that the grid shows | `regression` | 1 after the first green run |

## Open questions for the tester

None.
