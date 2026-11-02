# `WEBPET-3503` · The Reports hub 'For' filter shows only reports for exactly the chosen module

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3503 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3503-reports-hub-for-filter.md |
| Spec | tests/web/client-feedback/reports/webpet-3503-reports-hub-for-filter.spec.ts |
| Data | src/data/client-feedback/webpet-3503-reports-hub-for-filter.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3503` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3503`) |
| Journey | none |
| Surface | ui |
| Bucket | A: read-only |

## Steps

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 1 | File ▸ Administration ▸ Reports | PASS |
| 2 | For = Employee: 32 rows, all "Employee", no "Employee Class" | PASS |
| 3 | For = Job: 3 rows, all "Job", no Job Card / Job Category / Job Group / Job Type | PASS |

## Expected outcomes

- With Employee, every row has For = Employee and no row says Employee Class.
- With Job, no Job Card, Job Category, Job Group or Job Type row is shown.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Reports hub | File ▸ Administration ▸ Reports | `src/pages/reports/ReportsHubPage.ts` | reused |

## Data

None.

## API allowances

None.

## Cleanup

None.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3503` | The Reports hub 'For' filter shows only reports for exactly the chosen module | `regression` | 1 after the first green run |

## Open questions for the tester

None.
