# `E3` · Weekly overtime

## Application Overview

**Revision 2, 2026-10-26: six daily commits, Monday to Saturday** (see *Dev results*). **Revision 1 was planned at code level** (no browser) from the orchestrator's read-only dev probe (su) and the E2/E6/E13 flows. Siblings: `e02-california-daily-overtime.md` (the daily rule), `e13-…` (own-jobs pattern).

> **Six days, one worker, one rule — and 40 regular hours crossed in the middle of Saturday.** E3 works its own crew and picker Monday to Saturday on its own job under `AG CA 2022` (daily OT after 8, DT after 12, weekly OT after 40). Monday is 6 h. Tuesday to Friday are 9 h each (8 regular + 1 daily OT). Saturday is 6 h. Only regular hours count toward 40 (`considerRegHoursOnly4WeeklyOt = true`): regular reaches 38 by Friday, so Saturday must read **2 regular + 4 weekly overtime**. The week must read **Regular 40 · Overtime 8 · Double 0** on 48 gross. Each wrong engine gives different totals: counting daily OT toward 40 gives 37/11, ignoring weekly OT gives 44/4, and a seventh-day rule firing on day 6 gives 38/10.
>
> **Binding safety constraints**
> * The week is the Monday in days **−12…−6** through Saturday (≤ −1), computed at run time and never fixed. Days −13…−21 are excluded on purpose: D10, E2, D3, D5, E8 and E13 assert whole-date-scope Ready/Blocking pills, or (D5) a crew-less candidate guard, which E3's untransferred rows would break. Days −12…−1 (D9, D6, C, B) are crew-filtered only.
> * Transfer: Work Crew filter first, rows ticked **by Reference**; `selectAllRowsCheckbox` is never touched. No pill is asserted, because pills count every foreign row in a 6-day scope.
> * **No preference is written** and `AG CA 2022` is never edited (E2/E6/E8/E11 share it). E3 edits only its own job on screen.
> * Forbidden as everywhere: per-row Delete, Job Card form Delete, `bulk-delete`, preview "Remove …".

| Artifact | Path |
|---|---|
| Catalog entry | `workflow-catalog.json` → `E3` (line 1348) |
| Jira | `WEBPET-2059` (Passed QA 2026-09-11) · automation ticket `PET-12669` |
| Recording | — none |
| This plan | `test-plans/journey-e/e03-weekly-overtime.md` |
| Spec | `tests/web/journey-e-payroll/e03-weekly-overtime.spec.ts` |
| Scenario | `src/data/journey-e/e03-weekly-overtime.json` |
| Schema | `journeyEScenario.ts` → new `JourneyE3WeeklyOvertimeCaseSchema` |
| Runner row | `journey-e.csv` → `E3` (line 4) |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `E3` |
| Journey | `E` — Weekly payroll close and export |
| Segments | `all` |
| Modules | `Windows` |
| Surface | `calc` — runner category `workflow` |
| Demo candidate | no |
| Catalog status | draft |

**Summary** (from the catalog)
> Apply weekly overtime after 40 regular hours in the workweek, alongside the daily rule. The two interact so hours are not counted twice.

## Catalog steps

| # | Catalog step | Office surface | Automatable? |
|---|---|---|---|
| 1 | Total the week's regular hours. | The engine does this during **Transfer to Job Cards** (`doWeeklyCalculationsOnJobCard = true`). The office reads it on **View ▸ Job Cards** scoped Mon–Sat + crew: the Regular Hours column per day and the **Totals ▸ Regular** bar. | **yes, on screen** |
| 2 | Pay hours beyond 40 at the OT rate where not already counted as daily OT. | Same screen: Saturday's row splits 2 regular + 4 overtime, Totals Overtime = 4 daily + 4 weekly = 8, Amount = 40×20 + 8×30. | **yes, on screen**, and this is the whole workflow |
| — | Variation: weekly exception for part-time employees. | No part-time setting was measured on dev. | **deferred** — see Expected outcomes |

