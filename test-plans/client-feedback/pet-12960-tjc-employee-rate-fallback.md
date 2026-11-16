# `PET-12960` · Transfer to Job Cards uses legacy's rate lookup – no "No hourly rate available" warning when the employee has a rate

| Artifact | Path |
|---|---|
| Ticket | PET-12960 (client feedback, Transfer to Job Cards) |
| Plan | test-plans/client-feedback/pet-12960-tjc-employee-rate-fallback.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/pet-12960-tjc-employee-rate-fallback.spec.ts |
| Data | src/data/client-feedback/pet-12960-tjc-employee-rate-fallback.json |
| Runner row | src/data/runner/client-feedback.csv → `PET-12960` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `PET-12960`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data (CF CREW C, day -7; the TC says B, but B specs read piece-job warnings and amounts an employee rate would move) |

## Steps

| # | Step | Locator / note |
|---|---|---|
| 0 | Arrange: `prepareCfRun` | |
| 1 | Setup > Employee: CF C TWO shows an hourly rate (set to 15 on screen only when missing) | `ensureCfEmployeeRate`, `input#rate` |
| 2 | `seedCrewDay`: CF C TWO Time In 07:00, individual piece-outs 09:00 x3 and 10:00 x2 (New record > Add Piece-out), Time Out 11:00, on CF PIECE JOB (no hourly rate) = 4 cards | |
| 3 | Open Transfer to Job Cards, scope the day and crew, analyze (4) | |
| 4 | The Issues panel has no "No hourly rate available" group; the Warnings pill reads 0; no own row is a Warning | `issueGroupTexts`, `warningsPillCount`, `rowStatus` |
| 5 | Job Cards tab: every preview row is CF C TWO's and every row's Amount = Net Time x the employee's rate (the preview has no Hourly Rate column, measured 2026-11-11) | `previewColumn` |
| 6 | Restore the employee's rate on screen and read it back | `restoreCfEmployeeRate` |

## Expected outcomes

- The Issues panel has no "No hourly rate available" group.
- Warnings counts 0 and no row of CF C TWO is a Warning.
- The preview shows CF C TWO's cards at the employee's rate.
- Not asserted: Job Cards preview banner warnings (a zero-amount segment) are not the TC's Warnings count.

## Screens and page objects

| Screen | Page object | Status |
|---|---|---|
| Setup > Employee | `src/pages/setup/EmployeePage.ts` | exists; adds `readHourlyRate`, `setHourlyRate` |
| Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `warningsPillCount`, `previewColumn` |

## Data

CF CREW C with CF C TWO, CF PIECE JOB (no hourly rate), CF RANCH, CF FIELD. The (crew, day) pair is C at -7.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 7.

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards (own ids), GET `employees/{id}` in teardown |
| cleanup | crew-day sweep and by-id teardown; the `employees/{id}` PUT that puts the rate back only if the screen restore did not run |

## Cleanup

The rate restore runs on screen at step 6; its teardown PUT is registered before the rate is written. Nothing is transferred.

## Test case

One ticket, one happy-path test, one runner row (id `PET-12960`), tag `regression`. The spec title equals the runner `testTitle`.

## Open questions for the tester

None.
