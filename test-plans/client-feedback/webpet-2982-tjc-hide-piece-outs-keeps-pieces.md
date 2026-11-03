# `WEBPET-2982` · Transfer to Job Cards – Hide piece-outs hides the piece-out rows but the Pieces total stays the same

| Artifact | Path |
|---|---|
| Ticket | WEBPET-2982 |
| Plan | test-plans/client-feedback/webpet-2982-tjc-hide-piece-outs-keeps-pieces.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-2982-tjc-hide-piece-outs-keeps-pieces.spec.ts |
| Data | src/data/client-feedback/webpet-2982-tjc-hide-piece-outs-keeps-pieces.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-2982` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-2982`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Client Feedback Happy Path tab (see Jira) |
| Manual walk | 2026-10-31 on dev as su: PASS |
| Fix | rev 2 of the ticket's PR: a toggle sends no analyze |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`. CF CREW B, day -3, piece job: 2 Time In 07:00, crew piece-out 09:00 x5, 2 Time Out 11:00 = 5 cards | |
| 1 | Open, scope the day and the crew, analyze (5) | "Includes 5 Time Cards of 5 initial selection" |
| 2 | Pieces reads 5 and one "Piece Out" row is listed | |
| 3 | Tick Hide piece-outs (`setHidePieceOuts`) | caption "4 of 4", Pieces still 5, piece-out row gone, no analyze request |
| 4 | Untick | caption and row back, Pieces 5 |

## Expected outcomes

- Hide piece-outs removes the piece-out rows and the Pieces total is unchanged.
- The toggle is a display lens: no analyze request is sent.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `hidePieceOutsCheckbox`, `setHidePieceOuts` |

## Data

CF CREW B (CF B ONE, CF B TWO), CF PIECE JOB. The (crew, day) pair is B at -3.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 3 (dev: 21).
- [ ] `maximumNumberOfPieces` allows 5 (dev: 5).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences and GET time-cards (own-id capture, recorded before asserting). The proof is on screen |
| cleanup | before-phase sweep and by-id teardown. Nothing is committed |

## Cleanup

Own time cards by id, then a crew-day sweep. Nothing is transferred.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-2982`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-2982` | Hide piece-outs hides the piece-out rows but the Pieces total stays the same | `regression` | 1 after the first green run |

## Open questions for the tester

None.
