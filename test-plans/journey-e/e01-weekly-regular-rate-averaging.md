# `E1` · Weekly regular-rate averaging

## Application Overview

**Revision 2, 2026-10-26: one Monday–Wednesday transfer** (see *Scope decision* at the end). Revision 1 transferred Mon–Tue and then Wednesday alone; its result is kept under *Dev results*. Built on the measured Department form (`/setup/departments/<id>`, section **Job Card ▸ Overtime & Rounding**, combobox **Weekly Overtime Method**, empty on every department; the departments API carries `payOvertimeBasedOnWeeklyAvg`, null everywhere; the employer value is "None").

> **Two rates, one week, and an overtime premium priced at the week's average, then re-priced when the week grows.** E1's picker works Monday 5 h on `E1 JOB HIGH` ($35) and Tuesday 10 h on `E1 JOB LOW` ($20); Tuesday's last 2 h are daily OT. The weekly regular rate is straight-time pay ÷ hours = (175 + 200) / 15 = **$25**. The job's own rate gives $30/h OT. With the averaging method set on **E1's own department**, Tuesday's OT must follow $25. E1 then adds Wednesday (5 h on HIGH) and transfers only Wednesday. The average moves to (175 + 200 + 175) / 20 = **$27.50**, and **Tuesday's already-written OT must be re-priced**: catalog step 3, and Hilario's WEBPET-2060 note.
>
> **Binding safety constraints:** no tenant-wide preference is written (`payOvertimeBasedOnWeeklyAvg` / `useAverageRateForOvertime` stay None on the employer). The averaging switch lives only on `E1 DEPARTMENT`, which belongs to E1 and is assigned only to E1's crew and picker (and its jobs if the Job form offers it). Transfer rules are the same as E3 (crew filter, by Reference). Days are the Monday–Wednesday of the Monday in −12…−6, for the same reason as E3; E3 uses another crew, so they can share the week.

| Artifact | Path |
|---|---|
| Catalog entry | `workflow-catalog.json` → `E1` (line 1302) |
| Jira | `WEBPET-2057` (passed QA 2026-10-01) · automation ticket `PET-12491` |
| Recording | — none |
| This plan | `test-plans/journey-e/e01-weekly-regular-rate-averaging.md` |
| Spec | `tests/web/journey-e-payroll/e01-weekly-regular-rate-averaging.spec.ts` |
| Scenario | `src/data/journey-e/e01-weekly-regular-rate-averaging.json` |
| Schema | `journeyEScenario.ts` → new `JourneyE1RegularRateCaseSchema` |
| Runner row | `journey-e.csv` → `E1` (line 2) |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `E1` |
| Journey | `E` — Weekly payroll close and export |
| Segments | `all` |
| Modules | `Windows` |
| Surface | `calc` — runner category `workflow` |
| Demo candidate | no |
| Catalog status | draft |

**Summary**
> Compute each employee's regular rate, the weekly average hourly rate across all hours worked, which is the base for overtime and paid-break pay. For piece-rate workers it differs per person and changes every day as pieces accumulate.

## Catalog steps

| # | Catalog step | Office surface | Automatable? |
|---|---|---|---|
| 1 | Sum the week's total pay and total hours worked, excluding the OT premium itself. | Engine, at Transfer. The inputs are on screen: the seeded punches and the two jobs' Hourly Rate on the Job form. | **yes**, via its effect (step 2) |
| 2 | Divide to get the regular rate. | No screen shows the rate itself. It shows as Tuesday's Amount and the Totals Amount on View ▸ Job Cards. `calculationDesc` is recorded as `api-only-evidence`. | **yes, on screen through the money** |
| 3 | Recompute any pay that depends on it (paid breaks, the OT premium) as the week's totals change. | Second transfer (Wednesday only), then View ▸ Job Cards Mon–Wed: the Totals Amount moves from the stale value to the re-priced one. | **yes for the OT premium**; *paid breaks deferred to E4 (not showable, see e04)* |

## Expected outcomes

- **Setup ▸ Department** `E1 DEPARTMENT`: Weekly Overtime Method reads **`<method label>`** after a fresh load (Open question 1 fixes the label). It is created on screen when missing and set on screen every run. `GET departments/{id}.payOvertimeBasedOnWeeklyAvg` is polled until the save lands, and the wire value is recorded.
- E1 CREW and E1 PICKER ONE show Department `E1 DEPARTMENT` after a fresh load. Jobs too, if the Job form has a Department field (OQ 2).
- E1 JOB HIGH: `AG CA 2022`, rate 35. E1 JOB LOW: `AG CA 2022`, rate 20 (Job form read-back).
- Gate (read): the employer `payOvertimeBasedOnWeeklyAvg` is None, so the department is the only lever (otherwise fail by name).
- **One transfer (Mon–Wed):** 6 own References Ready; toast "3 job cards written, 6 time cards transferred."; View ▸ Job Cards Mon–Wed + crew chip:
  - Mon **5 / 5 / 0 / 175.00** (gross / regular / OT / amount)
  - Tue **10 / 8 / 2 / 242.50** (8 × 20 + 2 × 1.5 × 27.50)
  - Wed **5 / 5 / 0 / 175.00**
  - Totals Regular 18 · Overtime 2 · Double 0 · Amount **592.50**
