# `E13` · Department and multi-state overtime split

## Application Overview

**Revision 1, 2026-10-26. Planned at code level** from the orchestrator's read-only dev probe of Setup ▸ **Over-Time-Rule** (`/setup/overtime-rules`, form fields Name / Over-Time Daily Hours / Double-Time Daily Hours / Wage Order / Ag Type) and Job Card Preferences ▸ Overtime ("Group Overtime by Wage Order" = Yes). E2 is the single-rule sibling.

> **Two overtime rules, two wage orders, one 10-hour day, no overtime.** Multi-state operators run one overtime rule per state (or per department). In web PET the lever the engine exposes is the overtime rule's **Wage Order**, with **Group Overtime by Wage Order = Yes**. E13 configures two rules (`E13 RULE A` / wage order `E13A`, `E13 RULE B` / `E13B`, each OT after 8 and DT after 12) on screen, puts them on two jobs on screen, and seeds a crew day on screen: 6 h on Job A, then 4 h on Job B. Pooled, 10 h would be **8 regular + 2 overtime**. Grouped by wage order, each bucket stays under 8, so the day must read **6 + 4 regular, 0 overtime, 0 double**.
>
> **Binding safety constraints:** Transfer by Reference after the Work Crew filter (as E8). **No preference is written**: Group Overtime by Wage Order is a gate read on screen. E2 JOB is never touched.

| Artifact | Path |
|---|---|
| Catalog entry | `workflow-catalog.json` → `E13` (line 1582) |
| Jira | `WEBPET-2068` · automation ticket `PET-12676` |
| Recording | — none |
| This plan | `test-plans/journey-e/e13-department-and-multi-state-overtime-split.md` |
| Spec | `tests/web/journey-e-payroll/e13-department-and-multi-state-overtime-split.spec.ts` |
| Scenario | `src/data/journey-e/e13-department-and-multi-state-overtime-split.json` |
| Schema | `journeyEScenario.ts` → new `JourneyE13WageOrderSplitCaseSchema` |
| Runner row | `journey-e.csv` → `E13` (line 14; modules `Department`) |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `E13` |
| Journey | `E` — Weekly payroll close and export |
| Segments | `all` |
| Modules | `Department` |
| Surface | `calc` — runner category `workflow` |
| Demo candidate | no |
| Catalog status | draft |

**Summary**
> Apply different overtime rules and group results by department, which is how multi-state operators run per-state rules. Anthony uses departments even within a single state.

## Catalog steps

| # | Catalog step | Office surface | Automatable? |
|---|---|---|---|
| 1 | Assign jobs and crews to departments. | Configuration that selects the rule. Measured lever: **Setup ▸ Over-Time-Rule** (rule with **Wage Order**) → **Setup ▸ Job** Overtime Rule. File ▸ Administration ▸ Job Card Preferences ▸ Overtime ▸ **Group Overtime by Wage Order** = Yes (read). | **yes, on screen, as wage orders**: rules created on screen when missing, and the Job form's rule set and read back every run. The *Department* entity's own role is Open question 1 |
| 2 | Apply each department's overtime rule during calculation. | **Transfer to Job Cards** preview (Job Cards tab) and commit; **View ▸ Job Cards** rows per job + Totals | **yes, on screen**, and this is the whole workflow |
| 3 | Group and report results by department. | Department column on View ▸ Job Cards; a by-department report | **partially**: the Department cell is recorded. *Report output: deferred (no report-output automation, Reports epic WEBPET-1839)* |

## Expected outcomes

