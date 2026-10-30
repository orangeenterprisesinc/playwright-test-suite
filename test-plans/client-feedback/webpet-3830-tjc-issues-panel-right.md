# `WEBPET-3830` · Transfer to Job Cards – the Issues panel sits on the right, not under the grid

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3830 (Done); fix web-pet #1450 |
| Plan | test-plans/client-feedback/webpet-3830-tjc-issues-panel-right.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3830-tjc-issues-panel-right.spec.ts |
| Data | src/data/client-feedback/webpet-3830-tjc-issues-panel-right.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3830` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3830`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Cesar, 2026-10-16 |
| Evidence | none |
| Fix | web-pet #1450 |

## Steps

| # | Step | Confirmed on dev 2026-10-30 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`. CF CREW A, day -8, CF A ONE, Time In 07:00, no Time Out = 1 card | |
| 1 | Open Transfer to Job Cards from the left menu | |
| 2 | Scope the day and the crew, analyze (1 card) | |
| 3 | "Time-In has no closing punch" lists 1 affected; Group by is visible | `v2-issues-group-by`; 1 Warning |
| 4 | The panel is right of the grid, overlapping it vertically; the totals line is under the grid and stays in the grid column (`layoutBoxes`) | panel x887–1498, grid x274–886, totals y617–680 |

## Expected outcomes

- The Issues panel is to the right of the grid, with the issue listed.
- The totals line sits directly under the grid.
- Not asserted: other window sizes (checked by hand at 1522 and 1907 px); recorded as a `not-asserted` annotation.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `issuesPanel`, `issuesGroupBy`, `layoutBoxes` |

## Data

CF CREW A (CF A ONE), CF JOB. The (crew, day) pair is A at -8.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 8 (dev: 21).
- [ ] The run's viewport is wide enough for the side-by-side layout (it is at 1522 and 1907 px); check this first on a red run.

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences and GET time-cards (own-id capture). The proof is on screen |
| cleanup | before-phase sweep and by-id teardown. Nothing is committed |

## Cleanup

Own job cards and time cards by id, then a crew-day sweep. Nothing is transferred.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3830`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3830` | The Issues (exceptions) panel is on the right side of Transfer to Job Cards, not under the grid | `regression` | 1 after the first green run |

## Open questions for the tester

None.
