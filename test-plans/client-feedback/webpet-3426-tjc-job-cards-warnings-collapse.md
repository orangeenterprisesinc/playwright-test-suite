# `WEBPET-3426` · Transfer to Job Cards – Job Cards warnings banner is collapsed and the grid keeps about 10 rows

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3426 |
| Plan | test-plans/client-feedback/webpet-3426-tjc-job-cards-warnings-collapse.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3426-tjc-job-cards-warnings-collapse.spec.ts |
| Data | src/data/client-feedback/webpet-3426-tjc-job-cards-warnings-collapse.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3426` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3426`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Client Feedback Happy Path tab (see Jira) |
| Manual walk | 2026-10-31 on dev as su: PASS (viewport held at 674 px tall) |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`. CF CREW B, day -2, piece job: 2 Time In, crew piece-out x5, 2 Time Out = 5 cards | |
| 1 | Set the viewport 1366 x 674 and assert `innerHeight` is 674 | a literal 1366 x 674 was not possible in the MCP walk |
| 2 | Open, scope the day and the crew, analyze (5), open the Job Cards tab | |
| 3 | The banner reads "4 warnings in this Job Cards preview", the toggle says Show details (aria-expanded false), no list | `jobcards-grid-warning` / `-toggle` |
| 4 | The table min-height is 376px; table and scroll body are at least 10 x 33 px | body 330 px |
| 5 | Show details: list open, overflow-y auto, max-height 192px, 2 items, toggle reads Hide details | |
| 6 | Hide details: list collapses | |

## Expected outcomes

- The warnings are a collapsed count line, and the Job Cards grid still shows ten rows.
- Nothing is committed.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `jobCardsWarning`, `jobCardsWarningToggle`, `jobCardsWarningList`, `jobCardsTable`, `jobCardsTableMetrics`, `warningListStyle` |

## Data

CF CREW B, CF PIECE JOB (no hourly rate: that is what raises the warnings). The (crew, day) pair is B at -2.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 2 (dev: 21).
- [ ] The run's window is maximized with viewport:null; the spec sets the viewport itself and checks `innerHeight`.

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences and GET time-cards (own-id capture). The proof is on screen |
| cleanup | before-phase sweep and by-id teardown. Nothing is committed |

## Cleanup

Own time cards by id, then a crew-day sweep.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3426`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3426` | On Transfer to Job Cards > Job Cards, the warnings banner is collapsed to a count line and the grid still shows about 10 rows | `regression` | 1 after the first green run |

## Open questions for the tester

None. If the `innerHeight` precondition fails on the first run, report it rather than switching to a literal `test.use` viewport.
