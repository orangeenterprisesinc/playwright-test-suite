# `WEBPET-3817` · A saved report script runs from Reports > Report Scripts with its relative dates and Execute Report setting

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3817 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3817-report-script-this-week.md |
| Spec | tests/web/client-feedback/reports/webpet-3817-report-script-this-week.spec.ts |
| Data | src/data/client-feedback/webpet-3817-report-script-this-week.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3817` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3817`) |
| Journey | none |
| Surface | ui |
| Bucket | B: one minted report script |

## Steps

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 0 | Mint `W3817 NEW REPORT SCRIPT <stamp>`; register teardown | |
| 1 | Time In: Date In ▸ Current ▸ This week; Save ▸ Save as New (Execute report on) | PASS |
| 2 | Reports ▸ Report Scripts: filter, select, Execute | PASS |
| 3 | Lands on Time In Report Selection ("Date In is This week"); PDF viewer opens; no Report dialog | PASS |
| 4 | Run criterion `{dateIn, current, currentWeek}`; PDF text contains "Date In is This week" | criterion PASS; PDF text unverified in walk |
| 5 | Delete on screen | PASS |

## Expected outcomes

- The report runs straight away (Execute Report = Yes), without stopping on the selection screen or the Report dialog.
- The dates are the current week: the script stores and sends the relative "This week", resolved at run time.
- Deferred: proving the Monday–Sunday boundaries. It needs time-ins seeded on this week's Monday and Sunday, plus one outside the week; no screen shows the resolved dates.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Time In Report Selection | Reports ▸ Input ▸ Time In | `src/pages/reports/ScreenReportSelectionPage.ts` | new |
| Report Scripts | Reports ▸ Report Scripts | `src/pages/reports/ReportScriptsPage.ts` | new |
| Filter Scripts | File ▸ Administration ▸ Setup ▸ Scripts | `src/pages/admin/FilterScriptsPage.ts` | extended (`deleteScript`) |

## Data

One run-minted Time In report script.

## API allowances

| Allowance | Use |
|---|---|
| arrange | none |
| plumbing read | none (the run criterion is read from the page's own POST /reports/run; `api-only-evidence` annotation) |
| cleanup | by-name `filterScript` delete at teardown; residue sweep reclaims `NEW REPORT SCRIPT` older than 2 h |

## Cleanup

On-screen delete (soft; the name stays reserved).

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3817` | A saved report script runs from Reports > Report Scripts with its relative dates and Execute Report setting | `regression` | 1 after the first green run |

## Open questions for the tester

None.
