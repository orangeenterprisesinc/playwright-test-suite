# `WEBPET-3462` · Reports > Input > Job Card opens the Job Card Report Selection screen with a working selection and Execute

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3462 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3462-job-card-report-selection.md |
| Spec | tests/web/client-feedback/reports/webpet-3462-job-card-report-selection.spec.ts |
| Data | src/data/client-feedback/webpet-3462-job-card-report-selection.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3462` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3462`) |
| Journey | none |
| Surface | ui |
| Bucket | A: read-only (report run only) |

## Steps

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 1 | Reports ▸ Input ▸ Job Card; title, date range, Start 12:00 AM, End 11:59 PM, Execute / Load / Save | PASS |
| 2 | Pick two past days, 00:00–23:59 | popup confirmed (Today, Apply, Month/Day segments) |
| 3 | Search by Job Card Crew, Match Contains, CF CREW A code | PASS |
| 4 | Filter description: date line and `Job Card Crew contains "<code>"` | PASS |
| 5 | Execute opens "Report: All Data — <date>"; PDF answers 200 | PASS |

## Expected outcomes

- The screen is "Job Card Report Selection", with the date range, Start time, End time and Execute.
- The Filter description shows the Date In range (12:00 AM to 11:59 PM) and the crew criterion.
- Execute opens the report dialog for the selected job cards, and its PDF runs.
- Not asserted: the PDF's rows (no seeded job cards; deferred).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Job Card Report Selection | Reports ▸ Input ▸ Job Card | `src/pages/reports/JobCardReportSelectionPage.ts` | new |
| Report dialog / PDF viewer | (Execute) | `src/pages/processing/ReportDialog.ts` | reused |

## Data

The CF CREW A code (fixture.json); no records. Dates come from the browser clock and locale.

## API allowances

None.

## Cleanup

None.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3462` | Reports > Input > Job Card opens the Job Card Report Selection screen with a working selection and Execute | `regression` | 1 after the first green run |

## Open questions for the tester

None.
