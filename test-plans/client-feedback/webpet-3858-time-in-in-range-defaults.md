# `WEBPET-3858` · Choosing In range on a Reports date filter defaults From to 12:00 AM and To to 11:59 PM

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3858 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3858-time-in-in-range-defaults.md |
| Spec | tests/web/client-feedback/reports/webpet-3858-time-in-in-range-defaults.spec.ts |
| Data | src/data/client-feedback/webpet-3858-time-in-in-range-defaults.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3858` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3858`) |
| Journey | none |
| Surface | ui |
| Bucket | A: read-only |

## Steps

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 1 | Reports ▸ Input ▸ Time In; Search by Date In; Match In range | PASS |
| 2 | From = today 00:00, To = today 23:59 | PASS |
| 3 | Filter description "Date In is between '<date>, 12:00 AM' AND '<date>, 11:59 PM'" | PASS |

## Expected outcomes

- From shows today with 12:00 AM; To shows the same date with 11:59 PM.
- The Filter description reads the range with both times.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Time In Report Selection | Reports ▸ Input ▸ Time In | `src/pages/reports/ScreenReportSelectionPage.ts` | new |

## Data

None.

## API allowances

None.

## Cleanup

None.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3858` | Choosing In range on a Reports date filter defaults From to 12:00 AM and To to 11:59 PM | `regression` | 1 after the first green run |

## Open questions for the tester

None.