## Expected outcomes

- Setup ▸ Job: `E3 JOB` shows Overtime Rule `AG CA 2022` and Hourly Rate 20 after a fresh load.
- File ▸ Administration ▸ Setup ▸ Over-Time-Rule ▸ `AG CA 2022` reads Over-Time Daily Hours **8**, Double-Time Daily Hours **12**, Ag Type **off**. It is read only and never repaired, because the rule is shared. The weekly threshold (40) and `weeklyDays` (6) are not on that form; they are an `environment-gate` read from `GET overtime-rules/{id}` (fail by name if not 40 / 6) and annotated `api-only-evidence`.
- With E3 CREW / E3 PICKER ONE punched on screen (crew time-in 06:00 on E3 JOB, crew time-out 12:00 Mon, 15:00 Tue–Fri, 12:00 Sat), the Transfer screen scoped Mon–Sat and filtered to E3 CREW offers exactly the **12** own References, each with status **Ready**.
- The transfer is committed **one day at a time, Monday to Saturday**, as the office does it. Each day's commit shows "Transfer complete — 1 job card written, 2 time cards transferred." and lands with its own run id. Saturday's Job Cards preview tab shows **1** row, recorded as `preview-evidence`, not asserted (WEBPET-3823 stale preview).
- View ▸ Job Cards, scoped Mon–Sat and Apply, then crew chip E3 CREW: **6 rows**, one per day, with Gross / Regular / Overtime / Double / Amount:
  - Mon **6 / 6 / 0 / 0 / 120**
  - Tue, Wed, Thu, Fri **9 / 8 / 1 / 0 / 190** each
  - Sat **6 / 2 / 4 / 0 / 160**
- **Totals bar:** Gross **48.0000** · Net **48.0000** · Meals **0** · Regular **40.0000** · Overtime **8.0000** · Double **0.0000** · Amount **1040.00** · First Date = the Monday.
- **Conservation:** Regular + Overtime + Double = Gross (48) on every row and in Totals. A larger sum means hours were double-counted, and the test fails by name.
- **Named contrasts** (the failure message names the mechanism):
  - Totals 37 / 11 (Fri 7/2, Sat 0/6): "daily overtime counted toward the weekly 40 despite considerRegHoursOnly4WeeklyOt=true".
  - Totals 44 / 4 (Sat 6/0): "weekly overtime not applied at transfer (doWeeklyCalculationsOnJobCard=true)" — day by day this also means the saved Mon–Fri cards were not counted toward the 40.
  - Totals 38 / 10 (Fri 8/1, Sat 0/6): "seventh-day rule applied on day 6 (weeklyDays=6)".
- Preference gates, read and never written; each fails by name and is annotated `environment-gate`: `considerRegHoursOnly4WeeklyOt === true`, `doWeeklyCalculationsOnJobCard === true`, `firstDayOfWeek === 2`, `viewJobCardsAfterTransfer === true`, `maximumDaysForTransferExport >= |Monday offset|`. `useAverageRateForOvertime` / `payOvertimeBasedOnWeeklyAvg` / `groupOvertimeByWageOrder` are recorded only: one job at one rate makes any averaging equal 20.
- **Federal-daily vs state-weekly OT tagging for export.** *— deferred: E2/E9 own export tagging; no screen separates daily from weekly OT hours.*
- **Weekly exception for part-time employees.** *— deferred: no part-time setting was measured on dev; needs a product pointer (Open question 3).*
- Transferred flag on View ▸ Time Cards. *— not asserted: the toast proves the 12 transferred, and E8 owns that screen check.*
- On-blur validation and Save-stays-disabled on Job / Crew / Employee forms. *`(POM)`.*

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Setup ▸ Ranch / Field / Crew / Employee / Job | via `ensureOnScreen` | existing | unchanged (B1 RANCH / B1 FIELD reused read-only) |
| Setup ▸ Job (rule + rate) | `Setup ▸ Job` | `JobPage.ts` | unchanged — `setOvertimeRule`, `setHourlyRate` |
| Over-Time-Rule (read only) | `File ▸ Administration ▸ Setup ▸ Over-Time-Rule` | `OvertimeRulePage.ts` | unchanged — `readBack(name)` |
| Crew Time In / Out | menu | `CrewTimeInPage`, `CrewTimeOutPage` | unchanged |
| Transfer to Job Cards | left menu | `TransferToJobCardsPage.ts` | **+ `scopeToRange(from, to)`** |
| View ▸ Job Cards | `View ▸ Job Cards` | `ViewJobCardsPage.ts` | **+ `scopeToRange(from, to)`, + `readDay(row, header)`** |

