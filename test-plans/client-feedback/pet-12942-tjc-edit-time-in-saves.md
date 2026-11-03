# `PET-12942` · Transfer to Job Cards – editing the time of an existing Time In saves

| Artifact | Path |
|---|---|
| Ticket | PET-12942 |
| Plan | test-plans/client-feedback/pet-12942-tjc-edit-time-in-saves.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/pet-12942-tjc-edit-time-in-saves.spec.ts |
| Data | src/data/client-feedback/pet-12942-tjc-edit-time-in-saves.json |
| Runner row | src/data/runner/client-feedback.csv → `PET-12942` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `PET-12942`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Client Feedback Happy Path tab (see Jira) |
| Manual walk | 2026-10-31 on dev as su: PASS |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`. CF CREW B, day -10: CF B ONE Time In 07:00 = 1 card (`ownCard`) | |
| 1 | Open, scope the day and the crew, analyze (1) | |
| 2 | Open the Time In (`openRow`), set Date / Time to 06:55 (`setPanelDateTime`); "Unsaved changes" shows | |
| 3 | Save: toast "Time In record saved"; no "Crew should have a Department" text | |
| 4 | The panel closes and the row's time reads 6:55:00 AM | |

## Expected outcomes

- Editing the time of an existing Time In saves.
- Not asserted: the Oracle-sync Department failure itself; the sync module is off on dev.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; reuses `openRow`, `timeInPanel`, `setPanelDateTime`, `savePanel`, `recordToast`, `rowTime`; uses `pageText` (cluster 2 part B) |

## Data

CF CREW B (CF B ONE), CF JOB. The (crew, day) pair is B at -10.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 10 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences and GET time-cards (own-id capture, recorded before asserting). The proof is on screen |
| cleanup | before-phase sweep and by-id teardown. The edited card is the test's own, so it is not restored |

## Cleanup

Own time cards by id, then a crew-day sweep.

## Test case

One ticket, one happy-path test, one runner row (id `PET-12942`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `PET-12942` | Editing the time of an existing Time In on Transfer to Job Cards saves | `regression` | 1 after the first green run |

## Open questions for the tester

None.
