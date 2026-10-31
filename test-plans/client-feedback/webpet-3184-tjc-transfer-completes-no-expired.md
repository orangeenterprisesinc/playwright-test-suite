# `WEBPET-3184` · Transfer to Job Cards – the transfer completes without the "Transfer result expired" error

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3184 |
| Plan | test-plans/client-feedback/webpet-3184-tjc-transfer-completes-no-expired.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3184-tjc-transfer-completes-no-expired.spec.ts |
| Data | src/data/client-feedback/webpet-3184-tjc-transfer-completes-no-expired.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3184` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3184`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Client Feedback Happy Path tab (see Jira) |
| Manual walk | 2026-10-31 on dev as su: PASS (same transfer as WEBPET-2954, run 600) |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`. CF CREW B, day -8: 2 Time In + 2 Time Out = 4 cards | |
| 1 | `transferCrewDay` (2 job cards); the shared commit asserts the "Transfer complete" toast; wait for the View > Job Cards landing | toast "Transfer complete — 2 job cards written, 4 time cards transferred." |
| 2 | No "Transfer result expired" text on the page | |
| 3 | The grid count reads "Total 2 rows", 2 rows for the crew, Reverse button visible | |

## Expected outcomes

- The transfer completes and lands on the new job cards; the expired-result error never shows.
- The test does not reverse: teardown deletes the job cards by id.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; uses `pageText` (cluster 2 part B) |
| View Job Cards | `View > Job Cards` | `src/pages/processing/ViewJobCardsPage.ts` | exists; adds `gridCount` |

## Data

CF CREW B, CF JOB. The (crew, day) pair is B at -8.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 8 (dev: 21).
- [ ] No other worker is on the Transfer screen (the screen lock serialises them).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards and GET job-cards (own ids, recorded before asserting). The proof is on screen |
| cleanup | before-phase sweep and by-id teardown of the job cards then the time cards |

## Cleanup

Own job cards and time cards by id, then a crew-day sweep.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3184`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3184` | Clicking Transfer to Job Cards completes the transfer without the Transfer result expired error | `regression` | 1 after the first green run |

## Open questions for the tester

None.
