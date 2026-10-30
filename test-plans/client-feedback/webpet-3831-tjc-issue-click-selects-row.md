# `WEBPET-3831` · Transfer to Job Cards – clicking an exception in the Issues panel selects the affected time card

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3831 (Done); fix web-pet #1494 |
| Plan | test-plans/client-feedback/webpet-3831-tjc-issue-click-selects-row.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3831-tjc-issue-click-selects-row.spec.ts |
| Data | src/data/client-feedback/webpet-3831-tjc-issue-click-selects-row.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3831` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3831`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy Sandoval Gonzalez, 2026-10-22, PASSED QA |
| Evidence | image-20261022-223823.png (row underlined) |
| Fix | web-pet #1494 |

## Steps

| # | Step | Confirmed on dev 2026-10-30 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay` with two steps. CF CREW A, day -6: CF A ONE Time In + Time Out, CF A TWO Time In 07:00 with no Time Out = 3 cards. The affected card is CF A TWO's Time In (`ownCard`) | three rows, not the single Time In first planned, so "only the affected row" means something |
| 1 | Open, scope the day and the crew, analyze (3) | |
| 2 | "Time-In has no closing punch" lists 1 affected | |
| 3 | Click the exception group (`clickIssue`) | `v2-issue-group-warn.incomplete_time_in`; detail opens |
| 4 | The affected row's `text-decoration-line` is underline and in view, and it is the only underlined row | underline is the only cue; there is no aria-selected or data-state |
| 5 | The issue detail row names the same reference (read only, never clicked) | `v2-issue-detail-row-<id>`; a click is intercepted by the panel header, a keyboard press opens the Fix sheet |

## Expected outcomes

- Clicking the exception highlights exactly the affected time card, and the detail lists the same reference.
- Not asserted: scrolling to the row (three rows never scroll), recorded as a `not-asserted` annotation.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `issueGroup`, `issueDetail`, `issueDetailRow`, `clickIssue`, `gridRow`, `highlightedReferences` |

## Data

CF CREW A (CF A ONE, CF A TWO), CF JOB. The (crew, day) pair is A at -6.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 6 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences and GET time-cards (own-id capture, also the affected card's id and reference, recorded before asserting). The proof is on screen |
| cleanup | before-phase sweep and by-id teardown. Nothing is committed |

## Cleanup

Own job cards and time cards by id, then a crew-day sweep. Nothing is transferred.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3831`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3831` | Clicking an exception in the Issues panel selects and scrolls to the affected time card in the grid | `regression` | 1 after the first green run |

## Open questions for the tester

None.