- The weekly regular rate is (175 + 200 + 175) / 20 = **27.50** (schema-derived). Under "Premium Only" Tuesday would read 227.50 and the week 577.50; the scenario uses Entire Rate.
- Named failure: Totals 570.00 (Tuesday 220.00): "OT priced at the job rate — the department's Weekly Overtime Method was not applied (which department does the engine read?)".
- **Catalog step 3 (an earlier day re-priced by a later one-day transfer)** is not in the spec: see *Scope decision*. The schema still accepts a second transfer with `staleAmount`, so the step is re-added by data when the product supports it.
- `calculationDesc` of each own card is recorded as `api-only-evidence` (no screen shows the regular rate).
- **Piece-rate variation** (average shifts daily per person). *— deferred: two hourly rates move the average the same way; piece capture adds D9's crew piece-out flow and a piece-rate rounding question. Candidate follow-up.*
- **Paid-break dependency.** *— deferred to E4, which is not showable on dev (`paidBreakJob` null).*

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| **Setup ▸ Department** | unmeasured (OQ 3) — `/setup/departments` | **new** `src/pages/setup/DepartmentPage.ts` extends `SetupScreenPage` | to write |
| Setup ▸ Crew / Employee (Department) | `Setup ▸ Crew` / `Employee` | `CrewPage.ts`, `EmployeePage.ts` | **+ `setDepartment(name)`** (read-first no-op, `saveEdit`, fresh-load read-back; Employee's Department is a *creatable* combobox, so pick by exact anchored label) |
| Setup ▸ Job | `Setup ▸ Job` | `JobPage.ts` | unchanged; **+ `setDepartment`** only if OQ 2 says the Job form has one |
| Crew Time In / Out, Transfer, View ▸ Job Cards | as E3 | existing + E3's `scopeToRange` / `readDay` | shared with E3 |

`DepartmentPage`: `listUrl '/setup/departments'`, `gridName` / `entity` / `menuPath` calibrated (OQ 3), `rejectionMessage /already (exists|in use)|Failed to (create|update)/i`.
- `openByName` follows `OvertimeRulePage.openByName` (filter-settled `?name=` link, then F5). About 400 "NotifTest" departments exist, so always filter first.
- `gotoSection('Job Card')` and the sub-section "Overtime & Rounding".
- `readWeeklyOvertimeMethod()` and `setWeeklyOvertimeMethod(label)` (no-op when equal; fresh-load read-back).
- `createDepartment({ name, weeklyOvertimeMethod })`. Required New-form fields are calibrated; "Pay Overtime Pieces as Hours by Weekly Average *" = No.
- `ensureDepartmentOnScreen(spec)` in `ensureOnScreen.ts`, keyed by name like `ensureOvertimeRuleOnScreen`, with no restore. A binned name fails by name.

## Data

- **Fixture** block `"e1"`:
  - `department { name "E1 DEPARTMENT", weeklyOvertimeMethod "<OQ 1>" }`
  - `crew { "8020", "E1 CREW" }`, `picker { "8021", "E1 PICKER ONE" }`
  - `jobs { high { "4618", "E1 JOB HIGH", Time, 35 }, low { "4619", "E1 JOB LOW", Time, 20 } }`
  - **Probe the codes free** (live and recycle bin).
- **Scenario** (`JourneyE1RegularRateCaseSchema`):

```jsonc
{
  "workflow": "E1", "label": "e01-weekly-regular-rate-averaging",
  "mondayWindow": { "earliest": -12, "latest": -6 },
  "rule": { "name": "AG CA 2022", "overtimeDailyHours": 8, "doubleTimeDailyHours": 12 },
  "method": "entireRate",
  "transfers": [
    { "days": [
      { "weekday": 0, "job": "high", "timeIn": { "hour": 6, "minute": 0 }, "timeOut": { "hour": 11, "minute": 0 } },
      { "weekday": 1, "job": "low",  "timeIn": { "hour": 6, "minute": 0 }, "timeOut": { "hour": 16, "minute": 0 } } ],
      "toast": { "jobCards": 2, "timeCards": 4 },
      "expected": { "weeklyRate": 25, "rows": { "0": 175, "1": 235 }, "totals": { "regular": 13, "overtime": 2, "double": 0, "amount": 410 }, "contrastAmount": 395 } },
    { "days": [
      { "weekday": 2, "job": "high", "timeIn": { "hour": 6, "minute": 0 }, "timeOut": { "hour": 11, "minute": 0 } } ],
      "toast": { "jobCards": 1, "timeCards": 2 },
      "expected": { "weeklyRate": 27.5, "rows": { "0": 175, "1": 242.5, "2": 175 }, "totals": { "regular": 18, "overtime": 2, "double": 0, "amount": 592.5 }, "staleAmount": 585 } }
  ],
  "gates": { "employerPayOvertimeBasedOnWeeklyAvg": "None" },
  "cleanup": []
}
```

  `superRefine` checks:
  - `method ∈ {entireRate, premiumOnly}`. Every expected amount and rate is re-derived from rates × punches per method and must equal the data.
  - `contrastAmount` and `staleAmount` must differ from `totals.amount`, so the test is not vacuous.
  - Window rules as E3: one Monday, days ≤ −1, none in −13…−21.

## Preconditions

- [ ] `prepareJourneyE1`:
  - `ensureDepartmentOnScreen` and set the method on screen (save-landed poll on `GET departments/{id}`).
  - Ranch/field (B1, read-only) → E1 CREW → E1 PICKER ONE.
  - `setDepartment` on crew and picker on screen.
  - Jobs: rule + rate on screen.
  - Gates: crew automation/lunch all 0, picker has no rate, field rule null or AG CA 2022, employer `payOvertimeBasedOnWeeklyAvg` None.
  - `departmentCounter` evidence for employee, crew, jobs, field and ranch.
  - Per-day before-phase sweeps on Mon–Wed: job cards first, then time cards.
- [ ] The department's `firstDayofWeek` is recorded. Mon–Wed is the same week for Sunday- or Monday-start.

## API allowances

| Step / call | Endpoint | Allowance | Why | Proof on screen |
|---|---|---|---|---|
| department lookup / save-landed poll | `GET departments`, `GET departments/{id}` | plumbing read | find by name; wait for the on-screen save | Department form read-back after a fresh load |
| fixture rows missing | `POST <entity>/{id}/restore` | arrange | inside `ensureOnScreen` only | — |
| fixture + department gates | `GET crews/{id}`, `GET employees/{id}`, `GET jobs/{id}`, `GET fields/{id}`, `GET ranches/{id}` | plumbing read | fail by name; which department each record carries | Crew/Employee form read-back |
| preference gate | `GET preferences` | plumbing read (`environment-gate`) | employer averaging must be None; window; landing | — |
| ids | `GET time-cards` / `GET job-cards` per day, execute job GET | plumbing read | cleanup ids, recorded **across all three days after each transfer** (a re-price may replace Tuesday's card id) | toasts + View rows |
| regular rate on card | `GET job-cards/{id}` → `calculationDesc` | plumbing read (`api-only-evidence`) | no screen shows the rate | none — annotated |
| teardown | `DELETE job-cards/{id}`, `DELETE time-cards/{id}`, per-day crew sweep | cleanup | by id / crew + day | — |

No preference write. The department is E1's own reference row, configured on screen. It is not restored because it belongs to E1 and is protected by `/^E\d{1,2} /`.

## Cleanup

Job cards by id (re-read across Mon–Wed after each transfer) → time cards by id → per-day crew sweep on Mon–Wed. E1 DEPARTMENT, crew, picker and jobs stay as E1-owned fixtures and keep their configuration.

## Test case

Runner row `journey-e.csv:2`: `jira` → `PET-12491`, `status` → `automated`, `enabled` → `1` (**flip last, only when green**).

```ts
test.describe('E1 · Weekly regular-rate averaging', { tag: ['@JourneyE', '@E1'] }, () => {
    test('[Payroll] Overtime is priced at the weekly average regular rate and re-priced when a later day moves the average.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E1' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

`test.setTimeout(900_000)`.

## Open questions for the tester

**Blocking: answer before generation.**

- [ ] **1. Weekly Overtime Method options.** What are the labels, and which one pays OT at 1.5 × the weekly average (vs straight time + 0.5 × average)? This needs a read-only probe: open the combobox on any department form, list the options, Cancel. `method` and the amount table follow from the answer.
- [ ] **2. Which department does the engine read for the override:** employee, crew, job, or field/ranch? E1 assigns employee + crew (+ jobs if the Job form has a Department field). If it is the field's, E1 needs its own ranch and field. A1 = 395 on the first run means "not the department we set".
- [ ] **3. Department screen:** menu path, grid name, and New-form required fields.
- [ ] **4. Does a single-day transfer re-price the week's earlier cards,** or is it **View ▸ Job Cards ▸ Recalculate** (D6 pattern)? If the latter, step 3 becomes "Recalculate Mon–Tue on screen" and the toast for transfer 2 is unchanged.

## Test Scenarios

### 1. E1 · Weekly regular-rate averaging (one happy-path test, testCaseId E1, @JourneyE @E1 @Regression)

**Seed:** `tests/seed.spec.ts`

#### 1.1. [Payroll] Overtime is priced at the weekly average regular rate and re-priced when a later day moves the average.

**File:** `tests/web/journey-e-payroll/e01-weekly-regular-rate-averaging.spec.ts`

**Steps:**
  1. **Arrange** (`prepareJourneyE1`).
    - expect: Department form method = the scenario label; Crew/Employee forms show E1 DEPARTMENT; Job forms show the rule and rates 35 / 20
  2. **Seed Mon–Wed on screen** (`seedDays`).
    - expect: 6 own time cards
  3. **Transfer** (Mon–Wed range + crew): roster guard, Ready, then `commitTransfer` with toast {3,6}; re-record job-card ids for Mon–Wed.
  4. **Read:** View ▸ Job Cards Mon–Wed → Apply → crew chip → rows by `readDay` → Totals.
    - expect: Mon 175, Tue 242.50, Wed 175, Totals OT 2 and Amount 592.50; on 570 the failure is named
  5. Record `calculationDesc` per own card (`api-only-evidence`). **Teardown** in `finally`.

## Checkpoint answers (orchestrator, read-only probe on dev 2026-10-26)

- **OQ 1:** Weekly Overtime Method options are exactly `None`, `Entire Rate` and `Premium Only`. The scenario uses `method: "entireRate"` with label **"Entire Rate"**.
- **OQ 2:** the Job form has **no Department field**, so E1 sets the department on the **employee and the crew** only. A first run that reads A1 = 395 means the engine reads another record's department, and the failure says so.
- **OQ 3:** Setup ▸ Department, route `/setup/departments`, grid **"Departments"** (Name, Export Identifier, Active). The New form's required fields have defaults (First Day of Payroll Week = Monday, Payroll / Setup / Cost Accounting Export Format = `<None>`, Export Crew Source = Work Crew), so only **Name** needs typing. The menu path is calibrated on the first run, like Over-Time-Rule's File ▸ Administration ▸ Setup.
- **OQ 4:** measured on the first run. If transfer 2 leaves Tuesday's amount stale, the failure names it. The tester then decides between a product bug and a step change to Recalculate (D6 pattern).
- **Fixture codes** probed free: E1 CREW **8024**, E1 PICKER ONE **8025**, E1 JOB HIGH **4618**, E1 JOB LOW **4619**. 8020/8021 are D5's.

## Dev results (2026-10-26, su, `UI_FIRST_GUARD=enforce`), reproduced twice

- **Catalog steps 1–2 pass on screen.** With E1 DEPARTMENT's Weekly Overtime Method = Entire Rate set on the department form (the employer stays None), transfer 1 reads Tuesday 235.00 and Totals 410.00: the overtime is priced at the 25.00 weekly average, not the job's 20.00.
- **Catalog step 3 fails by name.** After transferring Wednesday only, Tuesday still reads **235.00** and Totals **585.00**. The test expects 242.50 / 592.50 (average 27.50). This is Hilario's 2026-09-15 WEBPET-2060 failure ("Transfer should recalculate the week's job cards when transferring only one day", passed 09-23) and the gap Rahul logged as WEBPET-3158 ("only the selected cards are written back").
- View ▸ Job Cards' date popup opens on a range: a click before its start moves the start, a click after it moves the end. `pickRangeInPopup` now presses **Today** first, then from, then to.
- Department menu path: File ▸ Administration ▸ Setup ▸ Department.
- Revision 1's runner row was parked `automated, enabled 0` on this result.

## Scope decision (2026-10-26, Gukan)

WEBPET-2057 is Done (Passed QA 2026-10-01) and PET-12491 is to be closed on the automation of that verified claim: the weekly average regular rate drives the overtime premium. Revision 2 therefore transfers Monday–Wednesday in one commit and proves Tuesday 242.50 / Totals 592.50 at the 27.50 average on View ▸ Job Cards.

The re-price of an already-written day by a later one-day transfer (catalog step 3) is a product gap on dev: WEBPET-3158 (the saved-week sibling re-price) is still In Review, and with the method set on the department only it did not fire. It is tracked as a bug draft in the hand-off (Relates WEBPET-3158 / WEBPET-2060) and as manual case **E1-02**. When it works, add the second transfer back to the scenario JSON (the schema keeps the `staleAmount` rules for it).