**`scopeToRange(from, to)`** is the same on both screens. The Transfer screen opens the "Dates" button; View ▸ Job Cards opens "First Day Start – Last Day Start" inside `expandFilter()`.
1. Open the popup and navigate back with "go to the previous month" until `from`'s day cell is visible.
2. Click `from`, then click `to`. The calendar shows two months; navigate again only if `to`'s cell is not visible.
3. Read the Month/Day segments (`getByRole('textbox', { name: 'Day' | 'Month' })`, nth 0 and 1). If they do not read from/to, **fail by name with the values read**. Never click a third time, because a third click toggles the range.
4. Apply, then assert the chip matches `^…${from}\s*[–-]\s*${to}` as `scopeToDay` does.

The click semantics after the default range are unmeasured. The read-back makes the first run calibrate them.

**`readDay(row, header)`**: "9/23/26 7:00 AM" → `2026-09-23`.

**Virtualisation (>100 rows):** a 6-day scope loads every tenant card on those days. Rows and Totals are read **only after** the crew chip (View) or the Work Crew filter (Transfer) is applied.

## Data

- **Fixture** `fixture.json` block `"e3"`: `crew { code "8022", name "E3 CREW" }`, `picker { code "8023", name "E3 PICKER ONE" }`, `job { code "4617", name "E3 JOB", paymentType "Time", hourlyRate 20 }`. **Codes must be probed free, live and in the recycle bin, before commit.** `/^E\d{1,2} /` protects the names.
- **Scenario JSON** (`JourneyE3WeeklyOvertimeCaseSchema`, `.strict()`):

