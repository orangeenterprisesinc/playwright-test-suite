# `E6` · Decimal-rounding reconciliation

## Application Overview

**Revision 1, 2026-10-26. Planned at code level** (no browser this pass) from the orchestrator's read-only dev probe of File ▸ Administration ▸ **Job Card Preferences** (`/settings/job-card-preferences`) and the E2/E8/D5/D10 flows. Sibling plans: `e02-california-daily-overtime.md`, `e08-finalize-gross-pay.md`; reverse pattern from `test-plans/journey-d/d05-reverse-and-redo.md`.

> **One 8-hour crew day split into three 160-minute jobs, transferred at three decimal precisions.** 160 min = 2.6666… h, so no precision can represent the three segments exactly. The app must round the first two segments to the precision and put the **difference on the day's last job card**, so the day still reads **8** exactly. E6 seeds the day on screen and transfers it at the tenant's precision (4). It reads the three cards and the Totals bar on the transfer landing, then reverses the transfer on screen. It then sets **Time Decimal Accuracy** to 2 on the Job Card Preferences screen, re-transfers, reads, reverses, and does the same at 3. Finally it sets the preference back to 4 on screen.
>
> **Binding safety constraints**
> * Transfer: rows are ticked **by Reference** after the Work Crew filter. `selectAllRowsCheckbox` is never touched (WEBPET-3397).
> * Reverse: only through `guardReversibleRun` (own run id, author = session user, started after the test, 3 job cards / 4 time cards / 0 modified). Never on a foreign run.
> * The preference is changed only inside `withPreferencesLock` (load → set → Save → read back). The tenant leaves 4 only between pass 2's save and the final restore. The `timeDecimalRounding` restorer puts it back by API even after a timeout.
> * E2 JOB is never touched (E2/E8 own it). E6 uses its own three jobs.
> * The P=4 pass runs **before** any preference is written. If the correction is missing (WEBPET-2987/2988 open), the test fails by name having changed nothing.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `E6` (line 1419) |
| Jira | `WEBPET-2062` (feature) · automation ticket `PET-12671` |
| Recording | — none |
| This plan | `test-plans/journey-e/e06-decimal-rounding-reconciliation.md` |
| Spec | `tests/web/journey-e-payroll/e06-decimal-rounding-reconciliation.spec.ts` |
| Scenario | `src/data/journey-e/e06-decimal-rounding-reconciliation.json` |
| Schema | `src/data/schemas/journeyEScenario.ts` → new `JourneyE6RoundingCaseSchema` |
| Runner row | `src/data/runner/journey-e.csv` → `E6` (existing reservation, line 7; demo=1) |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `E6` |
| Journey | `E` — Weekly payroll close and export |
| Segments | `all` |
| Modules | `Windows` |
| Surface | `calc` — spec in `tests/web/journey-e-payroll/`; runner category `workflow` (as E2) |
| Demo candidate | **yes** → the test carries `@Demo` (runner:check enforces it for demo=1) |
| Catalog status | draft |

**Summary** (from the catalog)
> Reconcile the day's minute total to decimal hours so a full 8-hour day reads 8.00, not 7.99, since minutes convert to repeating decimals. The fix adjusts the day's last job card.

## Catalog steps

| # | Catalog step | Office surface | Automatable? |
|---|---|---|---|
| 1 | Sum the day's worked minutes and, separately, the decimal hours across that day's job cards. | Worked minutes = the seeded punches (06:00 → 14:00 = 480 min, three 160-min segments). The decimal hours are on **View ▸ Job Cards** (the transfer landing, `?transferRun=N`): the crew's three rows (Gross Time / Net Time / Regular Hours) and the **Totals** bar (`Gross`, 4 dp). | **yes, on screen** |
| 2 | Where the two differ, apply the small correction to the last job card. | The engine applies it during **Transfer to Job Cards**. E6 reads where it landed: rows sorted by Time In; cards 1–2 = segment rounded to P, card 3 = 8 − (card 1 + card 2). | **yes, on screen.** The "variation" (multiple jobs in a day) *is* the scenario: three jobs |
| 3 | Set decimal precision (2, 3 or 4 places) in preferences to reduce visible drift. | File ▸ Administration ▸ **Job Card Preferences** → section **Accuracy** → spinbutton **Time Decimal Accuracy** (dev 4) → **Save** (disabled until dirty). | **yes, on screen**, all three values, each proven by a re-transfer |

