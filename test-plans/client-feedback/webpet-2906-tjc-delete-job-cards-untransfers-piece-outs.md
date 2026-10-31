# `WEBPET-2906` · Transfer to Job Cards – deleting job cards makes the transferred Piece Out time cards available again

| Artifact | Path |
|---|---|
| Ticket | WEBPET-2906 |
| Plan | test-plans/client-feedback/webpet-2906-tjc-delete-job-cards-untransfers-piece-outs.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-2906-tjc-delete-job-cards-untransfers-piece-outs.spec.ts |
| Data | src/data/client-feedback/webpet-2906-tjc-delete-job-cards-untransfers-piece-outs.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-2906` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-2906`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Client Feedback Happy Path tab (see Jira) |
| Manual walk | 2026-10-31 on dev as su: PASS (run 601) |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`. CF CREW B, day -9, piece job: 2 Time In 07:00, crew piece-out 09:00 x5, CF B ONE piece-out 10:00 x3 (New record > Add Piece-out), 2 Time Out 11:00 = 6 cards | |
| 1 | `transferCrewDay` (2 job cards) | ONE 3 pcs, TWO 5 pcs |
| 2 | `deleteOwnJobCards`: for each own row Delete > Delete Selected > confirm "Delete "<reference>"? Are you sure? This action cannot be undone." > Delete. Refuses unless the screen is this run's landing | grid then reads "No job cards match the current filter." |
| 3 | Open Transfer from the menu, scope the day and the crew, analyze (6) | all 6 listed again |
| 4 | Both Piece Out rows (crew "—" 5, ": CF B ONE" 3) read Transferred No; Pieces total 8 | |

## Expected outcomes

- Deleting the job cards untransfers the Piece Out time cards and the Pieces total is whole again.
- The spec never uses Delete All.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `addPieceOut` |
| View Job Cards | `View > Job Cards` | `src/pages/processing/ViewJobCardsPage.ts` | exists; adds `deleteOwnJobCard` (Delete Selected, one own row) |

## Data

CF CREW B, CF PIECE JOB. The (crew, day) pair is B at -9.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 9 (dev: 21).
- [ ] `maximumNumberOfPieces` allows 5 (dev: 5).
- [ ] No other worker is on the Transfer screen (the screen lock serialises them).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards and GET job-cards (own ids, recorded before asserting). The proof is on screen |
| cleanup | before-phase sweep and by-id teardown (job cards already deleted on screen are skipped) |

## Cleanup

Own time cards by id, then a crew-day sweep. The job cards are deleted on screen by the test.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-2906`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-2906` | Deleting job cards makes the transferred Piece Out time cards available again on Transfer to Job Cards | `regression` | 1 after the first green run |

## Open questions for the tester

None.
