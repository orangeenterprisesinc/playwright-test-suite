# `WEBPET-3941` · Transfer to Job Cards – the crew's Break Preparation Job is inserted before a paid break, as legacy does

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3941 |
| Plan | test-plans/client-feedback/webpet-3941-tjc-break-preparation-job.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3941-tjc-break-preparation-job.spec.ts |
| Data | src/data/client-feedback/webpet-3941-tjc-break-preparation-job.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3941` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3941`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data + CF CREW C setup edit + Paid Break Job designation (both restored) |

## Traceability

| Field | Value |
|---|---|
| Fix | web-pet ed97784b6 / merge b2c5f91cb: `transfer.Plan()` applies the crew's Break Preparation per crew; guard: the break card's job is the Paid Break Job or is in the PaidBreakJobGroup |
| Rule | The NPT card goes in at the break punch, the break's time-in moves later by the prep length; a null or 0 length means no prep card |
| Sign-off | Amy 2026-11-02 (Cloud preview): NPT 9:00-9:05, Break 9:05-9:15 |

## Steps

| # | Step | Expected |
|---|---|---|
| 0 | `prepareCfRun` (C@-13), `ensureCfBreakJobs` (CF BREAK JOB 9071, CF NPT JOB 9072, both Time, rate 1) | |
| 1 | Setup ▸ Crew ▸ CF CREW C: Preparation Job = CF NPT JOB, Length 5, "Only Piece Jobs Require Break Preparation" off, Save | GET crews/{id} stores them; re-opened form shows them |
| 2 | Seed CF C ONE on screen: Crew Time In 07:00 CF JOB; 09:00 CF BREAK JOB; 09:10 CF JOB; Crew Time Out 11:00 | 4 time cards |
| 3 | Preferences ▸ Job ▸ Paid Break Job = CF BREAK JOB (`designatePaidBreakJob`, paid-break-job lock) | read back on screen |
| 4 | Transfer to Job Cards from the menu; the day; Time Card Crew = CF CREW C; Analyze (4); Job Cards tab | 4 rows: CF JOB 07:00-09:00 (120), CF NPT JOB 09:00-09:05 (5), CF BREAK JOB 09:05-09:10 (5, ends at its real 09:10 punch), CF JOB 09:10-11:00 (110); the break starts 5 min after its punch; total 240; totals bar Job Cards 4, Employees 1 |
| 5 | Paid Break Job restore; CF CREW C Break Preparation back to job none, length empty | re-opened form shows the prior value |

## Expected outcomes

- Before a paid break the crew's Break Preparation Job is inserted for its length, and the break starts that much later.
- Not asserted: per-row Amount (paid-break pricing is E4's average-rate rule); the commit (preview only).

## Screens and page objects

| Screen | Page object | Status |
|---|---|---|
| Setup ▸ Crew | `src/pages/setup/CrewPage.ts` | adds the Preparation Job members (`readBreakPreparation`, `setBreakPreparation`) |
| Preferences ▸ Job | `src/pages/admin/PreferencesPage.ts` via `paidBreakJob.ts` | reused |
| TJC Job Cards tab | `src/pages/processing/TransferToJobCardsPage.ts` | `openJobCardsTab`, `previewSegments`, `previewTotals`; `previewClock` from `@utils/journeys/transferPreview` |

## Data

CF CREW C (+ CF C ONE), CF JOB, CF RANCH/FIELD, new fixture jobs CF BREAK JOB (9071) and CF NPT JOB (9072). Pair C@-13.

## Preconditions

- [ ] su login; `maximumDaysForTransferExport` ≥ 13.
- [ ] Paid Break Job unset, or a suite job (B/D/CF); another job fails by name.

## API allowances

| Allowance | Use |
|---|---|
| arrange | CF jobs via ensureOnScreen |
| plumbing read | GET crews/{id}, GET preferences, GET time-cards, non-committing analyze and job-cards-preview |
| cleanup | sweeps; `PUT preferences {paidBreakJob: 0}` (existing restore); `PUT crews/{id}` with the snapshot's three prep fields only if the on-screen restore did not run |

## Cleanup

On-screen crew restore (step 5) and the paid-break-job restore; teardown deletes the 4 time cards by id and sweeps the day.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3941` | Transfer inserts the crew's Break Preparation Job before a paid break, as legacy does | `regression` | 1 after the first green run |

## Open questions for the tester

None.