## Expected outcomes

- With E2 CREW / E2 PICKER ONE punched on screen on day −19 (crew time-in 06:00 on `E6 JOB A`, crew time-in 08:40 on `E6 JOB B`, crew time-in 11:20 on `E6 JOB C`, crew time-out 14:00), the Transfer screen scoped to the day and crew shall offer exactly this run's **4** References, every status badge **Ready**.
- The Job Card Preferences screen shall show **Round Job Change OFF** (so 08:40 and 11:20 are not moved to the 15-minute grid) and **Time Decimal Accuracy = 4** before anything changes. Both are gates read on screen: if either differs the test fails by name, and E6 never writes Round Job Change.
- **Pass P=4** (tenant baseline, nothing written): transferring shall show "Transfer complete — 3 job cards written, 4 time cards transferred." and land on `/view/job-cards?transferRun=N` (N = the execute job's run id). The crew's rows, ordered by Time In, shall read Gross Time = Net Time = Regular Hours = **2.6667, 2.6667, 2.6666** (Jobs A, B, C), Overtime 0 and Double Time 0 on each. The Totals bar shall read **Gross 8.0000 · Net 8.0000 · Regular 8.0000 · Overtime 0.0000 · Double 0.0000**.
- **Pass P=2:** after Time Decimal Accuracy = 2 is saved and reads 2 after a fresh load of the screen, the re-transfer shall give **2.67, 2.67, 2.66**, with Totals Gross/Net/Regular **8.0000** and Overtime/Double 0.
- **Pass P=3:** **2.667, 2.667, 2.666**, with Totals **8.0000** and Overtime/Double 0.
- On every pass, the last card shall equal 8 − (card 1 + card 2) **exactly at P decimals**, and cards 1–2 shall equal round-half-up(160/60, P). A missing or misplaced correction fails by name, naming WEBPET-2987/2988. Examples: Totals 8.0001 (P=4) or 8.01 (P=2), the correction on card 1, or any Overtime > 0 (8.01 h crosses the 8-hour rule).
- Each reverse (after P=4 and after P=2) shall show the dialog "Reverse this transfer?" / "…returns the source time cards to their un-transferred state", post `…/runs/{N}/reverse` for this pass's own run, return to Transfer with "Transfer run reversed", and leave no row for the crew on View ▸ Job Cards for the day.
- After the last pass, Time Decimal Accuracy shall be set back to **4** on screen and read 4 after a fresh load.
- **Amounts** (Amount / Time Amount per row, Totals Amount): recorded as `amount-evidence`, not asserted. *— deferred: money rounding is governed by "Hourly Rate Decimal Accuracy" (dev 3) and 2-dp currency, a separate reconciliation the catalog does not name. At rate 20, P=4 gives 3 × 53.33 = 159.99 or 160.00 depending on where money is rounded, which is not E6's question.*
- **The pre-commit Job Cards preview** (Transfer ▸ Job Cards tab): row count 3 is asserted; values are recorded as `preview-evidence`. *— not asserted: WEBPET-3823 (stale preview) makes preview values unreliable across a precision change.*
- **"Sum the day's worked minutes"** as an on-screen total. *— not automatable as a separate read: no screen shows a minute total. The seeded punch times are the minute source, and the scenario schema proves 480 = 3 × 160.*
- On-blur validation and Save-stays-disabled on Job Card Preferences. *`(POM)` — `setNumber` blurs and waits for Save to enable.*

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Setup ▸ Ranch / Field / Crew / Employee | via `ensureOnScreen` | existing | unchanged (E2's rows) |
| Setup ▸ Job (three own jobs) | `Setup ▸ Job` | `src/pages/setup/JobPage.ts` | unchanged — `ensureJobOnScreen`, `setOvertimeRule`, `setHourlyRate` |
| Input ▸ Crew Time In / Out | menu | `CrewTimeInPage`, `CrewTimeOutPage` | unchanged; job changes = repeated `punchIn` with another job (D10 precedent, `seedExerciseAndBreakDay`) |
| **Job Card Preferences** | `File ▸ Administration ▸ Job Card Preferences` (`/settings/job-card-preferences`) | **new** `src/pages/admin/JobCardPreferencesPage.ts` | to write (below). Not added to `PreferencesPage`, which is bound to `/settings/preferences` and to `#fieldId` locators; this screen is measured by role/label |
| Transfer to Job Cards | left menu | `TransferToJobCardsPage.ts` | unchanged (`openScopedCandidates`, `commitTransfer`, `reversedToast`) |
| View ▸ Job Cards (landing) | transfer landing | `ViewJobCardsPage.ts` | unchanged — `waitForTransferLanding`, `transferRunParam`, `rowsForCrew`, `rowsForCrewAndJob`, `readClock`, `readNumber`, `readTotals`, `openReverse`, `confirmReverse` |

**`JobCardPreferencesPage` (extends `BasePage`), measured facts:** a "Search settings..." searchbox, left-nav section buttons (`Accuracy`, `Time Rounding`, `Overtime`), and a single Cancel / Save with Save disabled until dirty.
- `openFromMenu()`: `leftNav.openScreen(['File','Administration','Job Card Preferences'], '/settings/job-card-preferences')`, then Save button visible. `openScreen` reloads when already on the route, which is the fresh load used for read-backs.
- `gotoSection(name)`: `getByRole('button', { name, exact: true })` → its heading scrolled into view.
- `spinbutton(label)` (`getByRole('spinbutton', { name: label, exact: true })`) · `switchControl(label)` · `combobox(label)`.
- `readNumber(label)` (polls non-empty, then `Number(inputValue)`) · `readSwitch(label)` (`aria-checked === 'true'`) · `readCombobox(label)` (input value or inner text by tag, polled non-empty).
- `setNumber(label, value)`: no-op if equal; otherwise fill + blur, and Save must enable.
- `save()`: arm `waitForResponse` on a PUT|PATCH whose path matches `/preferences/i` (exact endpoint unmeasured), click, expect 2xx, then expect Save disabled.
- `saveIfDirty()`.
- No combobox/switch **setter** and no Cancel member: E6 writes only Time Decimal Accuracy; E13 only reads.

## Data

- **Fixture:** E2 CREW (8016) and E2 PICKER ONE (8017), B1 RANCH / B1 FIELD, through the new `prepareJourneyEOwnJobs` (E2's ensure + gates, no E2 JOB). **Three own jobs** in a new `fixture.json` block `"e6"`: `E6 JOB A` / `E6 JOB B` / `E6 JOB C`, codes **4611 / 4612 / 4613** (**must be probed free, live and recycle bin, before commit**, as 4602 is burnt per WEBPET-2368), Time, Hourly Rate 20. Each run sets each job's overtime rule to `AG CA 2022` and rate 20 on the Job form (read-first no-ops when warm). The jobs are E6-owned, so there is no restore. Names match `/^E\d{1,2} /` (protected from sweeps).
- **Day −19** (B 0…−9, C −10, D6 −11, D9 −12, D10 −13, E2 −14, D5 −16, E8 −18). Inside `maximumDaysForTransferExport = 21` (gated).
- **Scenario JSON** (`JourneyE6RoundingCaseSchema`, `.strict()`):

```jsonc
{
  "workflow": "E6", "label": "e06-decimal-rounding-reconciliation", "dayOffset": -19,
  "rule": { "name": "AG CA 2022", "dailyOvertimeAfterHours": 8, "doubleTimeAfterHours": 12 },
  "hourlyRate": 20,
  "segments": [
    { "job": "jobA", "start": { "hour": 6, "minute": 0 } },
    { "job": "jobB", "start": { "hour": 8, "minute": 40 } },
    { "job": "jobC", "start": { "hour": 11, "minute": 20 } }
  ],
  "timeOut": { "hour": 14, "minute": 0 },
  "baselinePrecision": 4,
  "passes": [
    { "precision": 4, "cardHours": [2.6667, 2.6667, 2.6666] },
    { "precision": 2, "cardHours": [2.67, 2.67, 2.66] },
    { "precision": 3, "cardHours": [2.667, 2.667, 2.666] }
  ],
  "expected": {
    "timeCards": 4, "jobCards": 3, "dayHours": 8, "overtimeHours": 0, "doubleTimeHours": 0,
    "transferToast": { "jobCards": 3, "timeCards": 4 }, "status": "Ready", "roundJobChange": false,
    "reverseDialog": { "title": "Reverse this transfer?", "text": "returns the source time cards to their un-transferred state" }
  },
  "preferenceLabels": { "section": "Accuracy", "timeDecimalAccuracy": "Time Decimal Accuracy", "roundingSection": "Time Rounding", "roundJobChange": "Round Job Change" },
  "cleanup": [
    { "kind": "timeCards", "employeeCodes": ["8017"], "dayOffset": -19, "cardTypes": [0, 1] },
    { "kind": "restore", "target": "timeDecimalRounding" }
  ]
}
```

  `superRefine` rules:
  - `dayOffset === -19`, not −14/−18; segment starts strictly increasing and before `timeOut`; `timeCards === segments.length + 1`; `jobCards === segments.length`.
  - Σ segment minutes / 60 === `dayHours`, and `dayHours <= rule.dailyOvertimeAfterHours` (so overtime 0 is the honest expectation).
  - `passes[0].precision === baselinePrecision`; the precisions are exactly {2,3,4}.
  - For each pass, `cardHours.length === jobCards`; `cardHours[i] === roundHalfUp(minutes_i/60, P)` for i < last; last `=== round(dayHours − Σothers, P)`; `round(Σ cardHours, P) === dayHours`.
  - Non-vacuity: at least one segment with `roundHalfUp(m/60, P) !== m/60` at every P.
  - A `timeCards` step with dayOffset −19 and a `restore: timeDecimalRounding` step are both present.

## Preconditions

- [ ] Everything E2 enforces for the crew/picker/field (crew has no lunch/exercise/break automation, picker has no displacing rate, B1 FIELD's `overTimeRulesCounter` is null or equal to the jobs' rule), `maximumDaysForTransferExport >= 19`, `viewJobCardsAfterTransfer === true` (all reads, fail by name).
- [ ] `GET session/me` user id and `startedAt` recorded (for `guardReversibleRun`).
- [ ] Before-phase: crew job cards on −19 deleted, then crew time cards (E2's order). The `timeDecimalRounding` snapshot is taken. **If it reads 2 or 3** (residue of a killed E6), it is set back to `baselinePrecision` under `cleanup`, annotated `residue-healed`, and the snapshot is rewritten to the baseline. Any other non-baseline value fails by name: someone else changed the tenant.
- [ ] On screen, before pass 1: Job Card Preferences ▸ Time Rounding ▸ **Round Job Change** reads OFF, and Accuracy ▸ **Time Decimal Accuracy** reads `baselinePrecision`. `Time Rounding at Transfer to Job Cards [Minutes]` and `Rounding Type` are recorded as `preference-evidence`.

## API allowances

Browser-issued requests (Analyze, Transfer execute, Apply/Refresh, Reverse POST, the preferences Save) are user actions observed with `waitForResponse`/`waitForRequest` and have **no row**.

| Step / call | Endpoint | Allowance | Why | Proof on screen |
|---|---|---|---|---|
| fixture rows missing | `POST <entity>/{id}/restore` | arrange | inside `ensureOnScreen` only (rows are otherwise created on screen) | — |
| rule id, crew/employee/field/job gates | `GET overtime-rules`, `GET crews/{id}`, `GET employees/{id}`, `GET fields/{id}` | plumbing read | fixture gates that fail by name | Job form read-back of rule + rate (step 1) |
| preference gates | `GET preferences` (`maximumDaysForTransferExport`, `viewJobCardsAfterTransfer`) | plumbing read | gate | — |
| session user | `GET session/me` | plumbing read | `guardReversibleRun` author check | — |
| preference snapshot / residue heal / restore | `GET` / `PUT preferences` (`timeDecimalRounding` only) | cleanup | puts back what the test changed on screen; survives a timeout | step 9 (on-screen restore + read-back) |
| save-landed poll | `GET preferences` → `timeDecimalRounding === P` | plumbing read | the screen's Save may land after the toast; the transfer must not race it | screen read-back after a fresh load (steps 6, 8) |
| punch readable + time-card ids | `GET time-cards?from&to` | plumbing read | ids for cleanup; the next punch form only offers clocked-in employees | Transfer roster (step 3) |
| written job-card ids + run id | `GET job-cards?from&to`, execute job GET (in `commitTransfer`) | plumbing read | cleanup ids, recorded before assertions | toast + landing rows (step 4) |
| reverse guard | `GET transfer-to-job-cards/runs`, `GET job-cards?from&to` | plumbing read | refuses a foreign run before the on-screen Reverse | reverse dialog + toast + empty grid (step 5) |
| before-phase / teardown | `DELETE job-cards/{id}`, `DELETE time-cards/{id}`, crew-day sweep | cleanup | by id / crew+day | — |

No configuration write: Time Decimal Accuracy is set **on its screen**. The API PUT exists only as teardown restore and residue heal (cleanup), never as setup.

## Cleanup

| Phase | Step | How |
|---|---|---|
| after, 0 | `timeDecimalRounding` back to the snapshot (= baseline) | restorer `timeDecimalRounding` (`snapshotPreferences(api, ['timeDecimalRounding'])` / `restorePreferences`). **Run first** in `finishCleanup` (tenant-wide state, D10's `paidBreakJob` precedent) |
| after, 1 | own job cards by id | `run.jobCardIds` (ids of reversed passes are spliced out only after the absence assertion) |
| after, 2 | own time cards by id + crew-day sweep | as E2 |
| — | fixture jobs | E6-owned, never deleted (protected prefix) |

Registered with `currentScope(testInfo)` so it survives a timeout. Budget: the scope's 60 s drain is enough (1 PUT + ≤3 card DELETEs + 4 time-card DELETEs).

## Test case

**One workflow, one happy-path test, one runner row, and the id is the workflow id** (the JOURNEY profile overrides the planner agent's generic edge/negative guidance).

Runner row `journey-e.csv:7` is a reservation. Change exactly `jira` → `PET-12671`, `status` → `automated`, `enabled` → `1` (**flip last**). demo stays 1, so the test carries `@Demo`.

```ts
test.describe('E6 · Decimal-rounding reconciliation', { tag: ['@JourneyE', '@E6'] }, () => {
    test('[Payroll] An eight-hour day in three 160-minute jobs reads exactly 8 at 4, 2 and 3 decimals, the correction on the last card.', {
        tag: ['@Regression', '@Demo'],
        annotation: [{ type: 'testCaseId', description: 'E6' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

`test.setTimeout(900_000)` (three transfers, two reverses, three preference saves, cold job creates). No `test.slow()`.

## Open questions for the tester

- [ ] **1. Rounding mode for cards 1–2: half-up (2.67) or truncation (2.66, which puts 2.68 on the last card)?** The plan asserts half-up, the legacy RoundTo behaviour. If the app truncates, the test fails by name "rounding mode". Only the tester decides whether that is a product bug or a plan correction; the invariant "last = 8 − Σothers, Totals = 8" holds either way.
- [ ] **2. Is `timeDecimalRounding` read at execute time, or cached server-side?** If cached, pass P=2 yields 4-dp cards and fails by name ("precision change not applied at transfer"). Never healed with a wait longer than the save-landed poll.
- [ ] **3. Does the Job Card Preferences Save PUT the whole `/preferences` record?** If yes, it can revert keys another worker wrote by API. `withPreferencesLock` covers only on-screen saves. Record the request body on the first run (`preferences-save-evidence`).
- [ ] **4. Does a non-default precision held for about 5 minutes disturb parallel specs?** Today's journey assertions are integer hours or minute-rounded (D10's 10 min reads 10 either way), so the risk is judged low. A red elsewhere that coincides with E6 should name E6 first.
- [ ] **5. Does a meal-penalty card appear for the E6 jobs on an 8-hour day with no meal** (D5 tolerated one for its picker)? E2 CREW showed none on a 13-hour day (E8). If one appears, the toast count breaks, and that is a finding to report, not something to tolerate silently.

## Test Scenarios

### 1. E6 · Decimal-rounding reconciliation (one happy-path test, testCaseId E6, @JourneyE @E6 @Regression @Demo)

**Seed:** `tests/seed.spec.ts`

#### 1.1. [Payroll] An eight-hour day in three 160-minute jobs reads exactly 8 at 4, 2 and 3 decimals, the correction on the last card.

**File:** `tests/web/journey-e-payroll/e06-decimal-rounding-reconciliation.spec.ts`

**Steps:**
  1. **Arrange.** `loadScenario(JourneyE6RoundingCaseSchema)`. Then `prepareJourneyEOwnJobs(scenario, deps, journeyE6Fixture().jobs)`: ranch/field/crew/picker on screen; `E6 JOB A/B/C` ensured; on each Job form `setOvertimeRule('AG CA 2022')` + `setHourlyRate(20)`, read back. Gates, session user, before-phase sweep, `timeDecimalRounding` snapshot (+ residue heal).
    - expect: each Job form shows `AG CA 2022` and 20 after a fresh load
    - expect: gates pass, or the test fails by name
  2. **Gate on screen.** `assertRoundingGates`: `jobCardPreferences.openFromMenu()` → `gotoSection('Time Rounding')` → `readSwitch('Round Job Change')` → `gotoSection('Accuracy')` → `readNumber('Time Decimal Accuracy')`.
    - expect: Round Job Change is OFF
    - expect: Time Decimal Accuracy === 4
  3. **Seed on screen.** `seedJobChangeDay`: `crewTimeIn.punchIn` 06:00 Job A → wait for 1 readable time-in → 08:40 Job B → wait for 2 → 11:20 Job C → wait for 3 → `crewTimeOut.punchOut` 14:00. Ids recorded before any assertion.
    - expect: exactly 4 own time cards on day −19
  4. **Pass P=4 (catalog steps 1+2).** `transferAndReadPass(run, deps, pass)`: `openScopedCandidates(run, {crew})`, own badges **Ready**, `openJobCardsTab` → 3 preview rows (evidence) → `openTimeCardsTab`. Then `commitTransfer(…, toast {3,4})` → `waitForTransferLanding` → `transferRunParam() === transferRunCounter`. Then `rowsForCrew` sorted by `readClock('Time In')`.
    - expect: 3 rows, Jobs A, B, C in time order (Time In 06:00 / 08:40 / 11:20)
    - expect: per row, Gross Time = Net Time = Regular Hours = `pass.cardHours[i]`; Overtime 0, Double Time 0
    - expect: last row === round(8 − (row1 + row2), P); Totals Gross/Net/Regular === 8, Overtime/Double === 0 (else fail by name, citing WEBPET-2987/2988)
    - expect: amounts recorded as `amount-evidence`
  5. **Reverse.** `reverseOwnPass`: `guardReversibleRun(run, deps, outcome, { jobCards: 3, timeCards: 4 })` → `openReverse()` → dialog title/text → `confirmReverse()` === own run id → Transfer page + `reversedToast` → `openViewJobCardsForDay` → `rowsForCrew` count 0 → splice the pass's ids out of `run.jobCardIds`.
    - expect: the reverse posted this pass's own run; the crew has no job cards on the day
  6. **Catalog step 3, P=2.** `setTimeDecimalAccuracy(run, deps, 2)` under `withPreferencesLock`: `openFromMenu` → `gotoSection('Accuracy')` → `setNumber` → `save()` → poll `GET preferences.timeDecimalRounding === 2` → `openFromMenu()` (fresh load) → `readNumber`.
    - expect: Save returns 2xx; the screen reads 2 after a fresh load
  7. **Pass P=2**, as step 4 with `[2.67, 2.67, 2.66]`, then the reverse as step 5.
  8. **P=3**, as step 6, then the pass as step 4 with `[2.667, 2.667, 2.666]` (no reverse; teardown deletes).
  9. **Restore on screen:** `setTimeDecimalAccuracy(run, deps, baselinePrecision)`.
    - expect: the screen reads 4 after a fresh load
  10. **Teardown:** `run.cleanup()` in `finally` (restorer first, then cards).
    - expect: no own job/time cards on day −19; `timeDecimalRounding === 4`

## Dev results (2026-10-26, su, `UI_FIRST_GUARD=enforce`)

- **Red by product, as designed:** the P=4 pass (no preference written yet) reads Gross/Net/Regular **2.6667 · 2.6667 · 2.6667** for the three 160-minute cards while the crew-scoped Totals bar reads **8.0000**. The cards sum to 8.0001: no correction is placed on the day's last card. This is the catalog's E6 check failing (WEBPET-2987 / WEBPET-2988, both Ready for Dev). The spec stops there by name; the 2- and 3-decimal passes never run and the preference is never changed.
- Measured: Time Decimal Accuracy lives on File ▸ Administration ▸ Job Card Preferences ▸ Accuracy (dev 4); Time Rounding at Transfer 15 min, Round Job Change off, so the 08:40 / 11:20 job switches are kept.
- The landing's Totals bar covers the whole day (another crew's 8 h read as 16); the crew chip is applied before reading it.
- Runner row parked `automated, enabled 0` until the product fix (D8 precedent); re-enable when the last card carries the correction.
