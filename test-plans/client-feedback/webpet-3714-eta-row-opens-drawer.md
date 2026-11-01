# `WEBPET-3714` · Clicking a row on Export to Accounting opens the job card in a right-side drawer

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3714 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3714-eta-row-opens-drawer.md |
| Spec | tests/web/client-feedback/export-to-accounting/webpet-3714-eta-row-opens-drawer.spec.ts |
| Data | src/data/client-feedback/webpet-3714-eta-row-opens-drawer.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3714` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3714`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | not recorded |

## Steps

| # | Step | Confirmed on dev 2026-11-01 |
|---|---|---|
| 0 | Arrange: CF CREW D, day -4, both employees, CF JOB, 07:00-11:00 = 4 cards | |
| 1 | Transfer the crew's day (2 job cards) | |
| 2 | Export to Accounting via the menu, Payroll, the day, Job Card Crew contains CF CREW D, Refresh, all inside the export-draft lock | "Export run created" |
| 3 | Click a row's Employee cell: the "Edit Job Card" drawer opens on the right with Reference, Date / Time In, Employee, Job, Ranch, Crew (CF CREW D); the screen stays behind it; close with X (never Save or Delete); Dates, "2 matched" and the 2 rows are unchanged | PASS |
| 4 | The Refresh draft is dropped inside the lock | |

## Expected outcomes

- A row click opens the job card in a right-side drawer over the Export to Accounting screen.
- Closing the drawer leaves the scope and the candidate rows unchanged.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Export to Accounting | File ▸ Export to Accounting | `src/pages/processing/ExportToAccountingPage.ts` | exists; adds `openRowDrawer`, `closeRowDrawer`, `rowDrawer`, `screenHeading` |
| Transfer to Job Cards | Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists, driven through `transferCrewDay` |

## Data

CF CREW D with CF D ONE and CF D TWO, CF JOB. The (crew, day) pair is D at -4.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 4 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards and GET job-cards (own ids). The proof is on screen: step 3 |
| cleanup | before-phase sweep, the draft DELETE inside the lock, and by-id teardown of job cards and time cards |

## Cleanup

`registerCfCleanup` deletes the own job cards and time cards by id. The Refresh draft is deleted inside the lock by `withCrewEta`.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3714` | Clicking a row on Export to Accounting opens the job card in a right-side drawer | `regression` | 1 after the first green run |

## Open questions for the tester

None.