```jsonc
{
  "workflow": "E3", "label": "e03-weekly-overtime",
  "mondayWindow": { "earliest": -12, "latest": -6 },
  "rule": { "name": "AG CA 2022", "overtimeDailyHours": 8, "doubleTimeDailyHours": 12, "weeklyOvertimeHours": 40, "weeklyDays": 6 },
  "hourlyRate": 20, "overtimeMultiplier": 1.5, "doubleTimeMultiplier": 2,
  "days": [
    { "weekday": 0, "timeIn": { "hour": 6, "minute": 0 }, "timeOut": { "hour": 12, "minute": 0 } },
    { "weekday": 1, "timeIn": { "hour": 6, "minute": 0 }, "timeOut": { "hour": 15, "minute": 0 } },
    { "weekday": 2, "timeIn": { "hour": 6, "minute": 0 }, "timeOut": { "hour": 15, "minute": 0 } },
    { "weekday": 3, "timeIn": { "hour": 6, "minute": 0 }, "timeOut": { "hour": 15, "minute": 0 } },
    { "weekday": 4, "timeIn": { "hour": 6, "minute": 0 }, "timeOut": { "hour": 15, "minute": 0 } },
    { "weekday": 5, "timeIn": { "hour": 6, "minute": 0 }, "timeOut": { "hour": 12, "minute": 0 } }
  ],
  "gates": { "considerRegHoursOnly4WeeklyOt": true, "doWeeklyCalculationsOnJobCard": true, "firstDayOfWeek": 2 },
  "expected": {
    "timeCards": 12, "jobCards": 6, "status": "Ready",
    "perDay": [
      { "gross": 6, "regular": 6, "overtime": 0, "double": 0, "amount": 120 },
      { "gross": 9, "regular": 8, "overtime": 1, "double": 0, "amount": 190 },
      { "gross": 9, "regular": 8, "overtime": 1, "double": 0, "amount": 190 },
      { "gross": 9, "regular": 8, "overtime": 1, "double": 0, "amount": 190 },
      { "gross": 9, "regular": 8, "overtime": 1, "double": 0, "amount": 190 },
      { "gross": 6, "regular": 2, "overtime": 4, "double": 0, "amount": 160 }
    ],
    "totals": { "gross": 48, "net": 48, "meals": 0, "regular": 40, "overtime": 8, "double": 0, "amount": 1040 },
    "contrasts": {
      "dailyCountedTowardWeekly": { "regular": 37, "overtime": 11 },
      "weeklyIgnored": { "regular": 44, "overtime": 4 },
      "seventhDayOnDaySix": { "regular": 38, "overtime": 10 }
    },
    "transferToast": { "jobCards": 1, "timeCards": 2 }
  },
  "cleanup": []
}
```

  `superRefine` checks:
  - `latest − earliest === 6` (exactly one Monday); `latest + 5 <= -1`.
  - No week day may fall in −13…−21. The message names the pill-checking owners: D10 −13, E2 −14, D3 −15, D5 −16, E8 −18, E13 −21.
  - `weekday` values are exactly 0…5 in order; every time is on a quarter hour (Time Rounding at Transfer = 15 min).
  - `perDay` is **derived** and must equal the data: the daily buckets per the rule, then regular capped cumulatively at `weeklyOvertimeHours` with the excess moved to overtime. Amount = reg×rate + ot×rate×1.5 + dt×rate×2. `totals` = Σ perDay.
  - Each `contrasts` entry is derived by its rule and must differ from `totals`, so the test is not vacuous.
  - `timeCards === 2 × days.length`; `jobCards === days.length`; `transferToast` is the per-day toast, `{1, 2}`.
  - `cleanup` is empty by design: the week's offsets are only known at run time, so the flow runs per-day crew-scoped sweeps itself (a `_notes` line says so).

## Preconditions

- [ ] `prepareJourneyE3`:
  - Ensure B1 RANCH / B1 FIELD → E3 CREW → E3 PICKER ONE (home crew E3 CREW) → E3 JOB on screen.
  - Compute the Monday (the offset in the window with `getDay() === 1`) and the six ISO days.
  - Register cleanup with `currentScope`.
  - Before-phase, **per day**: crew job cards first, then crew time cards.
  - On the Job form: rule `AG CA 2022` and rate 20, each read back after a fresh load.
- [ ] Gates, all fail by name:
  - Crew `exerciseJobCounter / createBreakCardFromTimeIn / autoPaidBreakType / autoReturnFromBreak / lunchLengthMinutes` all 0, the same check as `prepareJourneyEOwnJobs`.
  - The picker has no `hourlyRate/payRate/rate`.
  - `fields/{B1 FIELD}.overTimeRulesCounter` is null or equal to AG CA 2022.
  - The rule's weekly keys equal 40 / 6. The exact key names come from the GET body (e.g. `overtimeWeeklyHours`); the first run prints the keys if not found.
  - The preference gates above.
  - The `departmentCounter` of crew, picker and job is recorded. When non-null, the department's `firstDayofWeek` and `payOvertimeBasedOnWeeklyAvg` are recorded as evidence.
- [ ] Poison scan (evidence only): for each week day, list time cards with no crew filter. A **foreign** time-in with no time-out for the same employee is annotated `foreign-unpaired-time-in` (id, day). If the execute later ends in `error`, the failure message quotes the scan.

## API allowances

Browser-issued requests (Analyze, Apply/Refresh, Transfer execute) are user actions and have no row.

