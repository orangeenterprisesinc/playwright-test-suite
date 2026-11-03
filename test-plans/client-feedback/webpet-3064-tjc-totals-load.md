# `WEBPET-3064` · Transfer to Job Cards – totals line took 3+ minutes, then failed with "Totals couldn't be loaded"

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3064 (Done, Highest; customer Anthony; labels anthony-feedback, beta-core-bugs, qa-discovery); fix web-pet #1048 (merged 2026-09-21) plus the WEBPET-3243 work |
| Plan | test-plans/client-feedback/webpet-3064-tjc-totals-load.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3064-tjc-totals-load.spec.ts |
| Data | src/data/client-feedback/webpet-3064-tjc-totals-load.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3064` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3064`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy Sandoval Gonzalez, 2026-09-24, "PASSED QA - Dev Server - Sycamore1!", after FAILED QA on 09-21, 09-22 and 09-24. Earlier the same day: "PASSED QA - Prod Server". |
| Evidence | image-20260924-195542.png, "Totals line: 55 Time Cards, Gross 8.5, Net 8.0, Meals 0.5, Pieces 50, Employees 1" |
| Fix | web-pet #1048 merged 2026-09-21, plus the WEBPET-3243 work |

## Steps

| # | Step | Confirmed on dev 2026-10-30 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`. CF CREW A, day -2, both employees, CF JOB, Time In 07:00, Time Out 11:00 = 4 cards | fixture rows built on screen when missing; 21-day export window gate read from preferences |
| 1 | Open Transfer to Job Cards from the left menu (`tjc.openFromMenu()`) | link "Transfer to Job Cards" → /transfer-to-job-cards |
| 2 | Scope the date range to the fixture day (`tjc.scopeToDay(run.day)`) | |
| 3 | Scope Time Card Crew to CF CREW A (`tjc.scopeToTimeCardCrew(run.crew.name)`) | |
| 4 | Analyze (`tjc.analyzeCandidates({ expected: 4 })`); the analyze is scoped (`crewIds` not empty) | |
| 5 | The totals line loads within `loadWithinMs`: caption reads "Includes 4 Time Cards of 4 initial selection", no `aria-busy`, no `timecards-totals-unavailable`, no "Totals couldn't be loaded." text | testid `timecards-totals-strip-issues`; loading `aria-busy="true"`; failed `data-degraded="true"` with child testids `timecards-totals-unavailable` and `timecards-totals-retry` |
| 6 | Gross, Net, Meals, Pieces and Employees each show a number; Pieces 0 and Employees 2 exactly; Gross and Net above 0; the strip text is recorded as `totals-evidence` | `<span>label</span><span>value</span>` pairs; Meals shows 4 decimals on dev |

## Expected outcomes

- The totals line loads within `loadWithinMs` and reads "Includes 4 Time Cards of 4 initial selection".
- Gross, Net, Meals, Pieces and Employees each show a number: Employees 2, Pieces 0, Gross and Net above 0.
- No "Totals couldn't be loaded." and the line does not disappear.
- Not asserted (each recorded as a `not-asserted` annotation from the JSON or the evidence annotation):
  - Exact Gross/Net/Meals values: deferred, meal rules are environment data; the strip text is recorded as `totals-evidence`.
  - The 3+ minute load at production scale: deferred, it needs thousands of cards; dev holds 4.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `totalsStrip`, `totalsCaption`, `totalsUnavailable`, `totalsValue`, `totalsNumber`, `ensureColumnShown` |
| Crew Time In / Crew Time Out | Input ▸ Batch | `CrewTimeInPage`, `CrewTimeOutPage` | exist; driven by `seedCrewDay` |

## Data

CF CREW A (9011) with CF A ONE (9021) and CF A TWO (9022), CF JOB (9003, hourlyRate 1), CF RANCH (9001), CF FIELD (9002), all from `src/data/client-feedback/fixture.json`. The (crew, day) pair is A at -2; the loader rejects a second scenario file on it. First run creates the fixture rows on screen and is slow; they are never deleted.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 2 (dev: 21); a smaller window fails by name.

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences (21-day gate) and GET time-cards (own-id capture, before asserting). The proof is on screen: step 5 |
| cleanup | before-phase sweep (export residue, job cards, time cards of the crew's day) and by-id teardown of time cards. Nothing is committed |

## Cleanup

Registered with the cleanup scope before any write: own job cards and time cards by id, then a crew-day sweep. Nothing is transferred, so no job cards are expected.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3064`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3064` | Transfer to Job Cards totals line loads for an analyzed crew day | `regression` | 0 until the first green run |

```ts
test.describe('WEBPET-3064 · Transfer to Job Cards: totals line loads', { tag: ['@ClientFeedback', '@WEBPET-3064'] }, () => {
    test('the totals line loads Gross, Net, Meals, Pieces and Employees for an analyzed crew day', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3064' }],
    }, async ({ pages, sessionApi }, testInfo) => { … });
});
```

## Open questions for the tester

None.
