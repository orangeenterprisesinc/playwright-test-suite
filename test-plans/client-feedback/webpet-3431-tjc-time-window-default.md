# `WEBPET-3431` · Transfer to Job Cards – the time window opens 12:00 AM–11:59 PM

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3431 (Done; customer Anthony; label anthony-feedback); fix web-pet #1232 |
| Plan | test-plans/client-feedback/webpet-3431-tjc-time-window-default.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3431-tjc-time-window-default.spec.ts |
| Data | src/data/client-feedback/webpet-3431-tjc-time-window-default.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3431` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3431`) |
| Journey | none |
| Surface | ui |
| Bucket | A: no data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Rahul Jha, 2026-10-10, QA PASS |
| Evidence | none |
| Fix | web-pet #1232 |

## Steps

| # | Step | Confirmed on dev 2026-10-30 |
|---|---|---|
| 1 | Open Transfer to Job Cards from the left menu | |
| 2 | Begin reads 00:00 and End 23:59 (`beginTimeInput`, `endTimeInput`) | `<input type=time>`, testids `transfer-begin-time-input` / `transfer-end-time-input` |
| 3 | Set End 17:00, reload (F5): End is still 17:00, Begin still 00:00 (`withEndTime`, `reload`) | writes localStorage `pet-tiger.transfer.timeWindow.v2.endTime`, sends no request |
| 4 | End is back to 23:59 once the test restores it | |

## Expected outcomes

- The window opens 12:00 AM to 11:59 PM.
- A picked End survives a reload.
- Not asserted: reset of a pre-fix stored 11:59 AM (old key `pet-tiger.transfer.endTime`) needs hand-seeded browser storage; recorded as a `not-asserted` annotation.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `beginTimeInput`, `endTimeInput`, `reload`, `setEndTime`, `withEndTime` |

## Data

None. The window is browser state in a throwaway context.

## Preconditions

- [ ] su login from storageState.

## API allowances

None. No data is created and no request is made.

## Cleanup

The spec puts End back to 23:59 in a `finally`; the value dies with the test's context anyway.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3431`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3431` | Transfer to Job Cards opens with the full-day time window, Begin 12:00 AM and End 11:59 PM | `regression` | 1 after the first green run |

## Open questions for the tester

None.
