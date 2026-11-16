# `WEBPET-3781` · Every Reports > Input screen (e.g. Time In) opens a legacy-style selection screen with Execute, Load and Save

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3781 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3781-time-in-report-selection.md |
| Spec | tests/web/client-feedback/reports/webpet-3781-time-in-report-selection.spec.ts |
| Data | src/data/client-feedback/webpet-3781-time-in-report-selection.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3781` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3781`) |
| Journey | none |
| Surface | ui |
| Bucket | A: no data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | not recorded |

## Steps

Revised TC (Gukan, 2026-11-11): open the screen directly and check it sits under Reports.

| # | Step | Confirmed on dev 2026-11-11 |
|---|---|---|
| 1 | Open Reports ▸ Time In (the screen has no hub card since web-pet #1569, so it is a deep link) | /reports/screen/time-in |
| 2 | The breadcrumb reads Reports › Input › Time In | confirmed (screenshot) |
| 3 | Heading "Time In Report Selection" | confirmed |
| 4 | Search by shows "Select a field"; Clear All is shown | confirmed |
| 5 | The Filter description reads "No filters selected." | confirmed |
| 6 | Execute, Load and Save are shown | confirmed |
| 7 | Execute opens the Report dialog and its PDF comes back with 200 | |

## Expected outcomes

- The Time In selection screen sits under Reports and offers Search by, Clear All, Execute, Load and Save.
- Execute opens the Report dialog for the unfiltered selection and the PDF is produced.
- Not asserted (revised TC): the Reports > Input item list and any date range (the screen has none).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Time In Report Selection | Reports ▸ Input ▸ Time In | `src/pages/reports/ScreenReportSelectionPage.ts` | exists; adds `breadcrumb`, `breadcrumbTrail`, `button` |

## Data

None.

## Preconditions

- [ ] su login from storageState.
- [ ] An unfiltered Time In PDF returns within the report timeout (unmeasured; if it 504s, stop at the open dialog and annotate).

## API allowances

| Allowance | Use |
|---|---|
| none | read-only screen |

## Cleanup

None.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3781` | Every Reports > Input screen (e.g. Time In) opens a legacy-style selection screen with Execute, Load and Save | `regression` | 1 after the first green run |

## Open questions for the tester

None.
