# `E5` · Weekly minimum-wage guarantee on piece

## Application Overview

**Revision 1, 2026-10-27. Planned at code level, with no screen opened.** The `playwright-test` MCP seed project `agent-seed` is not enabled in this MCP server (`AGENT_SEED_ENABLED` is unset), so `planner_setup_page` answered "seed test not found" and no browser page was available. This follows the E11 precedent. The facts below come from two sources: the orchestrator's read-only dev probe (su, 2026-10-27 14:20 IST: `GET preferences`, `departments`, `minimum-wages`, `session/me`, `jobs` and the deployed bundle's `enum:department.minimumWageMethod`) and the page objects already measured in this repo. Every screen label this plan has not seen is marked **CALIBRATE** and listed under Open questions.

> **One picker, one piece job, two 8-hour days, and a week that falls short.**
> - **Setup:** `E5 PICKER ONE` works one piece job, `E5 JOB`, at **40.00 per piece**. E5's own Minimum Wage record is **19.00/h**, so a day's floor is 8 × 19 = **152.00**.
> - **Monday** 06:00–14:00: 3 pieces = **120.00**, which is 32 below the day's floor.
> - **Tuesday** 06:00–14:00: 4 pieces = **160.00**, which is 8 above the day's floor.
> - **Week:** 16 h. Piece pay 280.00 is below the weekly floor of 16 × 19 = 304.00, so the weekly guarantee adds a make-up of **24.00**, and View ▸ Job Cards must read **Totals Amount 304.00**.
> - **Named contrasts:** under the per-day method ("Each Day", the employer's own setting) Monday alone is topped up, so the week reads 152 + 160 = **312.00**. With no guarantee ("Never") it reads **280.00**.
> - **Why the make-up is 24 and not 32:** Tuesday's 8 surplus absorbs part of Monday's 32 shortfall. That is the catalog's "a single low day is acceptable if the week as a whole clears it", proved inside the same week.
>
> **Binding safety constraints:**
> - **No preference is written.** The employer `minimumWageCalcMethod` (EachDay) and `houlyMinimumWageCounter` (null) are gates that are read and never touched. Job Card Preferences is never opened for a write.
> - **The lever is E5's own department (the E1 pattern).** `E5 DEPARTMENT` has Minimum Wage = `E5 MINIMUM WAGE` and Minimum Wage Method = **Each Week**, both set on the Department form. It is assigned only to `E5 CREW` and `E5 PICKER ONE`.
> - **Other records stay untouched.** The existing Minimum Wage records ("2020", "CA Minimum Wage", "California MinWage", "Test") and `E1 DEPARTMENT` are never opened for edit.
> - **One multi-day transfer (Mon + Tue).** On su, WEBPET-3158's saved-week re-price does not fire (E1, 2026-10-26). Day-by-day commits would therefore freeze Monday at its own value and could never show the weekly true-up.
> - **Transfer and cleanup rules as E1.** Transfer by Reference after the Work Crew filter, and never "Select all rows". No UI delete.

| Artifact | Path |
|---|---|
| Catalog entry | `workflow-catalog.json` → `E5` (line 1393) |
| Jira | `WEBPET-2061` · automation ticket `PET-12492` |
| Recording | — none |
| This plan | `test-plans/journey-e/e05-weekly-minimum-wage-guarantee-on-piece.md` |
| Spec | `tests/web/journey-e-payroll/e05-weekly-minimum-wage-guarantee-on-piece.spec.ts` |
| Scenario | `src/data/journey-e/e05-weekly-minimum-wage-guarantee-on-piece.json` |
| Schema | `src/data/schemas/journeyEScenario.ts` → new `JourneyE5MinimumWageCaseSchema` |
| Runner row | `src/data/runner/journey-e.csv` → `E5` (line 6, today `draft`, `enabled 0`, `jira` empty) |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `E5` |
| Journey | `E` — Weekly payroll close and export |
| Segments | `grower` · `perennial-grower` · `pack-house` |
| Modules | `Piece Payment` · `Windows` (`session/me`: PiecePayment true, Department true) |
| Surface | `calc` — runner category `workflow` |
| Demo candidate | no |
| Catalog status | draft |

**Summary**
> Guarantee that piece-rate earnings meet at least minimum wage averaged across the week, topping up if they fall short. A single day below minimum is acceptable if the week as a whole clears it.

## Catalog steps

| # | Catalog step | Office surface | Automatable? |
|---|---|---|---|
| 1 | Total the week's piece pay and hours worked. | The engine does this at Transfer. The inputs are on screen: Crew Piece Out 3 / 4 pieces, Job form Piece Rate 40, punches 06:00–14:00. View ▸ Job Cards shows the totals: Totals **Gross 16**, piece counter **7** (`view-job-cards-piece-count`), Regular 16, Overtime 0. | **yes, on screen** |
| 2 | Compare the implied hourly to the applicable minimum wage. | No screen shows the implied rate (280 / 16 = 17.50). The *applicable* wage is on screen on the Department form (Minimum Wage `E5 MINIMUM WAGE`, Method Each Week) and the Minimum Wage form (19.00). If the Transfer screen raises a minimum-wage Issue (`famousVerifyMinimumWage` true), its text is recorded as evidence (OQ 5). | **yes, through its effect** (step 3); the inputs are read back on screen |
| 3 | Add a make-up amount where the weekly average falls below minimum. | View ▸ Job Cards for Mon–Tue with the crew chip: **Totals Amount 304.00**, against 312.00 (Each Day) and 280.00 (Never). | **yes, on screen**: this is the workflow |
| var. | Minimum wage overridden per field via a state-specific wage record. | Setup ▸ State has its own `minimumWageCounter` (bundle). | *deferred: needs an E5-owned State + Field pair, and the precedence of state vs department is unmeasured. The field's state is gated instead (see Preconditions).* |

## Expected outcomes

- **Setup ▸ Minimum Wage** `E5 MINIMUM WAGE` reads rate **19.00** after a fresh load. A missing record is created on screen, and a drifted rate is repaired on screen.
- **Setup ▸ Department** `E5 DEPARTMENT` reads Minimum Wage **`E5 MINIMUM WAGE`** and Minimum Wage Method **`Each Week`** after a fresh load. Both are set on screen every run (a no-op when already equal). `GET departments/{id}` is polled until `minimumWageCounter` and `minimumWageMethod` are stored (plumbing), and the wire values are recorded as `api-only-evidence`.
- `E5 CREW` and `E5 PICKER ONE` show Department `E5 DEPARTMENT` after a fresh load. The Job form has no Department field (E1, OQ 2 answer).
- `E5 JOB` shows Payment Type Piece, **Piece Rate 40**, Overtime Rule `AG CA 2022` (Job form read-back). Hourly Rate is read-only on a Piece job and stays empty. Consider Employee Rate is left at its default (true): the picker carries no rate (gate), so the piece rate alone prices the pieces.
- **Gates** (read, fail by name, never written):
  - employer `minimumWageCalcMethod` = `EachDay` and `houlyMinimumWageCounter` = null, so the department is the only source of a weekly guarantee and of a wage;
  - `includeTimeJobsInMinWageCalc` false, `includeBonusInMinWageCalc` false, `useMinimumWageColumnType` = `HourlyRate`;
  - `maximumNumberOfPieces` ≥ 4 and `minimumNumberOfPieces` ≤ 3;
  - `maximumDaysForTransferExport` ≥ |Monday offset|, `viewJobCardsAfterTransfer` true;
  - `payOvertimeBasedOnWeeklyAvg` = None.
- **Seeding (on screen), per day:** Crew Time In 06:00 on `E5 JOB` → Crew Piece Out 13:30, 3 pieces Monday / 4 pieces Tuesday → Crew Time Out 14:00. That makes 6 own time cards, 3 per day, one of them a crew piece-out with no employee.
- **Transfer (one commit, Mon–Tue, crew filter):**
  - the roster guard offers exactly the 6 own References;
  - the Job Cards preview is recorded as `preview-evidence` and not asserted (OQ 4);
  - the toast reads "Transfer complete — **2** job cards written, **6** time cards transferred." (`expected.toast`, calibrated by OQ 4 if the make-up is its own card);
  - the app lands on View ▸ Job Cards with this run's id.
- **View ▸ Job Cards, Mon–Tue + crew chip `E5 CREW`:**
  - one row per day: Mon **Gross 8 · Regular 8 · Overtime 0 · Double 0**, and the same for Tue;
  - piece counter shown = **7**;
  - Totals **Gross 16 · Regular 16 · Overtime 0 · Double 0 · Amount 304.00**;
  - the sum of the own rows' Amount equals Totals Amount (conservation).
- **Named failures on Totals Amount:**
  - **312.00**: "make-up computed per day: the department's Minimum Wage Method 'Each Week' was not applied (the employer's EachDay was used with the department's wage)".
  - **280.00**: "no make-up reached the Amount column. Either the department's Minimum Wage record was not read (the employer's is empty), or the make-up is held outside Amount. Check the `grid-headers` evidence and `calculationDesc`."
  - Any other value fails with the three expected numbers quoted.
- **Where the 24.00 lands** (Monday's card, Tuesday's card, split, or a separate underpayment card with earning code `09`) is recorded as `makeup-evidence`: per-row Amount, the grid's column headers, and each card's `calculationDesc` plus any `/minimum|underpay|makeup/i` keys from `GET job-cards/{id}` as `api-only-evidence`. Per-row Amount is **not asserted in revision 1**. It gets pinned after the first green run (OQ 4).
- **Week clears despite a low day** (e.g. Mon 3 / Tue 5 = 320 ≥ 304 → no make-up, Each Day would read 352). *— deferred: one happy path per workflow; the 24-not-32 offset already proves the low day is absorbed by the week. The schema accepts this shape as data, so it can be swapped in or added by a later ticket.*
- **Re-price on a later one-day transfer** (Tuesday transferred after Monday was already written). *— not automatable on dev today: WEBPET-3158 (saved-week re-price) does not fire on su (E1, 2026-10-26). Hence the single multi-day commit.*
- **State-specific wage per field.** *— deferred (see Catalog steps, variation).*
- **Export of the make-up as earning code `09`** (`pieceUnderpaymentEarningCode`). *— deferred to E9/E10 (export file); recorded as preference evidence only.*
- On-blur validation, Save-stays-disabled and the "Unsaved changes" bar on the Setup and Batch forms. *(POM) — relied on through `SetupScreenPage` / `CrewPunchPage`, and not asserted separately.*

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| **Setup ▸ Minimum Wage** | `File ▸ Administration ▸ Setup ▸ Minimum Wage` (measured 2026-10-27: the "Minimum Wage" link nests at the same four-level depth as Over-Time-Rule; confirm the group names on the first run); `/setup/minimum-wages`, `/new`, `/:id`; page title "Minimum Wages - PET Tiger" | **new** `src/pages/setup/MinimumWagePage.ts` extends `SetupScreenPage` | to write |
| Setup ▸ Department | `File ▸ Administration ▸ Setup ▸ Department` | `src/pages/setup/DepartmentPage.ts` | **+ minimum-wage members** (below) |
| Setup ▸ Crew / Employee | `Setup ▸ Crew` / `Employee` | `CrewPage.ts`, `EmployeePage.ts` | unchanged (`setDepartment`, from E1) |
| Setup ▸ Job | `Setup ▸ Job` | `JobPage.ts` | unchanged (`setPieceRate`, `readPieceRate`, `setOvertimeRule`, `readConsiderEmployeeRate`) |
| Crew Time In / Crew Piece Out / Crew Time Out | `Input ▸ Batch ▸ …`; Crew Piece Out has no menu entry and opens by address (existing behaviour in `CrewPieceOutPage`) | `CrewTimeInPage`, `CrewPieceOutPage`, `CrewTimeOutPage` | unchanged |
| Transfer to Job Cards (Time Cards + Job Cards tabs) | `Input ▸ Transfer to Job Cards` | `TransferToJobCardsPage.ts` | unchanged (`scopeToRange`, `filterByCrew`, `openJobCardsTab`, `previewOvertimeBuckets`, `previewTotals`, `runTransfer` handles the warnings confirm) |
| View ▸ Job Cards | `View ▸ Job Cards` | `ViewJobCardsPage.ts` | **+ `columnHeaders(): Promise<string[]>`** (read-only, lifted from `cellByHeader`'s header read so both share it) |
| Registry | — | `src/fixtures/pages.fixture.ts` | **+ `minimumWage: MinimumWagePage`** |

**`MinimumWagePage`** config:
- `listUrl '/setup/minimum-wages'`, `entity 'Minimum Wage'`; grid columns Name · Current Rate · Active with a "Filter…" textbox (measured 2026-10-27; the grid's accessible name is read on the first run); `menuPath ['File', 'Administration', 'Setup', 'Minimum Wage']`; `rejectionMessage /already (exists|in use)|Failed to (create|update)/i`.
- Fields (measured 2026-10-27 on `/setup/minimum-wages/new`): textbox **`Name *`** (`#name`) and spinbutton **`Current Rate *`** (`#currentRate`, type number, default 0); nothing else is required; Save stays disabled until both are valid. The "Rate History Records" section reads "Save the minimum wage first." on the New form, so the rate is set directly through `Current Rate` and no history row is ever added or edited.
- Members:
  - `openByName(name)`: filtered `?name=` link, then F5, as `DepartmentPage.openByName`;
  - `createMinimumWage({ name, rate }): FormOutcome`;
  - `readRate(): number`;
  - `setRate(rate)`: read-first no-op, `saveEdit`, fresh-load read-back;
  - `savedIdFromUrl`.
  - **No Delete member.**

**`DepartmentPage` additions:**
- Locators (measured 2026-10-27 on `/setup/departments/3856`):
  - `minimumWageCombobox`: `#minimumWageCounter` — an `<input role="combobox" aria-haspopup="listbox">` labelled **"Minimum Wage"** (label `for="minimumWageCounter"`), with a clear button beside it; its options are the active Minimum Wage records by name (today "2020", "CA Minimum Wage", "California MinWage", "Test"). Anchor the exact option text, as `setDepartment` does;
  - `minimumWageMethodSelect`: `#minimumWageMethod` — a `<button role="combobox">` (shadcn select) labelled **"Piece Minimum Wage & Averaging Period"**, not "Minimum Wage Method". Options, exact text: Never · Each Job-Card · **Each Week** · Each Day · Each Day per Job · Each Week per Job · Each Day per Job per Field · Each Week per Job per Field · Each Day per Field · Each Week per Field; "—" means none.
- `gotoMinimumWageSection()`: heading `h2 "Job Card"` ▸ `h3 "Meal & Minimum Wage"` (the section also holds Require Meal, Minimum Gross for Required Meal and the checkbox "Include Bonus in Minimum Wage"); it sits right after `h3 "Overtime & Rounding"`, which `setWeeklyOvertimeMethod` already scrolls to.
- `readMinimumWage(): { wage: string; method: string }`
- `setMinimumWage({ wage, method })`: read-first no-op; pick the wage with the anchored exact option (as `setDepartment` does for the creatable Employee combobox); pick the method with `pickSelect` / `pickCombobox` by tag name (as `setWeeklyOvertimeMethod`); one `saveEdit`; fresh-load read-back of both.

**`ensureMinimumWageOnScreen(spec)`** in `src/utils/fixtureRows/ensureOnScreen.ts`, the shape of `ensureOvertimeRuleOnScreen`:
- `GET minimum-wages` → find the record by name (active);
- if missing, create it on screen with `createMinimumWage`; if that is rejected and still no live row, fail by name and point at Deleted Records (WEBPET-2368);
- if it exists, `openByName` + `setRate` (repair on screen) and annotate `fixture-repaired-on-screen` when the rate changed.
- No `arrange` write, no restore.

## Data

- **Fixture** `src/data/journey-e/fixture.json` block `"e5"`, with a typed accessor `journeyE5Fixture()` beside `journeyE1Fixture()`:
  - `minimumWage { name "E5 MINIMUM WAGE", rate 19 }`
  - `department { name "E5 DEPARTMENT" }`
  - `crew { code "8026", name "E5 CREW" }`, `picker { code "8027", name "E5 PICKER ONE" }`: one member only, so the crew piece-out goes entirely to the picker (`pieceOutIncludesOnlyTimeInEmployees` true)
  - `job { code "4620", name "E5 JOB", paymentType "Piece", pieceRate 40 }`
  - **Probe the codes free on dev (live and recycle bin) before the first commit.** 8024/8025 are E1's, 8022/8023 E3's, 8020/8021 D5's, 4603–4619 are taken, and 4602 is burnt.
  - The names are protected by `/^E\d{1,2} /` in `PROTECTED_NAME_PATTERNS` (already present for E1/E2). **Do not** add a `jobCard` or `minimumWage` entry to `cleanupTargets.ts`.
- **Scenario** `src/data/journey-e/e05-weekly-minimum-wage-guarantee-on-piece.json` (`JourneyE5MinimumWageCaseSchema`):

```jsonc
{
  "workflow": "E5", "label": "e05-weekly-minimum-wage-guarantee-on-piece",
  "mondayWindow": { "earliest": -12, "latest": -6 },
  "minimumWage": { "rate": 19 },
  "department": { "minimumWageMethod": "Each Week" },
  "rule": { "name": "AG CA 2022", "overtimeDailyHours": 8 },
  "pieceRate": 40,
  "days": [
    { "weekday": 0, "timeIn": { "hour": 6, "minute": 0 }, "pieceOut": { "hour": 13, "minute": 30 }, "timeOut": { "hour": 14, "minute": 0 }, "pieces": 3 },
    { "weekday": 1, "timeIn": { "hour": 6, "minute": 0 }, "pieceOut": { "hour": 13, "minute": 30 }, "timeOut": { "hour": 14, "minute": 0 }, "pieces": 4 }
  ],
  "expected": {
    "timeCards": 6, "jobCards": 2, "toast": { "jobCards": 2, "timeCards": 6 },
    "perDay": [ { "gross": 8, "regular": 8, "overtime": 0, "double": 0 }, { "gross": 8, "regular": 8, "overtime": 0, "double": 0 } ],
    "pieces": 7, "piecePay": 280, "weeklyFloor": 304, "makeUp": 24,
    "totals": { "gross": 16, "regular": 16, "overtime": 0, "double": 0, "amount": 304 },
    "contrasts": { "eachDay": 312, "never": 280 }
  },
  "gates": {
    "minimumWageCalcMethod": "EachDay", "houlyMinimumWageCounter": null,
    "includeTimeJobsInMinWageCalc": false, "includeBonusInMinWageCalc": false,
    "useMinimumWageColumnType": "HourlyRate", "payOvertimeBasedOnWeeklyAvg": "None"
  },
  "cleanup": []
}
```

`superRefine` re-derives every number, so the data cannot drift from the arithmetic:
- **Window:** as E1. `latest - earliest === 6`, the last day ≤ −1, days −13…−21 excluded (other journeys own them). Weekdays run 0..n-1 in order.
- **Times:** quarter hours only (Time Rounding at Transfer = 15). `timeIn < pieceOut < timeOut`. Day hours ≤ `rule.overtimeDailyHours`, so no overtime can mix into the money.
- **Pieces:** `1 ≤ pieces ≤ 5` (the Crew Piece Out screen rejects more than `maximumNumberOfPieces` = 5 with `block.piece_above_maximum`, per `CrewPieceOutPage`). The flow re-checks this against the live preference.
- **Derived values:**
  - `piecePay = Σ pieces × pieceRate`
  - `weeklyFloor = Σ hours × rate`
  - `makeUp = max(0, weeklyFloor − piecePay)`
  - `totals.amount = piecePay + makeUp`
  - `contrasts.eachDay = Σ max(dayPieces × pieceRate, dayHours × rate)`
  - `contrasts.never = piecePay`
  - `pieces = Σ pieces`
  - `totals.gross = Σ hours`
- **Non-vacuous:**
  - at least one day below its daily floor and one above it;
  - `piecePay < weeklyFloor`;
  - `totals.amount`, `eachDay` and `never` pairwise distinct;
  - `makeUp` < the largest single-day shortfall (the offset proof).
- `cleanup` length 0, as E1: the days are only known at run time, so the flow sweeps per day itself.

## Preconditions

- [ ] `prepareJourneyE5(scenario, { sessionApi, testInfo, pages })` in `src/utils/journeys/journeyEFlow.ts`, the shape of `prepareJourneyE1`:
  1. B1 RANCH / B1 FIELD (read-only reuse) → `ensureMinimumWageOnScreen` → `ensureDepartmentOnScreen(E5 DEPARTMENT)` → `ensureCrewOnScreen(E5 CREW)` → `ensureEmployeeOnScreen(E5 PICKER ONE, home crew E5 CREW)` → `ensureJobOnScreen(E5 JOB, Piece, 40)`.
  2. `weekDays(scenario.mondayWindow, 2)`, then a per-day before-phase sweep: crew job cards first, then crew time cards (`sweepCrewJobCards` / `sweepCrewTimeCards` under `cleanup`). Register `finishCleanup` with `currentScope(testInfo)`, as E1.
  3. On screen:
     - `pages.department.openByName` + `setMinimumWage({ wage: 'E5 MINIMUM WAGE', method: 'Each Week' })`, with a save-landed poll on `GET departments/{id}`;
     - `setDepartment` on the crew and the picker;
     - the job's `setOvertimeRule('AG CA 2022')` and `setPieceRate(40)`, each followed by reopening the record (both setters leave the form).
  4. Gates (read, fail by name):
     - crew has no exercise job, break automation or lunch (E1's check);
     - the picker has no positive `hourlyRate` / `payRate` / `rate`, and no non-null key matching `/minimum/i`;
     - the field's `overTimeRulesCounter` is null or AG CA 2022;
     - **the field's and ranch's state carry no `minimumWageCounter`**: `GET fields/{id}` → state counter → `GET states/{id}` (key names CALIBRATE). Precedence of a state wage over the department is unmeasured, so a non-null value fails by name;
     - the preference gates from `scenario.gates` plus the piece-count and window gates.
  5. Evidence:
     - `department-evidence` for crew, picker and job;
     - `preference-evidence` for `chkMinWageForUserRateOverwrite`, `pieceDiscrepancyForTimeNPiece`, `pieceUnderpaymentEarningCode`, `exportUnderpaymentAsTimeJobs`, `payPieceByShift`, `distributePiecesInShiftByAvg`, `payRoundingUp`, `famousVerifyMinimumWage`, `payIdleTimeAsAverage`;
     - `scanPoison` over the two days.
- [ ] The department's `firstDayofWeek` is recorded. Mon + Tue sit in the same payroll week for a Sunday or a Monday start.

## API allowances

| Step / call | Endpoint | Allowance | Why | Proof on screen |
|---|---|---|---|---|
| minimum-wage lookup | `GET minimum-wages` | plumbing read | create-or-open by name | Minimum Wage form read-back (19.00) |
| department lookup / save-landed poll | `GET departments`, `GET departments/{id}` | plumbing read | find by name; wait for the on-screen save; record `minimumWageCounter` / `minimumWageMethod` | Department form read-back (wage + Each Week) |
| fixture rows missing | `POST <entity>/{id}/restore` | arrange | inside `ensureOnScreen` only | — |
| fixture, precedence and department gates | `GET crews/{id}`, `GET employees/{id}`, `GET jobs/{id}`, `GET fields/{id}`, `GET ranches/{id}`, `GET states/{id}` | plumbing read | fail by name on a fixture the arithmetic cannot tolerate | Crew / Employee / Job form read-backs |
| preference gates | `GET preferences` | plumbing read (`environment-gate`) | employer method / wage, piece caps, window, landing | — |
| punch sync + ids | `GET time-cards?from&to` per day | plumbing read | the Time Out form offers only open time-ins; ids for cleanup recorded before asserting | roster guard on the Transfer screen |
| job-card ids + execute job | `GET job-cards?from&to` per day, `GET transfer-to-job-cards/execute/{id}` | plumbing read | cleanup ids on every poll; `days[].error` quoted on a short count | toast + View ▸ Job Cards rows |
| where the make-up lives | `GET job-cards/{id}` → `calculationDesc`, `/minimum\|underpay\|makeup/i` keys | plumbing read (`api-only-evidence`) | no screen shows the make-up's composition | none — annotated |
| teardown | `DELETE job-cards/{id}` (with version), `DELETE time-cards/{id}`, per-day crew sweeps | cleanup | by id / crew + day | — |

No preference write. No API write to the Minimum Wage record, the department, the job, the crew or the employee: all of them are configured on screen. The minimum wage and department are E5-owned reference rows and are not restored after the test.

## Cleanup

1. Job cards by id, re-recorded across Mon–Tue after the transfer. If a separate make-up card exists, the crew-scoped day sweep catches it.
2. Per-day crew job-card sweep.
3. Time cards by id (6, including the crew piece-out with `employeeCounter` null).
4. Per-day crew time-card sweep.

`E5 MINIMUM WAGE`, `E5 DEPARTMENT`, `E5 CREW`, `E5 PICKER ONE` and `E5 JOB` are permanent E5 fixtures. They are never deleted and keep their configuration.

## Test case

Runner row `journey-e.csv:6` (exists): `jira` → `PET-12492`, `status` → `automated`, `enabled` → `1`. **Flip last, only when green**; until then `enabled 0`. Category `workflow`, tags `regression`. Then `npm run runner:sync && npm run runner:check`.

```ts
test.describe('E5 · Weekly minimum-wage guarantee on piece', { tag: ['@JourneyE', '@E5'] }, () => {
    test('[Payroll] A piece week below minimum wage is topped up to hours x minimum wage for the week, not per day.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E5' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

`test.setTimeout(900_000)`, as E1. No `test.slow()`. The spec imports only `@utils/journeys/journeyEFlow`, plus the schema and `loadScenario`.

**Transfer red rule.** A short count whose `commitTransfer` message quotes `days[].error` with `JobCard_Reference_Unique` is the known multi-day execute defect (unfiled; bug draft 2 in `HANDOFF-2026-10-26-E6-E11-E13.md`). It is a **product red**: report it and never heal it. E5 cannot fall back to day-by-day commits without losing the weekly make-up (WEBPET-3158), so splitting the transfer is **not** a fix.

## Generator file list

- `src/pages/setup/MinimumWagePage.ts` (new)
- `src/pages/setup/DepartmentPage.ts` (+ minimum-wage members)
- `src/pages/processing/ViewJobCardsPage.ts` (+ `columnHeaders`)
- `src/fixtures/pages.fixture.ts` (+ `minimumWage`)
- `src/utils/fixtureRows/ensureOnScreen.ts` (+ `ensureMinimumWageOnScreen`)
- `src/utils/journeys/journeyEFlow.ts`: + `prepareJourneyE5`, `seedPieceDays` (per day: crew time-in, wait for the readable time-in, crew piece-out, crew time-out; 3 own cards per day recorded before asserting; the same calls as `journeyDFlow.seedCrewPieceOutDay`), `transferPieceWeek` (`openScopedCandidates` with `days` + crew, preview evidence, `commitTransfer`, landing, re-record ids), `readPieceWeekOnScreen`, `recordMakeUpEvidence`
- `src/data/schemas/journeyEScenario.ts` (+ `JourneyE5MinimumWageCaseSchema`)
- `src/data/journey-e/fixture.json` (+ `e5`) and its accessor
- `src/data/journey-e/e05-weekly-minimum-wage-guarantee-on-piece.json` (new)
- `tests/web/journey-e-payroll/e05-weekly-minimum-wage-guarantee-on-piece.spec.ts` (new)
- `src/data/runner/journey-e.csv` row E5 (flip last)

**Validation:**
- `npm run typecheck`, `npm run lint`, `npm run runner:sync`, `npm run runner:check`;
- `UI_FIRST_GUARD=enforce npm run test:dev -- tests/web/journey-e-payroll/e05-weekly-minimum-wage-guarantee-on-piece.spec.ts`;
- re-run **E1** (`--grep @E1`), because `DepartmentPage` and the shared week are touched;
- run the gate-skip check on the first run.

## Open questions for the tester

**Blocking questions 1 and 2 were answered by the orchestrator's read-only screen probe on 2026-10-27** (headless Chromium on `.auth/user.json`, every non-GET request aborted at the route layer; scratch script `probe4-screens.js`). The measured facts are written into *Screens and page objects* above.

- [x] **1. Setup ▸ Minimum Wage screen:** New form = `Name *` textbox + `Current Rate *` spinbutton, nothing else required; "Rate History Records" appears only after the first save ("Save the minimum wage first."), so the rate is a direct input. Grid columns Name · Current Rate · Active. Menu: the link nests at Over-Time-Rule's depth under File ▸ Administration ▸ Setup.
- [x] **2. Department form:** section `Job Card ▸ Meal & Minimum Wage`; `#minimumWageCounter` (input combobox, label "Minimum Wage", options = the active records by name) and `#minimumWageMethod` (button combobox, label **"Piece Minimum Wage & Averaging Period"**); the option text is exactly **"Each Week"**.
- [x] **7. Fixture codes** 8026 (crew), 8027 (employee) and 4620 (job) are free on su in the live rows and in `/jobs/deleted`, `/crews/deleted`, `/employees/deleted` (probed 2026-10-27); no `E5 *` name exists anywhere, including `/minimum-wages/deleted`.

**Orchestrator's position on the rest (Gukan decides):** 3 — set employee and crew, as E1 (the engine honoured it there). 5 — recording the row status is acceptable; D6 proved the "No hourly rate available" warning non-blocking for piece jobs. 6 — sharing the E1/E3 week with an own crew is the established pattern; keep the crew-scoped sweeps and the poison scan. 8 — the short week (make-up 24.00) is the happy path, because it is the only shape whose Each Week value differs from both Never and Each Day. 4 stays a first-run calibration.

**Calibrated on the first run** (the spec names each outcome; the tester decides):

- [ ] **3. Which record's department does the minimum-wage engine read: employee, crew or field?** E5 sets employee + crew, as E1 proved for the weekly OT method. 280.00 or 312.00 on the first run names "not the department we set" or "the method not honoured".
- [ ] **4. Where does the 24.00 make-up land?**
  - Folded into Monday's or Tuesday's card Amount?
  - Spread across the cards?
  - Or a separate underpayment card (earning code `09`), which would make `expected.jobCards` / `toast.jobCards` 3?
  - Revision 1 asserts only Totals Amount, row conservation and per-day hours. After the first green run, pin `expected.rows` (per-day Amount) and the card count from the recorded `makeup-evidence`. If Totals reads 280 while `calculationDesc` shows a 24.00 make-up, the make-up lives outside the Amount column. In that case the screen proof must move to that column, and that is a plan change, not a heal.
- [ ] **5. Does the Transfer screen raise a minimum-wage Issue or a warnings confirm** (`famousVerifyMinimumWage` true; piece jobs also raise "No hourly rate available", which D6 showed is non-blocking)?
  - `runTransfer` already accepts the confirm. Row status is recorded, **not** asserted `Ready` (piece days carry that warning).
  - Confirm that recording, rather than asserting, is acceptable.
- [ ] **6. Day sharing.** E5 uses the E1/E3 week (the Monday in −12…−6, Mon + Tue), with its own crew, Work Crew filter, crew-scoped sweeps and a poison scan. That week also carries D9 −12, D6 −11, C6 −10 and B −9…−5. Every day from −1 to −21 already has an owner, and E1's schema forbids −13…−21. Is sharing acceptable, as it is for E1 and E3?
- [ ] **7. Fixture codes** 8026 / 8027 / 4620 must be probed free (live rows and recycle bin).
- [ ] **8. Shape.** Is a *short* week (top-up 24) the right happy path, with the *clearing* week (Mon 3 / Tue 5, no top-up) deferred? The alternative proves the second catalog sentence directly, but its Each Week value equals Never (320), so it cannot tell "weekly guarantee" from "no guarantee".

## Test Scenarios

### 1. E5 · Weekly minimum-wage guarantee on piece (one happy-path test, testCaseId E5, @JourneyE @E5 @Regression)

**Seed:** `tests/seed.spec.ts`

#### 1.1. [Payroll] A piece week below minimum wage is topped up to hours x minimum wage for the week, not per day.

**File:** `tests/web/journey-e-payroll/e05-weekly-minimum-wage-guarantee-on-piece.spec.ts`

**Steps:**
  1. Arrange (`prepareJourneyE5`): ensure B1 RANCH/FIELD, then E5 MINIMUM WAGE (19.00), E5 DEPARTMENT, E5 CREW, E5 PICKER ONE and E5 JOB (Piece, 40) on screen. Set the department's Minimum Wage = E5 MINIMUM WAGE and Minimum Wage Method = Each Week on the Department form. Set the crew's and picker's Department. Set the job's rule AG CA 2022 and Piece Rate 40. Run the per-day before-phase sweeps and the read-only gates.
    - expect: Minimum Wage form reads 19.00 after a fresh load
    - expect: Department form reads Minimum Wage 'E5 MINIMUM WAGE' and Method 'Each Week' after a fresh load
    - expect: Crew and Employee forms show E5 DEPARTMENT; Job form shows Piece Rate 40 and AG CA 2022
    - expect: Gates hold: employer minimumWageCalcMethod EachDay, houlyMinimumWageCounter null, piece caps, window; otherwise fail by name
  2. Seed Mon and Tue on screen (`seedPieceDays`): each day Crew Time In 06:00 on E5 JOB, Crew Piece Out 13:30 (3 pieces Mon, 4 pieces Tue), Crew Time Out 14:00. Own ids are recorded before anything is asserted.
    - expect: 6 own time cards, 3 per day, one crew piece-out per day with no employee
  3. Transfer (`transferPieceWeek`): Transfer to Job Cards, range Mon–Tue, Analyze, Work Crew = E5 CREW, roster guard, Job Cards tab preview recorded, tick each own Reference, commit once.
    - expect: The screen offers exactly the 6 own References; 'Select all rows' is never checked
    - expect: Toast 'Transfer complete — 2 job cards written, 6 time cards transferred.' (count per OQ 4); app lands on View ▸ Job Cards with this run's id
    - expect: A short count quoting days[].error JobCard_Reference_Unique is reported as a product red, never healed
  4. Read the week on screen (`readPieceWeekOnScreen`): View ▸ Job Cards, range Mon–Tue, Apply, crew chip E5 CREW; read the rows, piece counter and Totals bar.
    - expect: Mon and Tue rows each Gross 8, Regular 8, Overtime 0, Double 0; piece counter shows 7
    - expect: Totals Gross 16, Regular 16, Overtime 0, Double 0, Amount 304.00; the own rows' Amount sums to the Totals Amount
    - expect: On 312.00 the failure names the per-day method; on 280.00 it names a missing make-up (department wage not read, or make-up outside Amount)
  5. Record the evidence (`recordMakeUpEvidence`): grid column headers, per-row Amount, each own card's calculationDesc and minimum-wage/underpayment keys as api-only-evidence. Teardown in finally: job cards by id, crew job-card sweeps, time cards by id, crew time-card sweeps.
    - expect: Scoped GET job-cards and time-cards for both days are empty for E5 CREW after cleanup