- Setup ▸ Over-Time-Rule shall list `E13 RULE A` and `E13 RULE B`. Each Edit form shall read Over-Time Daily Hours **8**, Double-Time Daily Hours **12**, Wage Order **E13A** / **E13B**, and Ag Type **off**. A missing rule is created on this screen, and a drifted one is repaired on screen.
- Setup ▸ Job: `E13 JOB A` shall show Overtime Rule `E13 RULE A` and Hourly Rate 20; `E13 JOB B` shall show `E13 RULE B` and 20 (after a fresh load).
- Job Card Preferences ▸ Overtime shall read **Group Overtime by Wage Order = Yes** (environment gate: otherwise fail by name; never written).
- E2 CREW / E2 PICKER ONE on day −21: crew time-in 06:00 on Job A, crew time-in 12:00 on Job B, crew time-out 16:00. The Transfer screen shall offer exactly the 3 own References, all **Ready**.
- The Job Cards **preview** shall show 2 rows: Job A **Gross 6 · Regular 6 · Overtime 0 · Double 0 · Amount 120**, and Job B **4 · 4 · 0 · 0 · 80**.
- Transfer shall show "Transfer complete — 2 job cards written, 3 time cards transferred." and land with this run's id. Landing rows per job (`rowsForCrewAndJob`) shall read the same as the preview. The **Totals** bar shall read **Gross 10.0000 · Regular 10.0000 · Overtime 0.0000 · Double 0.0000 · Amount 200.00**.
- Pooled contrast: a single bucket would read Regular 8 / Overtime 2 / Amount 220. Any non-zero Overtime fails by name: "wage orders E13A/E13B pooled into one daily bucket despite Group Overtime by Wage Order = Yes".
- The **Department** cell of each row is recorded as `department-evidence`.
- **Wage order on the card**: if the Edit Job Card form shows a calculation description naming the wage order, assert it contains `E13A` / `E13B`. Otherwise record `calculationDesc` from `GET job-cards/{id}` as `api-only-evidence` (not asserted; format unmeasured).
- **Group and report by department.** *— deferred: report output is not automated (WEBPET-1839 strategy); department grouping of OT (as distinct from wage order) is Open question 1.*
- **OT-005 weekly-average overtime** (`payOvertimeBasedOnWeeklyAvg`). *— out of scope: None on dev for the employer and every department. Read as a gate (must be None; otherwise fail by name, because weekly averaging would change the daily expectation) and annotated.*
- **Multi-day / weekly interaction between wage orders.** *— deferred to E3 (weekly overtime).*

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| **Setup ▸ Over-Time-Rule** | `Setup ▸ Over-Time-Rule` (`/setup/overtime-rules`) | **new** `src/pages/setup/OvertimeRulePage.ts` extends `SetupScreenPage` | to write |
| Setup ▸ Job | `Setup ▸ Job` | `JobPage.ts` | unchanged (`setOvertimeRule`, `readOvertimeRule`, `setHourlyRate`) |
| Job Card Preferences (read only) | `File ▸ Administration ▸ Job Card Preferences` | `JobCardPreferencesPage` (E6's) | shared with E6; E13 calls only `openFromMenu`, `gotoSection('Overtime')`, `readCombobox` |
| Crew Time In / Out, Transfer, View ▸ Job Cards | as E6 | existing | unchanged |
| Input ▸ Job Card (Edit, read only) | `Input ▸ Job Card` | `JobCardsPage.ts` | **+ `calculationDescription()`** read-only (locator calibrated on the first run; returns null when absent) |

**`OvertimeRulePage`** config: `listUrl '/setup/overtime-rules'`, `gridName 'Over-Time Rules'`, `entity 'Over-Time Rule'` (row links "Edit Over-Time Rule: <name>"), `menuPath ['Setup','Over-Time-Rule']`, `rejectionMessage /already (exists|in use)|Failed to (create|update)/i`.
- Fields: `getByRole('textbox', { name: 'Name *' })`, `getByRole('spinbutton', { name: 'Over-Time Daily Hours' })`, `getByRole('spinbutton', { name: 'Double-Time Daily Hours' })`, `getByRole('textbox', { name: 'Wage Order' })`, `getByRole('switch', { name: 'Ag Type' })`.
- Members: `createRule(spec): FormOutcome` · `readRule(): { overtimeDailyHours, doubleTimeDailyHours, wageOrder, agType }` · `setRule(spec)` (dirty fields only, then `saveEdit`, then a fresh-load read-back) · `savedIdFromUrl`.

## Data

- **Fixture** `fixture.json` block `"e13"`:
  - `rules`: `ruleA { name "E13 RULE A", overtimeDailyHours 8, doubleTimeDailyHours 12, wageOrder "E13A", agType false }` and `ruleB { …"E13B" }`;
  - `jobs`: `jobA { code "4614", name "E13 JOB A", paymentType Time, hourlyRate 20, rule "ruleA" }` and `jobB { "4615", "E13 JOB B", …, "ruleB" }`. **Codes must be probed free (live + recycle bin) before commit.** The prefix is protected.
- Rules have no code, so `ensureOvertimeRuleOnScreen` (new, in `ensureOnScreen.ts`, same shape as `ensureCrewTableOnScreen`) keys by **name**:
  - `GET overtime-rules` → find by name → else `OvertimeRulePage.createRule` on screen → else (rejected and no live row) fail by name naming a binned rule (WEBPET-2368-style).
  - When it exists: open its Edit form on screen and `setRule` (repair on screen).
- E2 CREW / E2 PICKER ONE / B1 RANCH / B1 FIELD via `prepareJourneyEOwnJobs`. **Rule-chain gates** (fail by name): `GET fields/{id}.overTimeRulesCounter === null` (two different job rules make any field rule a precedence conflict; E2 probed null on 2026-10-05), and `GET employees/{id}` has no non-null key matching `/overtime|wage/i`. `departmentCounter` of the crew, job and field is recorded.
- **Day −21** (= `maximumDaysForTransferExport`, the edge of the window; the gate `>= 21` holds today).
- **Scenario JSON** (`JourneyE13WageOrderSplitCaseSchema`):

```jsonc
{
  "workflow": "E13", "label": "e13-department-and-multi-state-overtime-split", "dayOffset": -21,
  "hourlyRate": 20, "overtimeMultiplier": 1.5, "doubleTimeMultiplier": 2,
  "segments": [ { "job": "jobA", "start": { "hour": 6, "minute": 0 } }, { "job": "jobB", "start": { "hour": 12, "minute": 0 } } ],
  "timeOut": { "hour": 16, "minute": 0 },
  "gates": { "groupOvertimeByWageOrder": "Yes", "payOvertimeBasedOnWeeklyAvg": "None" },
  "preferenceLabels": { "section": "Overtime", "groupByWageOrder": "Group Overtime by Wage Order" },
  "expected": {
    "timeCards": 3, "jobCards": 2, "status": "Ready",
    "perJob": {
      "jobA": { "hours": 6, "regular": 6, "overtime": 0, "double": 0, "amount": 120 },
      "jobB": { "hours": 4, "regular": 4, "overtime": 0, "double": 0, "amount": 80 }
    },
    "totals": { "gross": 10, "regular": 10, "overtime": 0, "double": 0, "amount": 200 },
    "pooledContrast": { "regular": 8, "overtime": 2, "double": 0, "amount": 220 },
    "transferToast": { "jobCards": 2, "timeCards": 3 }
  },
  "cleanup": [ { "kind": "timeCards", "employeeCodes": ["8017"], "dayOffset": -21, "cardTypes": [0, 1] } ]
}
```

  `superRefine` rules:
  - `dayOffset === -21`; per-job hours = segment spans; distinct non-empty wage orders on the two fixture rules (checked in the flow, since the fixture is separate).
  - Each per-job `hours <= rule.overtimeDailyHours` (the split must avoid OT), while `Σ hours > overtimeDailyHours` (pooling must create OT, otherwise the test is vacuous).
  - `pooledContrast` derived as E2's buckets on Σ hours; amounts = hours × rate; totals = Σ perJob.
  - `timeCards === segments.length + 1`; `jobCards === segments.length`; a −21 `timeCards` step is present.

## Preconditions

- [ ] `prepareJourneyEOwnJobs` with E13's jobs, then E13 rules ensured **before** the jobs' rule is set (the Job form's combobox must offer them).
- [ ] Gates (read): `maximumDaysForTransferExport >= 21`, `viewJobCardsAfterTransfer === true`, `payOvertimeBasedOnWeeklyAvg` None (API value annotated), and on screen Group Overtime by Wage Order = Yes (+ API key annotated as `environment-gate`).
- [ ] Before-phase sweep of crew job cards, then time cards, on −21.

## API allowances

| Step / call | Endpoint | Allowance | Why | Proof on screen |
|---|---|---|---|---|
| rule lookup / repair check | `GET overtime-rules`, `GET overtime-rules/{id}` | plumbing read | find by name; detect drift | Over-Time-Rule Edit form read-back (step 1) |
| fixture rows missing | `POST <entity>/{id}/restore` | arrange | inside `ensureOnScreen` only | — |
| rule-chain + department gates | `GET fields/{id}`, `GET employees/{id}`, `GET crews/{id}`, `GET jobs/{id}` | plumbing read | fail by name on a precedence conflict; department evidence | Job form read-back |
| preference gates | `GET preferences` | plumbing read (`environment-gate`) | groupOvertimeByWageOrder, payOvertimeBasedOnWeeklyAvg, window | Job Card Preferences screen read (step 2) |
| ids for cleanup | `GET time-cards`, `GET job-cards`, execute job | plumbing read | as E8 | toast + landing rows |
| wage order on card (only if no screen shows it) | `GET job-cards/{id}` → `calculationDesc` | plumbing read (`api-only-evidence`) | recorded, not asserted | none — annotated |
| teardown | `DELETE job-cards/{id}`, `DELETE time-cards/{id}`, sweep | cleanup | by id | — |

No preference write. No rule or job write by API (both are on screen).

## Cleanup

Job cards by id → time cards by id → crew-day sweep on −21 (E2's order, `currentScope`-registered). Rules and jobs are E13-owned fixture rows, never deleted (protected prefix), and keep their configuration.

## Test case

Runner row `journey-e.csv:14`: `jira` → `PET-12676`, `status` → `automated`, `enabled` → `1` (flip last). Category `workflow`.

```ts
test.describe('E13 · Department and multi-state overtime split', { tag: ['@JourneyE', '@E13'] }, () => {
    test('[Payroll] Two jobs on two wage-order rules split a ten-hour day into 6 + 4 regular hours with no overtime.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E13' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

`test.setTimeout(600_000)`.

## Open questions for the tester

- [ ] **1. Do Departments select an overtime rule in web PET** (catalog step 1, "assign jobs and crews to departments")? The probe found no rule on the Department path; the rule is selected by Job (Field/Employee may override) and split by Wage Order. If a Department does carry a rule, E13 needs a department step and possibly its own department (dev already has ~400 "NotifTest" residue departments, not ours).
- [ ] **2. Ag Type off**: does an Ag rule behave differently at 8/12 daily? Off keeps the rule purely threshold-based. Confirm this is representative.
- [ ] **3. Where does the wage order show on a job card?** If the Edit Job Card form shows a calculation description, assert it; otherwise it stays `api-only-evidence`.
- [ ] **4. Module gate.** The CSV row says `modules=Department`. **Run the gate-skip check on the first run**: if E13 skips because Department is not granted on dev, it looks green and is not. Report it; do not edit the modules column without a human decision.

## Dev results (2026-10-26, su, `UI_FIRST_GUARD=enforce`)

- **Green.** E13 RULE A / B (OT 8, DT 12, Wage Order E13A / E13B) created on screen; the 06:00–12:00 / 12:00–16:00 day transfers as 6 + 4 regular hours, Overtime 0, Double 0 (pooled it would read 8 + 2).
- Measured: the rule screen is File ▸ Administration ▸ **Setup** ▸ Over-Time-Rule, not the top-level Setup group. `LeftNavigationPage.expandGroup` now reads a unique group button's `aria-expanded` instead of the child's visibility, because the top-level "Setup" button made the nested one look open.
- Group Overtime by Wage Order = Yes (read on Job Card Preferences, never written); every pre-existing rule has an empty Wage Order; OT-005 is None for the employer and every department (annotated out of scope).
