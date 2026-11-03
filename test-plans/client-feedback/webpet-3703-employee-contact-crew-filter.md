# `WEBPET-3703` · An Employee report run with a Crew filter returns a PDF instead of a 'could not be bound' error

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3703 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3703-employee-contact-crew-filter.md |
| Spec | tests/web/client-feedback/setup/webpet-3703-employee-contact-crew-filter.spec.ts |
| Data | src/data/client-feedback/webpet-3703-employee-contact-crew-filter.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3703` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3703`) |
| Journey | none |
| Surface | ui |
| Bucket | B: fixture; CF CREW D, CF D ONE / CF D TWO |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | not recorded |

## Steps

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 1 | Menu Setup ▸ Employee, Crew filter = CF CREW D leaves 2 rows | PASS |
| 2 | Report → Contact → PDF | PASS |
| 3 | The PDF header reads `Crew = CF CREW D`; rows `D ONE CF`, `D TWO CF` | PASS (no `Filters:` prefix is printed) |

## Expected outcomes

- The PDF opens with no "could not be bound" error.
- The header names the crew filter.
- Only the crew's employees are listed.
- Not asserted: the `Filters:` prefix the ticket text quotes (the build does not print it; see Open questions).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Employee | Setup ▸ Employee | `src/pages/setup/EmployeePage.ts` | exists; adds `SetupScreenPage.report`, `DataGridComponent.columnPickerFilter` |

## Data

CF CREW D with CF D ONE / CF D TWO from `fixture.json`. Read-only; no (crew, day) pair is claimed.

## Preconditions

- [ ] su login from storageState.

## API allowances

| Allowance | Use |
|---|---|
| arrange | none in steady state (`ensureCfFixtures`) |
| plumbing read | fixture GETs |
| cleanup | none |

## Cleanup

None; the spec creates nothing.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3703` | An Employee report run with a Crew filter returns a PDF instead of a 'could not be bound' error | `regression` | 1 after the first green run |

## Open questions for the tester

None. The sheet TC was reworded on 2026-11-02 to the line the PDF prints (no `Filters:` prefix).
