# `WEBPET-3819` · View Time Cards – Reports can be run when a Time Card Crew filter is applied

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3819 (Done; customer Cesar); fix web-pet #1482 |
| Plan | test-plans/client-feedback/webpet-3819-vtc-report-with-crew-filter.md |
| Spec | tests/web/client-feedback/view-time-cards/webpet-3819-vtc-report-with-crew-filter.spec.ts |
| Data | src/data/client-feedback/webpet-3819-vtc-report-with-crew-filter.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3819` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3819`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Cesar 10-21 |
| Evidence | none |
| Fix | web-pet #1482 |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: CF CREW C, day -4, both employees, CF JOB, 07:00-11:00 = 4 cards | |
| 1 | Open View > Time Cards, scope the day and Time Card Crew contains "CF CREW C", Apply Filter (4 rows) | |
| 2 | The criterion line is shown; Report and Display Report are enabled | enabled |
| 3 | Hover Report: no "cannot apply the selection" text anywhere | no tooltip |
| 4 | Report opens the dialog titled "Report: …"; close it | "Report: All Data — 10/31/2026" |

## Expected outcomes

- With a Time Card Crew filter applied Report is enabled and opens the report dialog.
- Not asserted: no report is run (PDF, Excel, Save stay unclicked).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| View ▸ Time Cards | View, Time Cards | `src/pages/processing/ViewTimeCardsPage.ts` | exists; adds `report` (uses `ReportDialog`), `reportButton`, `displayReportButton` |

## Data

CF CREW C with CF C ONE and CF C TWO, CF JOB. The (crew, day) pair is C at -4.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 12 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards (own-id capture). The proof is on screen: steps 2 to 4 |
| cleanup | before-phase sweep and by-id teardown |

## Cleanup

Own time cards by id, then a crew-day sweep.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3819` | Reports can be run on View > Time Cards when a Time Card Crew filter is applied | `regression` | 1 after the first green run |

## Open questions for the tester

None.
