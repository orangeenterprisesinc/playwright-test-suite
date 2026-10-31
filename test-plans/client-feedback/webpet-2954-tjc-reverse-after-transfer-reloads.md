# `WEBPET-2954` · Transfer to Job Cards – after a transfer, Reverse returns to Transfer with the time cards already loaded

| Artifact | Path |
|---|---|
| Ticket | WEBPET-2954 |
| Plan | test-plans/client-feedback/webpet-2954-tjc-reverse-after-transfer-reloads.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-2954-tjc-reverse-after-transfer-reloads.spec.ts |
| Data | src/data/client-feedback/webpet-2954-tjc-reverse-after-transfer-reloads.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-2954` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-2954`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Client Feedback Happy Path tab (see Jira) |
| Manual walk | 2026-10-31 on dev as su: PASS (run 600, reversed, 0 job cards left) |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`. CF CREW B, day -7: 2 Time In + 2 Time Out = 4 cards | |
| 1 | `transferCrewDay` (2 job cards), then wait for the View > Job Cards landing | "Transfer complete" toast asserted by the shared commit |
| 2 | The landing shows the Reverse button and 2 rows for the crew | `view-job-cards-reverse-transfer` |
| 3 | `reverseCrewDay`: Reverse and confirm; toast "Transfer run reversed" | |
| 4 | Without clicking Analyze, the 4 own references are listed on Transfer and each reads Transferred = No | |

## Expected outcomes

- Reverse returns to Transfer to Job Cards with the time cards already loaded and available again.
- The reverse removes the job cards, so nothing is left to delete.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; no new member |
| View Job Cards | `View > Job Cards` | `src/pages/processing/ViewJobCardsPage.ts` | exists; no new member |

## Data

CF CREW B, CF JOB. The (crew, day) pair is B at -7.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 7 (dev: 21).
- [ ] No other worker is on the Transfer screen (the screen lock serialises them).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards and GET job-cards (own ids and the run guard, recorded before asserting). The proof is on screen |
| cleanup | before-phase sweep and by-id teardown |

## Cleanup

Own job cards and time cards by id, then a crew-day sweep.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-2954`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-2954` | After a transfer, the Job Cards view has a Reverse button; clicking it returns to Transfer to Job Cards with the time cards already loaded | `regression` | 1 after the first green run |

## Open questions for the tester

None.