| Step / call | Endpoint | Allowance | Why | Proof on screen |
|---|---|---|---|---|
| fixture rows missing | `POST <entity>/{id}/restore` | arrange | inside `ensureOnScreen` only | — |
| rule thresholds | `GET overtime-rules`, `GET overtime-rules/{id}` | plumbing read (`environment-gate`, `api-only-evidence` for weekly 40 / weeklyDays 6) | the Over-Time-Rule form has no weekly field | daily 8/12 on the rule form (step 1) |
| fixture gates | `GET crews/{id}`, `GET employees/{id}`, `GET fields/{id}`, `GET departments/{id}` | plumbing read | fail by name on a fixture the arithmetic cannot tolerate | Job form read-back (step 1) |
| preference gates | `GET preferences` | plumbing read (`environment-gate`) | weekly settings, window, landing | — |
| punch readable + ids + poison scan | `GET time-cards?from=d&to=d` per day | plumbing read | the time-out form only offers open time-ins; cleanup ids; evidence | Transfer roster (step 3) |
| written job-card ids + run id | `GET job-cards?from=d&to=d` per day, execute job GET (in `commitTransfer`) | plumbing read | recorded on every poll, before assertions | toast + View rows (steps 4–5) |
| before-phase / teardown | `DELETE job-cards/{id}`, `DELETE time-cards/{id}`, per-day crew sweep | cleanup | by id / crew + day | — |

No preference write. No rule write. Per-day reads only: multi-day `listTimeCards` was seen capped at a page (fixtureReconcile note).

## Cleanup

| Phase | Step | How |
|---|---|---|
| after, 1 | own job cards by id | `run.jobCardIds` (`GET` → `DELETE` with version) |
| after, 2 | own time cards by id | `run.timeCardIds` |
| after, 3 | per-day crew sweep, all six days | time cards with `crewCounter === E3 CREW` (best effort) |
| — | fixture rows | E3-owned, never deleted, prefix protected |

Budget: ≤6 job-card DELETEs + 12 time-card DELETEs + 6 list GETs fit the scope's 60 s drain.

## Test case

Runner row `journey-e.csv:4`: `jira` → `PET-12669`, `status` → `automated`, `enabled` → `1` (**flip last, only when green**). Category `workflow`, tags `regression`.

