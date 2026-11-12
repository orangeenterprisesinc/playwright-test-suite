# `WEBPET-3314` · Transfer to Job Cards – individual and crew piece-outs across two days all pair

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3314 (client feedback); fixes web-pet 57c683e25 / #1128 and aca9858dc / #1136 |
| Plan | test-plans/client-feedback/webpet-3314-tjc-two-day-piece-outs-pair.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3314-tjc-two-day-piece-outs-pair.spec.ts |
| Data | src/data/client-feedback/webpet-3314-tjc-two-day-piece-outs-pair.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3314` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3314`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data (CF CREW B, days -15 seeded and -14 claimed) |

## Steps

| # | Step | Locator / note |
|---|---|---|
| 0 | Arrange: create a run-tagged Time & Piece job on Setup > Job (hourly 15, piece 1), then seed the overnight shift: both employees Time In day -15 22:00; crew piece-out day -14 01:00 x5; CF B ONE individual piece-out day -14 02:00 x3; both Time Out day -14 06:00 = 6 cards | `mintOwnJob`, `createOwnJob`, seed `nextDay` |
| 1 | Open Transfer to Job Cards from the left menu | |
| 2 | Scope the range day -15 to day -14 and Time Card Crew to CF CREW B | `scopeToRange` |
| 3 | Analyze: 6 cards, caption "Includes 6 Time Cards of 6 initial selection" | |
| 4 | Ready 6, Blocking 0, Warnings 0, every row Ready, footer "Transferring all 6 eligible records." | `readyCount`, `blockingCount`, `warningsPillCount`, `scopeHint` |

## Expected outcomes

- All 6 records are Ready with 0 Blocking and 0 Warnings.
- The footer reads "Transferring all 6 eligible records.".
- The day -14 crew piece-out pairs with the day -15 overnight card.

## Screens and page objects

| Screen | Page object | Status |
|---|---|---|
| Setup > Job | `src/pages/setup/JobPage.ts` | exists; adds the `TimeAndPiece` payment type (value 3) |
| Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `warningsPillCount`, `scopeHint` |

## Data

CF CREW B with CF B ONE and CF B TWO, CF RANCH, CF FIELD, and the run-minted job (`... NEW JOB <stamp>`). The pairs are B at -15 (seeded) and B at -14 (claimed through `extraCrews`, swept, never seeded). Keep B at -13 and B at -16 unassigned as a buffer: the crew piece-out window may reach across the date.

## Preconditions

- [ ] su login from storageState; `maximumDaysForTransferExport` is at least 15.
- [ ] At day -14 06:00 the Crew Time Out roster offers CF B ONE/TWO, whose open time-in is from day -15; if it does not, report it, do not route it through the API.

## API allowances

| Allowance | Use |
|---|---|
| arrange | CF fixture rows when missing |
| plumbing read | GET preferences and GET time-cards (own ids on both days) |
| cleanup | sweep both crew-days, delete time cards by id, then delete the job by name (the `NEW JOB` residue prefix is the backstop if the delete answers 409) |

## Cleanup

The job delete is registered before `prepareCfRun`, so it runs after the time cards are gone. Nothing is transferred.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3314`), tag `regression`. The spec title equals the runner `testTitle`.

## Open questions for the tester

None. To measure on dev: that the Job form accepts "Time & Piece" and the free-text code, that the new job appears straight away in the Crew Time In, Crew Piece Out and Add Piece-out pickers, and the footer text and testid.
