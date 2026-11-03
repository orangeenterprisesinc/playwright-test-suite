# `WEBPET-3834` · Transfer to Job Cards – clicking the Ready count filters the grid to Ready records

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3834 (Done); fix web-pet #1450 |
| Plan | test-plans/client-feedback/webpet-3834-tjc-status-pill-filter.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3834-tjc-status-pill-filter.spec.ts |
| Data | src/data/client-feedback/webpet-3834-tjc-status-pill-filter.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3834` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3834`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Cesar, 2026-10-16, PASSED QA |
| Evidence | image-20261014-235550.png |
| Fix | web-pet #1450 |

## Steps

| # | Step | Confirmed on dev 2026-10-30 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay` with two steps. CF CREW A, day -4: CF A ONE Time In 07:00 + Time Out 11:00 (2 Ready), CF A TWO Time In 07:00 with no Time Out (1 Warning) = 3 cards | |
| 1 | Open, scope the day and the crew, analyze (3); the Ready count reads 2 | counts in `v2-progress-pill-*` |
| 2 | Click the Ready pill: `aria-pressed` true, caption "Includes 2 Time Cards of 2 initial selection", every visible row badged Ready | 2 rows, both Ready, caption "2 of 2" |
| 3 | Click it again: `aria-pressed` false, caption back to 3 of 3, 3 rows with the Warning row | 3 rows including the Warning row |

## Expected outcomes

- Clicking the Ready count shows only Ready rows; clicking again restores every row.
- The grid's own name keeps the analyzed count; the totals-strip caption follows the pill.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `statusPill`, `clickStatusPill`, `visibleStatuses` (`readyCount` reused) |

## Data

CF CREW A with CF A ONE and CF A TWO, CF JOB. The (crew, day) pair is A at -4.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 4 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences and GET time-cards (own-id capture). The proof is on screen |
| cleanup | before-phase sweep and by-id teardown. Nothing is committed |

## Cleanup

Own job cards and time cards by id, then a crew-day sweep. Nothing is transferred.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3834`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3834` | Clicking the Ready status count filters the Transfer to Job Cards grid to ready records | `regression` | 1 after the first green run |

## Open questions for the tester

None.