```ts
test.describe('E3 · Weekly overtime', { tag: ['@JourneyE', '@E3'] }, () => {
    test('[Payroll] A six-day week crosses 40 regular hours on Saturday: 2 regular + 4 weekly overtime, the daily overtime never counted twice.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E3' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

`test.setTimeout(900_000)` (six seeded days, six daily commits). No `test.slow()`.

## Open questions for the tester

Non-blocking. The plan's default stands unless the tester objects.

- [x] **1. One Mon–Sat transfer, or day by day?** Day by day (revision 2). It is how the office transfers, Saturday's after-40 split is then computed from the saved Mon–Fri cards, and one Mon–Sat execute hits a Reference race on dev (*Dev results*).
- [ ] **2. `weeklyDays = 6` semantics.** The plan reads it as "the seventh consecutive day is special", so six days never trigger it. If the engine reads it as "from day 6", the test fails by name ("seventh-day rule applied on day 6").
- [ ] **3. Part-time weekly exception** (catalog variation): which setting carries it in web PET? Deferred until named.

## Test Scenarios

### 1. E3 · Weekly overtime (one happy-path test, testCaseId E3, @JourneyE @E3 @Regression)

**Seed:** `tests/seed.spec.ts`

#### 1.1. [Payroll] A six-day week crosses 40 regular hours on Saturday: 2 regular + 4 weekly overtime, the daily overtime never counted twice.

**File:** `tests/web/journey-e-payroll/e03-weekly-overtime.spec.ts`

**Steps:**
  1. **Arrange.** `loadScenario(JourneyE3WeeklyOvertimeCaseSchema)` → `prepareJourneyE3`, which runs the ensures, week days, cleanup registration, per-day before-phase, Job form rule + rate, and the gates. Then `pages.overtimeRule.readBack('AG CA 2022')`.
    - expect: E3 JOB shows `AG CA 2022` and 20 after a fresh load
    - expect: the rule form reads 8 / 12 / Ag Type off; the weekly gate reads 40 / 6 (or fails by name)
  2. **Seed on screen.** `seedWeek`: for each of the six days, `crewTimeIn.punchIn` 06:00 on E3 JOB → wait until that day's crew time-in is readable → `crewTimeOut.punchOut` (12:00 / 15:00). Ids are recorded per day before any assertion.
    - expect: exactly 2 own time cards per day, 12 in total
  3. **Roster, per day.** For each day Monday → Saturday: `openScopedCandidates` scoped to that day and filtered by Work Crew, then `rowStatusText` for the day's two own ids. On Saturday only, the Job Cards tab: 1 preview row (`preview-evidence`), back to the Time Cards tab.
    - expect: exactly the day's 2 own References, both Ready; `selectAllRowsCheckbox` not checked
  4. **Commit, per day (catalog steps 1+2).** `commitTransfer(…, toast {1, 2})` → `waitForTransferLanding` → `transferRunParam() === transferRunCounter`, six times.
    - expect: "Transfer complete — 1 job card written, 2 time cards transferred." on each day
  5. **Prove on screen.** `view.openFromMenu` → `scopeToRange(Mon, Sat)` → `applyFilter` → `filterByCrew(E3 CREW)` → crew chip reads exactly E3 CREW → poll Totals gross 48 → read Totals → `rowsForCrew` (6) → per row `readDay('Time In')`, Gross Time, Regular Hours, Overtime, Double Time, Amount, sorted by day.
    - expect: per-day buckets equal `expected.perDay`; Saturday reads 2 / 4
    - expect: Totals equal `expected.totals`, First Date = Monday; Regular + Overtime + Double = Gross
    - expect: on mismatch, the message names the matching contrast
  6. **Teardown** in `finally`: `run.cleanup()`.
    - expect: no own job or time cards remain on any of the six days

## Dev results (2026-10-26, su, `UI_FIRST_GUARD=enforce`)

- **AG CA 2022 cannot carry this workflow.** Its "Weekly Overtime (1.5) starts on Day" = 6 (the `overTimeWeeklyDays` key, read wrongly in this plan as a seventh-day setting) makes the whole sixth day worked overtime. The preview showed Saturday 0 regular / 6 overtime, which is the 38 / 10 contrast. E3 therefore owns **E3 RULE** (8 / 12, weekly after 40 regular hours, starts on day 7, Ag off), created and checked on File ▸ Administration ▸ Setup ▸ Over-Time-Rule. The weekly fields are on that form, so the API read for the threshold is gone. The contrast is renamed `dayRuleOnLastDay`.
- **Red by product:** the one Monday–Saturday transfer writes only some of the six job cards. `GET transfer-to-job-cards/execute/{id}` reports `status: complete` with per-day errors `Violation of UNIQUE KEY constraint 'JobCard_Reference_Unique' … (261026-000000N-JC-041-Su)`. One run wrote 5 of 6 cards, the next 1 of 6. The reference number is reused from job cards that earlier runs deleted (soft-deleted rows keep their Reference). `commitTransfer` now quotes those per-day errors.
- Seeding six days on screen, the Mon–Sat range scope (Today preset → from → to) and the Transfer roster all worked.
- Revision 1's runner row was parked `automated, enabled 0` on this result.
- **Scope decision (2026-10-26, Gukan):** WEBPET-2059 is Done (Passed QA 2026-09-11) and PET-12669 closes on the verified claim, weekly overtime after 40 regular hours without double-counting. Revision 2 commits the week **one day at a time**, the office's path; the assertions on View ▸ Job Cards are unchanged. The multi-day Reference race is a bug draft in the hand-off, not something the spec works around in its assertions.
