# `E2` · California daily overtime

> **One worker, one job, one eleven-hour *net* day — and the day splits itself into three money buckets.**
> A crew time-in at 06:00 and a crew time-out at 17:30 are two time cards and one job card. The engine
> deducts an automatic half-hour meal, so 11.50 gross becomes 11.00 net — and what the workflow exists to
> prove is what the engine writes *into* that card from those eleven net hours: the first eight at the
> regular rate, hours eight to ten at one-and-a-half times it, and the eleventh at double — carried in
> three separate columns, so the two overtime kinds are never confused with each other or with regular
> time. E2 reads the split on the Transfer screen's Job Cards tab **before anything commits**, commits it,
> and then proves on screen and over a read-only GET that the three buckets add up to the net day and that
> the money adds up with them.
>
> **This is the first Journey E automation.** It scaffolds `tests/web/journey-e-payroll/`,
> `src/data/journey-e/`, `src/data/schemas/journeyE*.ts` and `src/utils/journeys/journeyEFlow.ts`,
> mirroring Journey D's structure exactly rather than inventing a second one.
>
> **Binding safety constraints** (carried unchanged from D9 and D10):
> * The transfer is driven on screen and ticked **by Reference**. The header **"Select all rows" is
>   select-all-across-the-filter**, not the visible rows; nothing here ever touches it.
> * The grid is scoped to `E2 CREW` with the **Work Crew** filter before any row is ticked — never by
>   Employee (WEBPET-3397). A bare date scope is not safe: day −14 slides, and dev carries foreign
>   *untransferred* rows on most days inside the 21-day window.
> * The per-row **"Delete Time Card …"**, the per-row **"Delete Job Card …"**, the Job Card form's
>   **Delete** and `POST /job-cards/bulk-delete` are **forbidden** — a "delete all loaded" wiped ~9.5 k dev
>   job cards in Sept 2026 and there is no restore route. Cleanup deletes this run's own job cards by
>   explicit id, one at a time, each with its own rowversion.
> * The preview tab's **"Remove all (N)"** and **"Remove from transfer"** are never used — they silently
>   change what the commit would write.
> * **E2 writes no preference.** Unlike D10 it needs no `paidBreakJob`, so it leaves no shared tenant state
>   behind and has nothing to restore. Every setup write it makes is on screen, on its own rows.

**Revision 2**, 2026-10-06. Revision 1 was planned blind — the planning browser never came up
(`planner_setup_page` died twice on the MCP idle timeout) — and was then corrected by seven read-only
probes run as an ordinary spec on 2026-10-05. Those probe answers are folded into the body here as settled
fact: the automatic meal, the `considerEmployeeRate` default, the overtime-rule catalogue, the free codes,
and the preference values. Four defects found in a code-verification pass of revision 1 are fixed here (the
self-contradictory `superRefine`, the stale scenario JSON, and two newly identified first-run risks now
carried in §Open questions). **No live observation of E2's own screens has happened**, so every
environment-dependent fact below is still written as something the spec *asserts*, never as something it
assumes. Source: no recording; the split, the arithmetic and the file layout are derived from the catalog,
from D9's measured preview-grid map (live 2026-10-01) and from D10's transfer flow (live 2026-10-05).
Sibling plans: `test-plans/journey-d/d10-exercise-and-auto-break-split.md`,
`test-plans/journey-d/d09-group-piece-out-distribution.md`.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `E2` |
| Jira | `PET-12668` — [E2] California daily overtime |
| Recording | — none |
| This plan | `test-plans/journey-e/e02-california-daily-overtime.md` |
| Spec | `tests/web/journey-e-payroll/e02-california-daily-overtime.spec.ts` |
| Scenario | `src/data/journey-e/e02-california-daily-overtime.json` |
| Runner row | `src/data/runner/journey-e.csv` → `E2` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `E2` |
| Journey | `E` — Weekly payroll close and export |
| Segments | `all` |
| Modules | `Windows` |
| Surface | `calc` — spec in `tests/web/journey-e-payroll/`; runner category `workflow` |
| Demo candidate | no |
| Catalog status | ticketed (PET-12668) |

**Summary** (from the catalog)
> Apply California daily overtime: time-and-a-half after 8 hours and double time after 10 in a workday,
> computed on the regular rate. The two overtime types must be tagged distinctly for the export.

## Catalog steps

| # | Catalog step | Office surface | Automatable? |
|---|---|---|---|
| 1 | Compute the day's net hours. | **Input ▸ Transfer to Job Cards** → scope to the fixture day → **Analyze Transfer Candidates** → Work Crew = `E2 CREW` → **Job Cards tab**, the pre-commit preview. The tab's grid carries `Gross Time`, `Meal` and `Net Time` columns (D9's measured map, 2026-10-01). A 06:00→17:30 day must read **Gross 11.50 · Meal 0.50 · Net 11.00**: dev carries `employeeMealStart 4`, `employeeMealTime 0.5`, `employeeMinNetForMeal 5`, so an automatic meal *does* bite an eleven-hour crew day. The Meal assertion is not decoration — it is what stops a meal-policy change from silently absorbing time and leaving the bucket arithmetic looking right for the wrong reason. | **yes, on screen**, before the commit |
| 2 | Pay the first 8 at regular, hours 8 to 10 at 1.5x the regular rate, and beyond 10 at 2x. | Same preview row: `Regular Hours`, `Overtime`, `Double Time`, `Amount`. The thresholds come from the **Overtime Rule** the job carries (`#overtimeRulesCounter` on Setup ▸ Job — a required FK whose options are `GET /overtime-rules`, keyed `jobTypeCounter`). The regular rate is the job's **Hourly Rate**, which `considerEmployeeRate: false` keeps authoritative. | **yes, on screen**, and this is the whole workflow |
| 3 | Tag federal-daily overtime separately from state-weekly overtime for the export, since only federal-daily may be income-tax-exempt. | The distinct carriage E2 can see is the two separate columns and the two separate amounts. The *export* tagging is the job's earning codes (`RT,RP,OT,OP,DT,DP` — catalog **A4**) written into the payroll file (**E9**), and "state-weekly" does not exist until a weekly rule does (**E3**). Dev's `exportFlsaOvertimeSeparately` is `false`, which is itself a tenant-preference decision belonging to those workflows, not to E2. | **no — deferred: E3 owns weekly overtime, E9/E10 own the export file and its identifiers, A4 owns the earning codes.** E2 asserts that the daily premium is carried in two distinct, separately-valued buckets; it does not open an export. Same boundary D10 drew with E6 and D9 drew with D5 |
| — | *variations:* state-specific thresholds apply via Department. | Setup ▸ Ranch carries a Department (`#departmentCounter`); catalog **E13 — Department and multi-state overtime split** (module `Department`) is the workflow for it, and already has its own draft runner row. | **no — deferred: E13 owns it.** One happy path per workflow; E2 therefore needs **no `DepartmentPage` and no `ensureDepartmentOnScreen`** — the gap is closed by scoping, not by code |
| — | *variations:* the prior California rule (overtime only after 10) is superseded. | Dev still carries it as `AG CA 2021` (counter 6), beside the intended `AG CA 2022` (counter 32). | **no — not a case:** the catalog calls it superseded. It is named here only because picking it by accident is one of the three failure signatures in §Open questions |

## Expected outcomes

- When `E2 JOB` carries the California daily overtime rule `AG CA 2022` (daily overtime after **8** hours,
  double time after **10**), an **Hourly Rate of 20.00** and **Consider Employee Rate off**, and `E2 CREW`
  carries no exercise job and no break automation, and the fixture day holds exactly two time cards — a
  crew time-in at **06:00** on `E2 JOB` and a crew time-out at **17:30** — then the Transfer screen scoped
  to that day and that crew shall offer exactly **2** candidate rows.
- When the **Job Cards tab** is opened on that analysis, PET Tiger shall preview exactly **1** job card,
  whose Job cell reads `E2 JOB` and whose time columns read **Gross Time 11.50 · Meal 0.50 · Net Time
  11.00** — one automatic half-hour meal, deducted once. The preview totals bar shall read **`Job Cards
  1`**, **`Employees 1`**, **`Pieces 0`**. **None of this has committed anything.**
- That same previewed card shall split the **net** day as **Regular Hours 8.00 · Overtime 2.00 · Double
  Time 1.00** — the three buckets are the workflow. They shall sum to **11.00**, the day's *net* hours, not
  to the 11.50 gross: the unpaid meal never enters a bucket, and the rule reclassifies what remains rather
  than lengthening or shortening it.
- The previewed **Amount** shall be **260.00** = `8 × 20.00` + `2 × 30.00` + `1 × 40.00`, i.e. the premium
  computed **on the regular rate** at 1.5× for hours eight to ten and 2× beyond ten. Straight time on the
  same eleven net hours would be 220.00; the forty-dollar difference is the only thing that distinguishes
  "the rule was applied" from "the rule was not", which is why the amount is asserted and not merely
  recorded.
- The two overtime kinds shall be **carried separately and valued separately** — `Overtime` 2.00 and
  `Double Time` 1.00 in two different columns, neither folded into `Regular Hours` and neither folded into
  the other. That separation is as far as E2 takes catalog step 3.
- The non-committing `job-cards-preview` read shall place the card at **06:00–17:30** on the fixture day
  with `grossMinutes === 690`, `netMinutes === 660` and the difference equal to the scenario's
  `mealMinutes` (30), corroborating the on-screen time columns without depending on how the grid formats a
  date cell.
- When the two ticked rows are transferred, PET Tiger shall write exactly **1** job card for the crew on
  that day; `GET /job-cards?from=day&to=day` scoped to the crew shall return one record whose `jobCounter`
  is `E2 JOB`, with `exported` falsy and `locked` falsy.
- When `/input/job-cards` is loaded for the fixture day, the rows **whose Crew is `E2 CREW`** shall number
  exactly **1**, its Job cell shall read `E2 JOB` and its Amount cell shall read **260.00**. The count is
  **crew-scoped, not day-scoped**: the grid filters by date only and the day carries other tenants' cards
  (D9 learned this the hard way).
- The day's two time cards shall both read `transferred === true` after the commit — the calculation
  classifies the day, it does not rewrite the capture.
- **The 8-hour and 10-hour thresholds themselves.**
  _— **not automatable: no API or screen in the web product exposes them.** `GET /overtime-rules` returns
  only `{jobTypeCounter, name, active, version}`, and no preference carries a daily threshold; the numbers
  live in the legacy Windows rule editor (catalog A10). E2 therefore **selects the rule by name** —
  asserting `AG CA 2022` is present, active, and is what `GET /jobs/{id}` reports back as
  `overtimeRulesName` — and **proves the thresholds by consequence**, through the 8 / 2 / 1 split and the
  260.00 amount. The rule's counter is resolved from its name at run time and never hard-coded._
- The committed card's **Regular / Overtime / Double Time** values as the API returns them.
  _— **deferred: the `/input/job-cards` grid has no such columns** (measured map: Reference · Date · Type ·
  Employee · Job · Crew · Ranch · Amount · Exp · CA Exp · Status), and the API field names and units are
  unverified. They are recorded as a `job-card-fields` annotation; the pre-commit preview columns and the
  committed Amount carry the proof._
- The payroll export file, its earning codes and the federal-daily vs state-weekly distinction.
  _— **deferred: catalog E9 / E10 own the export file and identifiers, A4 owns the job's earning codes, E3
  owns weekly overtime** (catalog step 3)._
- Per-department and per-state thresholds.
  _— **deferred: catalog E13 owns the Department and multi-state split** (the catalog's `variations` line).
  No Department row is created, edited or even read by this spec._
- The meal-deduction policy itself — when a meal bites, how long it is, and whether a second one bites past
  ten hours.
  _— **deferred: a meal-rule workflow owns the policy.** E2 does not configure it and writes no meal
  preference. What E2 does is **assert the meal it expects**, by its exact minutes from
  `scenario.expected.mealMinutes`, so a policy change surfaces as a named red here instead of as a silent
  hour (see Open questions 5 and 6)._
- Decimal-hour rounding at close.
  _— **deferred: catalog E6 owns it.** E2's numbers are exact in two decimals (8.00 / 2.00 / 1.00 at 20.00 /
  30.00 / 40.00, on a 0.50 meal), so the two workflows cannot be mistaken for one another._
- The seventh-consecutive-day rule, the weekly 40-hour interaction, a day that crosses midnight, and a
  piece-rate worker's regular rate.
  _— **deferred: separate workflows** (E3 weekly, E1 regular-rate averaging, D4's night-shift variation).
  E2's sentence is one workday on one time-paid job._
- The Transfer grid's per-row "Delete Time Card", the preview tab's "Remove from transfer" / "Remove all",
  the Job Card form's "Delete", and `job-cards/bulk-delete`.
  _— **not automatable here: forbidden by the safety constraints above.** The page objects expose none of
  them._
- On-blur validation, Save-stays-disabled and the "Unsaved changes" bar on the Setup and Batch forms.
  _`(POM)` — relied on throughout `SetupScreenPage` / `CrewPunchPage` / `ensureOnScreen`; exercised by every
  fixture row, by both Job-form saves and by every punch, not asserted separately._

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Setup ▸ Crew / Employee / Ranch / Field | `/setup/…/new`, `/{id}` | `CrewPage.ts`, `EmployeePage.ts`, `RanchPage.ts`, `FieldPage.ts` | **exists, unchanged** — driven through `src/utils/fixtureRows/ensureOnScreen.ts` |
| Setup ▸ **Job** | `/setup/jobs/{new,:id}` | `src/pages/setup/JobPage.ts` | **extended** — `readOvertimeRule`, `setOvertimeRule`, `setHourlyRate` (below) |
| Input ▸ Batch ▸ Crew Time In / Crew Time Out | `/input/crew-time-in\|crew-time-out/new` | `CrewTimeInPage.ts`, `CrewTimeOutPage.ts` | **exists, unchanged** — `punchIn` already takes `job` (labelled **Phase**) and `employees`; `punchOut` deliberately sets no Phase |
| Transfer to Job Cards — Time Cards tab | `/transfer-to-job-cards` | `src/pages/processing/TransferToJobCardsPage.ts` | **exists** — `scopeToDay`, `analyzeCandidates`, `filterByCrew`, `candidateReferences`, `selectCandidate`, `runTransfer`, `selectAllRowsCheckbox` reused as-is |
| Transfer to Job Cards — **Job Cards tab** | same screen, `ttjc-tab-jobcards` | same page object | **extended** — `previewOvertimeBuckets()` (new sibling) over a newly extracted `previewColumnIndexes()`; `previewTotals()` reused |
| View ▸ Job Card (list) | `View ▸ Job Card` / `/input/job-cards` | `src/pages/processing/JobCardsPage.ts` | **exists, unchanged** — `applyDateRange`, `rowsForCrew`, `jobsForCrew`, `amountsForCrew` |
| Job Card edit form | `/input/job-cards/{id}` | — | **not used.** Every number E2 asserts is in the preview columns or the list's Amount column |
| Setup ▸ Department, Setup ▸ Overtime Rules | — | — | **not touched.** Department is E13's; there is no overtime-rule editor in the web product (catalog A10 is the Windows tool), so E2 *selects* an existing rule and never creates one |

### Setup ▸ Job — the three new methods

Each is a **read-first, change-only-on-a-real-difference** helper. Re-picking or re-typing a value the form
already holds leaves the form clean, Save never enables, and the helper dies with the misleading *"Save
stayed disabled … the form is rejecting a value"* — that is exactly how D10's planning probe died. Two
correctness details matter more than the pattern:

| Method | Control | Notes |
|---|---|---|
| `readOvertimeRule(): Promise<string>` | `#overtimeRulesCounter` | **Wait out the hydration first:** `await expect(this.overtimeRulesCombobox).not.toHaveAttribute('placeholder', /^Loading/)` — a combobox that fetches its own options reads `''` with placeholder `Loading...` for a few seconds, which makes an already-correct record look unset (the rule `CrewPage` now follows). Then read with **`.inputValue()`**. This control is the **Combobox** shape, an `INPUT[type=text]` — `PickerComponent.pickCombobox` ends with `expect(combobox).toHaveValue(labelPattern(label))`, which only works on an input. (The "read the visible label, never a hidden textbox" rule applies to the **Select** shape, `BUTTON[data-slot=select-trigger]`, and is wrong for this field.) |
| `setOvertimeRule(name: string)` | same | **The no-op check is `PickerComponent.labelPattern(name).test(current)`, not `current === name`.** `labelPattern` is `(^|: )<name>$` because the pickers label an option either as the bare name or as `"<exportIdentifier> : <name>"`. An exact `===` reports "different" on a record that already carries the rule, re-picks it, leaves the form clean, Save never enables, and the helper dies on the misleading "Save stayed disabled". On a real change: `pickCombobox` → Save → wait for the Unsaved-changes bar to clear → reload the edit URL → read back with `readOvertimeRule()` |
| `setHourlyRate(rate: number): Promise<string>` | `#hourlyRate` | **Mirror `JobPage.setPieceRate` verbatim**: `inputValue()` → `if (Number(current) === rate) return current` → `fill` → `blur` (validation runs on blur and Save stays disabled until it has) → `expect(saveButton).toBeEnabled({timeout: 15_000})` with the same message shape → `saveButton.click()` → `expect(unsavedChangesBar).toBeHidden({timeout: 15_000})` → `page.goto(editUrl)` → wait visible → `expect(input).not.toHaveValue('')` → `return this.hourlyRateInput.inputValue()`. **`setPieceRate` does not call `saveEdit()`** — it drives Save itself, and this method must do the same. The read-back from a fresh load is what makes it a UI verification |

**Ordering matters.** Both setters need a hydrated edit form and both leave the form after saving, so the
flow does `gotoEditById(jobId, name)` → `setOvertimeRule(...)` → `gotoEditById(jobId, name)` again →
`setHourlyRate(20)`. The second `gotoEditById` is not redundant: `setOvertimeRule`'s read-back reload is its
own, and relying on it to leave the page in a state `setHourlyRate` can use couples two helpers that should
not know about each other.

**Apply both unconditionally, on every run, cold or warm.** `ensureJobOnScreen`'s `needsRepair` checks only
`active`, and its repair branch is skipped entirely when the row was just created — so neither the rule nor
the rate is ever applied by `ensureOnScreen`, on a cold fixture or a warm one. `JobPage.pickFirstOvertimeRule()`
only gets `createJob` past the required FK with *whatever rule happens to be first*; it is not the rule E2
needs. The flow therefore always drives both setters, and both are no-ops in the warm case by their own
read-first checks.

`pickFirstOvertimeRule()` stays as it is. Do not change `fillForm`.

**Consider Employee Rate** is set to **off** on `E2 JOB` through the same form. It defaults to **`true`**
(confirmed on `D10 JOB`, 2026-10-05), and a true value lets an employee's own rate displace the job's 20.00
and void every money assertion below. The control's type is not yet known (Open question 4), so the
Generator reads `considerEmployeeRate` back over `GET /jobs/{id}` and the flow **fails loudly if it is still
true after the save** — plus the employee's own rate fields are read and failed loudly if positive, so the
guard holds even if the toggle silently does nothing.

### Transfer screen — Job Cards tab (pre-commit preview)

Rows are labelled only `Row 1`, `Row 2`, … Column map measured live 2026-10-01 (D9):

`0 remove-from-transfer · 1 Employee · 2 Job · 3 Crew · 4 Date Time In · 5 Date Time Out ·
6 Gross Time · 7 Meal · 8 Net Time · 9 Regular Hours · 10 Overtime · 11 Double Time ·
12 Number of Pieces · 13 Amount`

**Extract the column resolver, then add a sibling `previewOvertimeBuckets()`; do not extend
`previewSegments()`.** Today `previewSegments` declares `column()` as a closure inside its own body, so the
resolver cannot be reused as written. Revision 2's instruction is precise:

1. Lift it to `private previewColumnIndexes(headers: string[], names: string[]): Record<string, number>`
   (or `(names: string[])` reading the headers itself) with the **identical** regex ``new RegExp(`^${name}\\b`)``
   and the **identical** error string ``Job Cards preview has no '${name}' column; headers are ${JSON.stringify(headers)}``.
2. Have `previewSegments()` call it for its existing six names. Behaviour is byte-identical for D10 — same
   match, same message, **no new throw path on a green method**.
3. `previewOvertimeBuckets()` calls it for `Gross Time`, `Meal`, `Net Time`, `Regular Hours`, `Overtime`,
   `Double Time`, `Amount` and returns numbers per row (`NaN` while a cell is still empty, so a poll keeps
   waiting). Hard-coding D9's indices is forbidden: a silent column shift would read `Meal` as `Regular
   Hours` and turn into a wrong green.

**Add a format guard — this is new and load-bearing.** D10 never parsed Gross / Meal / Net *numerically*;
it compared their text. So their format is unverified, and `previewSegments`'s `replace(/[^0-9.-]/g, '')`
turns `"11:30"` into `1130`, which is a silent 100× wrong number, not an error.
`previewOvertimeBuckets()` must therefore **throw a named error** when a cell it is about to parse matches
`/^\d+:\d{2}$/` — something like `Job Cards preview renders '<col>' as HH:MM ("11:30"), not a decimal; the
E2 plan assumes decimal hours`. The **Meal** cell's unit is doubly unverified (0.50 hours vs 30 minutes vs
`0:30`), so the expected value is driven from `scenario.expected`, never from a literal in the page object
or the spec, and a unit mismatch names itself on the first run instead of being healed into.

Totals bar: `getByTestId('jobcards-totals-bar')`, parsed by the existing `previewTotals()`.

### `/input/job-cards` column map (D9/D10, still current)

`0 select · 1 Delete (forbidden) · 2 Reference · 3 Date · 4 Type · 5 Employee · 6 **Job** · 7 Crew ·
8 Ranch · 9 **Amount** · 10 Exp · 11 CA Exp · 12 Status · 13 Edit link` — **no Regular / Overtime / Double
Time columns exist here**, which is why the bucket proof lives in the pre-commit preview.

### Employee cell text — a trap (unchanged from D9/D10)

The Employee cell renders from `exportIdentifier`, which is `null` for a fixture picker. **Never assert an
Employee cell by exact text** — use `toContainText(<name>)`.

## Data

- **Journey E fixture, E2 block** — fixed names, never deleted, never minted per run; built through
  `ensureOnScreen` (existence is a GET, the create and any repair are UI).

  | Record | Name | Code | Notes |
  |---|---|---|---|
  | Crew | `E2 CREW` | `8016` | no exercise job, no break automation — asserted, not assumed |
  | Employee | `E2 PICKER ONE` | `8017` | active, home crew `E2 CREW`, the only member; own rate fields read and failed loudly if positive |
  | Job | `E2 JOB` | `4607` | `paymentType: 'Time'`, **`hourlyRate: 20`**, `considerEmployeeRate: false`, carrying `AG CA 2022` |

  Codes continue D10's block (`8014`/`8015`, jobs `4604`–`4606`); `4602` is burnt by a soft-deleted row
  (WEBPET-2368). **All three codes are free** — probed 2026-10-05 against the live rows *and* the recycle
  bin, which is where WEBPET-2368 hides a reservation. Ranch `B1 RANCH` and field `B1 FIELD` are reused
  read-only, as D9 and D10 do.

  **`hourlyRate` is mandatory and load-bearing twice over.** Without it the Transfer blocks the records with
  an Issues group "No hourly rate available", the commit still claims success and the spec sees zero job
  cards (D9 is red on dev for exactly this). And E2 *is* a statement about the regular rate: 20.00 makes
  1.5× = 30.00 and 2× = 40.00 exact in two decimals and sits clear of dev's department minimum wage, so
  neither rounding (E6) nor a minimum-wage top-up (E5) can be confused for the rule.

- **The overtime rule is selected by name, never by counter.** Dev's nine rules, read 2026-10-05: `Ag` (2),
  `Ag 2022` (18), `AG CA 2021` (6), **`AG CA 2022` (32)**, `Ag2022` (31), `Ag-2022` (1), `Irrigator` (3),
  `No Overtime` (5), `Office` (4). The scenario carries `rule.name: "AG CA 2022"`; the flow resolves it to
  its `jobTypeCounter` at run time from `GET /overtime-rules` and **never hard-codes 32** — counters are
  tenant data and a fresh environment will number them differently. `GET /jobs/{id}` returns
  `overtimeRulesName` beside `overtimeRulesCounter`, so the read-back asserts both.

- **Protect the names.** `PROTECTED_NAME_PATTERNS` in `src/data/static/shared/cleanupTargets.ts` carries
  `/^B…/`, `/^C…/`, `/^D\d{1,2} /` but **nothing for E**. Add `/^E\d{1,2} /`. It does not collide with the
  `E2E…` factory sweep prefixes — the pattern requires a space after the digits, and `'E2EEmp_'` has an `E`
  there — so the module-load assertion that no sweep prefix matches a protected name still passes. **Do NOT
  add a `jobCard` entry to `cleanupTargets.ts`**: that table drives a name-prefix sweep across the whole
  tenant, and job cards have no name and no restore route.

- **Fixture day: `dayOffset: -14`** (B owns 0…−9, C −10, D6 −11, D9 −12, D10 −13), well inside dev's
  `maximumDaysForTransferExport = 21`. Fixed punch times, never `now`: **06:00 / 17:30**.

- **The day, and why it is 17:30 and not 17:00.** Dev carries `employeeMealStart 4`, `employeeMealTime 0.5`,
  `employeeMinNetForMeal 5`, so an automatic half-hour meal bites any crew day past four hours. On a
  06:00→17:00 day that leaves **10.50 net**, which splits 8 / 2 / 0.50 for **240.00** and does not exercise
  the double-time threshold the way the catalog step describes. Lengthening the day to **17:30** restores
  **11.00 net** (11.50 gross − 0.50 meal) and the money is unchanged — **8×20 + 2×30 + 1×40 = 260.00** —
  because the unpaid half hour never enters a bucket. Note what this means for the schema: *gross and net
  are now different numbers*, and every derivation keys on **net**.

- **Scenario JSON** `src/data/journey-e/e02-california-daily-overtime.json`, loaded with
  `loadScenario(schema, testInfo)` (the loader derives the path from the spec's folder and basename, so the
  names must match exactly) and validated by a new **`JourneyE2DailyOvertimeCaseSchema`** in
  `src/data/schemas/journeyEScenario.ts`. `.strict()`, with `superRefine` encoding the plan's arithmetic so
  the data cannot drift out of agreement with itself.

  **`totalMinutes` and `totalHours` are deliberately removed from the shape.** Revision 1 carried both and
  keyed every bucket derivation on `totalHours`, which under a meal-bearing day is ambiguous — and revision
  1's own `superRefine` asserted `totalMinutes === timeOut − timeIn` *and* `mealMinutes === 0` *and*
  `net === gross === total`, three clauses that cannot all hold on a 690-minute span with a 30-minute meal.
  Worse, had the validator been relaxed instead of fixed, `totalHours` would have been 11.5 and the
  derivations would have produced regular 8 / overtime 2 / **double 1.5** for **280.00** — a plausible-looking
  wrong answer. Deleting the ambiguous names makes the mistake unrepresentable.

  `superRefine` clauses:

  - `workflow === 'E2'` · `dayOffset === -14`
  - `capture.timeIn < capture.timeOut`
  - **the day:** `expected.grossMinutes === minutes(timeOut) − minutes(timeIn)` (690);
    `expected.mealMinutes === 30` and `> 0` (a zero meal would mean this plan is describing a different
    environment, and should fail validation rather than silently pass);
    `expected.netMinutes === expected.grossMinutes − expected.mealMinutes` (660);
    `expected.netHours === expected.netMinutes / 60` (11)
  - `expected.timeCards === 2` · `expected.jobCards === 1`
  - **the precondition is real:** `expected.netHours > rule.doubleTimeAfterHours` — a day that does not
    exceed both thresholds *after the meal* cannot exercise E2
  - **the buckets are derived, not typed twice, and every one of them keys on `netHours` — never on gross:**
    `regularHours === min(netHours, rule.dailyOvertimeAfterHours)`,
    `overtimeHours === min(netHours, rule.doubleTimeAfterHours) − rule.dailyOvertimeAfterHours`,
    `doubleTimeHours === netHours − rule.doubleTimeAfterHours`, each `> 0`
  - **conservation:** `regularHours + overtimeHours + doubleTimeHours === expected.netHours` — **not** gross
  - **money on the regular rate:** `regularAmount === regularHours × hourlyRate`,
    `overtimeAmount === overtimeHours × hourlyRate × rule.overtimeMultiplier`,
    `doubleTimeAmount === doubleTimeHours × hourlyRate × rule.doubleTimeMultiplier`,
    `totalAmount === the sum`, and every one of the four exact to two decimals (`round2(x) === x`) — the
    premium may not introduce a third decimal, or E6's rounding would be in scope
  - a `timeCards` cleanup step with `cardTypes: [0, 1]` is required
  - **no preference-restore entry is required or allowed** — E2 writes no preference

  **`round2` does not exist.** `src/data/schemas/journeyDScenario.ts` defines a module-local
  `round4 = (n) => Math.round(n * 1e4) / 1e4` and nothing else; there is no exported rounding helper to
  import. `journeyEScenario.ts` adds its own local `const round2 = (n: number): number => Math.round(n * 100) / 100;`
  in the same style. Do not reach into the D module for it.

  Shape:

  ```jsonc
  {
    "workflow": "E2",
    "label": "e02-california-daily-overtime",
    "dayOffset": -14,
    "rule": {
      "name": "AG CA 2022",
      "dailyOvertimeAfterHours": 8,
      "doubleTimeAfterHours": 10,
      "overtimeMultiplier": 1.5,
      "doubleTimeMultiplier": 2
    },
    "capture": {
      "timeIn":  { "hour": 6,  "minute": 0 },
      "timeOut": { "hour": 17, "minute": 30 }
    },
    "expected": {
      "timeCards": 2,
      "jobCards": 1,
      "hourlyRate": 20,
      "grossMinutes": 690,
      "mealMinutes": 30,
      "netMinutes": 660,
      "netHours": 11,
      "employees": 1,
      "pieces": 0,
      "regularHours": 8,
      "overtimeHours": 2,
      "doubleTimeHours": 1,
      "regularAmount": 160,
      "overtimeAmount": 60,
      "doubleTimeAmount": 40,
      "totalAmount": 260
    }
  }
  ```

  The spec imports only `@utils/journeys/journeyEFlow`; the only inline literals in it are `testCaseId`,
  `tag:`, the title and `expect()` messages.

- **Fixture file.** New `src/data/journey-e/fixture.json` with an `e2` block (`crew`, `picker`, `job` —
  codes above, the job with `paymentType: "Time"` and `hourlyRate: 20`), a new
  `src/data/schemas/journeyEFixture.ts` and `src/data/journey-e/fixture.ts` exporting `journeyE2Fixture()`
  — a function, not a constant, so the block stays optional exactly as `journeyD10Fixture()` does.

  **`JourneyEFixtureSchema` has no mandatory `entities` block.** `journeyDFixture.ts` carries one because
  D6 predates the per-workflow blocks and still reads shared rows from it; Journey E has no such legacy, so
  copying it would create a required-but-unused object. The schema is:

  ```ts
  export const JourneyEFixtureSchema = z
      .object({
          _notes: z.array(z.string()).optional(),
          e2: E2Block.optional(),
      })
      .strict();
  ```

  Mirror D's `Entity` (`{ code: z.string().regex(/^[1-9]\d{3,}$/), name: z.string().min(1) }).strict()`) and
  its job extension (`paymentType: z.enum(['Time','Piece'])`, `hourlyRate: z.number().positive()`), and
  export `E2Block` and `JourneyE2Fixture` alongside.

- **Uniqueness rules the app enforces:** crew / employee / job `code` is unique database-wide **and across
  the recycle bin**. Nothing in E2 needs a generated name: the fixture rows are fixed and the time and job
  cards have no name at all.

## Preconditions

- [ ] `PROTECTED_NAME_PATTERNS` contains `/^E\d{1,2} /` (new — see §Data).
- [ ] Session API authenticated (`sessionApi`); CSRF double-submit as in `apiLogin.ts`.
- [ ] Ranch `B1 RANCH` / field `B1 FIELD` present; then **on screen** via `ensureOnScreen`, in this order
      (the New Employee form's Crew combobox arrives pre-filled with another crew and must be overwritten):
      `E2 CREW` → `E2 PICKER ONE` → `E2 JOB`.
- [ ] **The overtime rule exists and is the one named.** `GET /overtime-rules` (read) must contain a rule
      whose `name` matches the scenario's `rule.name` (`AG CA 2022`) and which is `active`; its
      `jobTypeCounter` is resolved from that lookup and used thereafter. If no such rule exists, the test
      **fails loudly naming every rule the environment offers** — it never skips and never silently picks
      another. **Its thresholds cannot be asserted directly** (see §Expected outcomes); they are proven by
      the 8 / 2 / 1 split downstream. There is no overtime-rule editor in the web product, so E2 selects a
      rule and never creates one.
- [ ] **The rule, the rate and Consider Employee Rate applied on screen** through
      `JobPage.setOvertimeRule(rule.name)`, `JobPage.setHourlyRate(20)` and the Consider Employee Rate
      control, in the order §Screens gives, **unconditionally on every run**. Then read back over
      `GET /jobs/{id}`: `overtimeRulesCounter` equals the resolved `jobTypeCounter`, `overtimeRulesName`
      equals `rule.name`, `hourlyRate` equals 20, `considerEmployeeRate` is **false**, `active` is true.
      Catalog A10 step 5 is "apply overtime rules via the job" — a `PUT /jobs/{id}` would hide the step from
      the run and would be a live `UiFirstViolation`.
- [ ] **The employee carries no rate that could displace the job's.** `GET /employees/{id}` for
      `E2 PICKER ONE`: its rate fields are annotated as evidence and a positive one **fails loudly**. This is
      belt to `considerEmployeeRate: false`'s braces — the toggle's effect is unverified (Open question 4).
- [ ] **The day must not be split or shortened by anything other than the meal.** `GET /crews/{id}` must
      show `E2 CREW` with no exercise job, `createBreakCardFromTimeIn = 0`, `autoPaidBreakType = 0` and
      `autoReturnFromBreak = 0`; a freshly created crew carries the form's defaults, and a crew that has
      drifted **fails loudly rather than being repaired** (D10's rule fields belong to D10's crew).
- [ ] **The meal policy is what the scenario expects.** `GET preferences` (read): annotate
      `employeeMealStart`, `employeeMealTime`, `employeeMinNetForMeal` as evidence, and assert
      `employeeMealTime × 60 === expected.mealMinutes` so a changed meal *length* names itself before the
      transfer rather than as a mystery in the Meal column. The *number* of meals the engine applies is not
      readable from any preference — the preview's Meal cell settles it (Open question 5).
- [ ] **The field carries no conflicting rule.** `GET /fields/{id}` for `B1 FIELD`: today it reads
      `overTimeRulesCounter: null` and `stateCounter: null` (probed 2026-10-05), so there is no precedence
      conflict to resolve. Both are still annotated as evidence and a non-null `overTimeRulesCounter` that
      differs from the job's **fails loudly naming both** — precedence between the two FKs is unverified
      (Open question 3) and must never be silently averaged over.
- [ ] Preference gate **read, not written**: `maximumDaysForTransferExport >= 14` (dev reads 21). If the
      window has moved below the fixture day the test must **fail loudly, not skip**. `timeDecimalRounding`
      (dev: 4) is captured as an evidence annotation.
- [ ] **Before-phase recovery sweep on the fixture day**, run before anything is seeded:
      1. `GET /job-cards?from=day&to=day`, filter to `crewCounter === E2 CREW`, `DELETE` **each** — this
         resets the source time cards to `transferred:false`, the only thing that makes them deletable.
         Note the plural: if the meal splits the day (Open question 6) a crashed run leaves more than one;
      2. then sweep the day's time cards **by crew**.
- [ ] The Work Crew filter is applied before any row is ticked (§Test case step 4).

Implement all of this in the spec's own arrange phase — the fixture rows, the overtime rule, the hourly rate
and Consider Employee Rate **on screen**, the punches **on screen** through the Batch page objects — never
by chaining onto another spec and never by POSTing a record into existence.

## API allowances

Every call this spec makes outside the browser. **A step a user performs on screen has no row here** — the
Job form, the Crew Time In form, the Crew Time Out form, the date scope, the analyze, the Work Crew filter,
the Job Cards preview tab, the ticking of rows, the commit and the `/input/job-cards` load are all UI and
appear nowhere below.

| Step / call | Endpoint | Allowance | Why |
|---|---|---|---|
| gate read | `GET preferences` | read | `maximumDaysForTransferExport` gates the fixture day; `employeeMealTime` is asserted against `expected.mealMinutes`; the other meal keys and `timeDecimalRounding` are captured as evidence. Never asserted into a skip |
| overtime-rule catalogue | `GET overtime-rules` | read | proves the named rule exists and is active, and resolves its `jobTypeCounter` at run time. The thresholds are **not** in this payload |
| fixture-row existence | `GET crews` · `employees` · `jobs` · `ranches` · `fields` (+ `GET <entity>/{id}`) | read | `ensureOnScreen`: existence is a GET, create/repair is UI |
| binned fixture restore | `POST <entity>/{id}/restore` | cleanup | undoes a deletion rather than creating; already wrapped inside `ensureOnScreen` |
| job read-back | `GET jobs/{id}` | read | proves `overtimeRulesCounter`, `overtimeRulesName`, `hourlyRate`, `considerEmployeeRate` and `active` persisted exactly as the screen saved them, before the day is seeded |
| employee read-back | `GET employees/{id}` | read | annotates the picker's rate fields; fails loudly on a positive one |
| crew read-back | `GET crews/{id}` | read | proves no exercise/break automation would split the day |
| field evidence | `GET fields/{id}` | read | annotates `stateCounter` / `overTimeRulesCounter`; fails loudly on a conflicting non-null |
| before-phase sweep — job cards | `GET job-cards?from&to` → `DELETE job-cards/{id}` | cleanup | a crashed previous run's cards must go before the day can be re-seeded |
| before-phase sweep — time cards | `GET time-cards?from&to` → `DELETE time-cards/{id}` | cleanup | crew-scoped |
| punch sync point | `GET time-cards?from&to` | read | the Crew Time Out form only offers employees with an **open** time-in, so the flow waits until the saved time-in is readable |
| record this run's time-card ids + References | `GET time-cards?from&to` | read | the roster guard and cleanup both key on them, recorded **before** any assertion runs |
| boundary + minute read | `POST transfer-to-job-cards/job-cards-preview {from,to,crewIds}` | read | explicitly named non-committing in the UI-first rule. Supplies `dateTimeIn`/`dateTimeOut`/`grossMinutes`/`netMinutes`, and every row is attached as evidence of whatever bucket and meal fields the payload carries |
| analyze corroboration | `POST transfer-to-job-cards/analyze {from,to,crewIds}` | read | non-committing; `plannableTotal === 2`, no blocking exception |
| read back the written card(s) | `GET job-cards?from&to` · `GET job-cards/{id}` | read | records **every** id on **every** poll, before the count is asserted |
| after-phase teardown — job card(s) | `DELETE job-cards/{id}` (with `rowversion`) | cleanup | by explicit id, one at a time |
| after-phase teardown — time cards | `DELETE time-cards/{id}` | cleanup | by id, from the ids recorded above |

**No `configuration` row exists, and that is deliberate:** E2 writes no preference. No DB. No UI delete. No
`bulk-delete`. No reverse. No write to any setup record other than E2's own job, which is a workflow step
performed on screen.

## Cleanup

**The order is not hygiene — it is the only escape hatch.** `lockTCsAfterTransferToJCs = true`, so
`DELETE /time-cards/{id}` on a transferred row returns **409 `record.transferred_delete`**. Deleting the
**job card** by id returns `200 {sourcesReset, linkageMissing:false}`, after which every source time card is
`transferred:false` and deletes with `204`.

| Phase | Step | How |
|---|---|---|
| after, 1 | **[imperative]** delete E2's own job card(s) | for **every** id recorded from the scoped `GET /job-cards`: `GET /job-cards/{id}` → `DELETE /job-cards/{id} {rowversion: version}`. Loop, do not assume one. Best-effort, logged, never fails the test |
| after, 2 | **[declarative]** `{ kind:'timeCards', employeeCodes:['8017'], dayOffset:-14, cardTypes:[0,1] }` | the flow hands `runCleanup` the exact two card ids it created |
| after, 3 | **[imperative]** crew-scoped day sweep | `GET /time-cards?from=day&to=day` filtered to `crewCounter === E2 CREW`, `DELETE` each survivor — the belt to step 2's braces |
| after, 4 | **[nothing]** setup rows | `E2 CREW`, `E2 PICKER ONE` and `E2 JOB` are permanent fixture, never deleted, protected by the new `/^E\d{1,2} /`. The overtime rule, hourly rate and Consider Employee Rate are left applied — it is E2's own job and the next run re-asserts all three |
| after, 5 | **[nothing]** preferences | nothing to restore: E2 writes none |
| after, 6 | **[nothing]** the transfer run | `GET /transfer-to-job-cards/runs` keeps an audit row. Read as evidence at most, **never reversed** (catalog D5 owns reverse) |

No entity in this spec has a name, so nothing is swept by prefix. Every delete is by id, from an id recorded
**before** the assertions ran, so teardown still knows the cards when an assertion fails.

**Budget.** Up to five Setup forms on a cold fixture, a Job form saved up to three times (rule, rate,
Consider Employee Rate), two Batch forms, two Transfer tabs and a grid, all with per-action screenshots —
and a `skipped-budget` outcome here means permanent residue on a shared environment. The spec calls
`test.slow()` **and** `test.setTimeout(360_000)`.

## Test case

**One workflow, one happy-path test, one runner row, and the id is the workflow id.**

The `E2` row already exists in `src/data/runner/journey-e.csv` as a reservation
(`E2,E2,E,workflow,californiaDailyOvertime,…,regression,0,,draft,0`), so this is a flip, not an insert.
**Exactly three cells change:** `jira` → `PET-12668`, `status` → `automated`, `enabled` → `1`. Leave
`category=workflow`, `testName=californiaDailyOvertime`, `testTitle`, `testDescription`, `segments=all`,
`modules=Windows`, `tags=regression` and `demo=0` exactly as they are.

**Flip `enabled` LAST**, after the spec exists and claims `E2`: an enabled row that no spec claims is a hard
`runner:check` error, so sequencing the edit the other way round turns a green tree red for a reason that
has nothing to do with the work. Then `npm run runner:sync && npm run runner:check`.

| id | Title | Tags | Category | enabled |
|---|---|---|---|---|
| `E2` | California daily overtime | `regression` | `workflow` | 1 |

```ts
test.describe('E2 · California daily overtime', { tag: ['@JourneyE', '@E2'] }, () => {
    test('[Payroll] Split an eleven-hour net day into eight regular hours, two at time-and-a-half and one at double time.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E2' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

> `runner:check` enforces that a `describe` carries only `@Journey<X>` / `@<WF>` / `@System`
> (`SUITE_TAG = /^@(?:Journey[A-F]|[A-F]\d{1,2}|System)$/`) and a `test` only the tier chain plus `@Demo`
> (`EXTRA_TEST_TAGS` is `@Demo` and nothing else). **Do not add `@Workflow`** — it is a hard failure in
> *both* positions, and the `calc → workflow tagged @Workflow` line in the JOURNEY profile predates the
> rule. `category=workflow` in the CSV is what makes it a workflow test; no tag does.

**Steps:**

1. `loadScenario(JourneyE2DailyOvertimeCaseSchema, testInfo)` → `prepareJourneyE2(...)`: ensure the
   ranch/field, then `E2 CREW`, `E2 PICKER ONE` and `E2 JOB` **on screen**; apply the overtime rule, the
   hourly rate and Consider Employee Rate **on screen** and read all three back; resolve the rule's counter
   by name from `GET /overtime-rules`; assert the crew carries no automation, the employee no displacing
   rate and the field no conflicting rule; assert the day-window and meal-length preference gates; run the
   before-phase recovery sweep (job cards first, then crew-scoped time cards).
2. `seedLongWorkday(...)` — **on screen**: Crew Time In at `capture.timeIn` (06:00) with Phase = `E2 JOB`
   and `employees: [picker]`; wait over the read GET until the time-in is readable (the time-out form only
   offers employees with an open time-in); Crew Time Out at `capture.timeOut` (17:30). Record the two
   time-card ids and References from the scoped GET, **before** any assertion.
3. **Scope and analyze — on screen, before anything commits.** Transfer screen → scope to the fixture day →
   **Analyze Transfer Candidates**.
4. **Scope the grid to the crew.** Work Crew filter → `E2 CREW` (never the Employee filter — WEBPET-3397).
   Then the roster guard: the References on screen must be **exactly** this run's two — refuse to transfer
   otherwise, naming both sets (`openScopedCandidates` already does this; pass `crew`). Assert
   `selectAllRowsCheckbox` is **not** checked. Corroborate over the non-committing `analyze`:
   `plannableTotal === 2`, no blocking exception.
5. **Catalog steps 1 + 2 — the preview, still before commit.** Open the **Job Cards** tab:
   - exactly `expected.jobCards` (1) row, Job cell `E2 JOB`;
   - `previewOvertimeBuckets()` reads **Gross 11.50 · Meal 0.50 · Net 11.00**, every figure taken from
     `scenario.expected` — one meal, deducted once, and the day is otherwise neither split nor shortened;
   - **Regular Hours 8.00 · Overtime 2.00 · Double Time 1.00**, and their sum is **11.00 — the net day, not
     the gross**;
   - **Amount 260.00** — the premium computed on the regular rate;
   - `previewTotals()` equals `{ pieces: 0, jobCards: 1, employees: 1 }`.
   Then corroborate the boundaries over the non-committing `job-cards-preview` read: `dateTimeIn` /
   `dateTimeOut` equal `capture.timeIn` / `capture.timeOut` on the fixture day,
   `grossMinutes === expected.grossMinutes` (690), `netMinutes === expected.netMinutes` (660) and
   `grossMinutes − netMinutes === expected.mealMinutes` (30); attach every returned row as a `preview-row`
   annotation (its bucket and meal field names are unverified — evidence, not assertion). Return to the Time
   Cards tab.
6. **Commit.** Tick each own Reference (never the header checkbox) → `Transfer to Job Cards 2` → confirm.
   Then poll the scoped `GET /job-cards`, **recording every id on every poll before the count is asserted**,
   until `expected.jobCards` cards exist for the crew on that day (`commitTransfer`).
7. **The committed card on screen.** `/input/job-cards` → From/To = the fixture day → Apply →
   `rowsForCrew('E2 CREW')` has exactly **1** row; its Job cell is `E2 JOB`; its Amount cell reads
   **260.00**.
8. **Read-back over the GET.** One card; `jobCounter` is `E2 JOB`; `exported` falsy and `locked` falsy.
   Record `netTime` / `grossTime` / `amount` / `calculationDesc` and any regular/overtime/double-time or
   meal fields as a **test annotation**, not an assertion — those field names and units are unverified and
   the on-screen columns already carry the proof.
9. **The capture is not rewritten.** The day's two time cards both read `transferred === true`.
10. `await run.cleanup()` — the job card(s) by id, then the time cards, then the crew-scoped sweep.

**Proof the test is real and not vacuously green:** the trace shows the Job form carrying `AG CA 2022`, the
20.00 rate and Consider Employee Rate off; the day is seeded with **two** punches and the screen proposes
**one** card whose 11.50 gross becomes 11.00 net and splits **8 / 2 / 1** *before* the commit;
`8 + 2 + 1 = 11` and `160 + 60 + 40 = 260` are asserted, not narrated; straight time (220.00), a
double-meal day (240.00) and a gross-keyed split (280.00) each fail a named assertion; and after
`run.cleanup()` the scoped `GET /job-cards` and `GET /time-cards` for the fixture day are empty.

## Implementation notes for the Generator

- **Flow file** `src/utils/journeys/journeyEFlow.ts`, mirroring `journeyDFlow.ts`'s D10 section:
  `prepareJourneyE2` (fixture rows + rule + rate + Consider Employee Rate on screen, the gates, the
  before-phase sweep, `finishCleanup` registered with `currentScope(testInfo)` so a timeout still tears down
  over the scope's own untraced context), `seedLongWorkday`, `analyzeCrewDay`, `readPreviewBoundaries`,
  `readDailyOvertime` (the GET read-back + annotations).
- **Reuse, do not re-implement, `openScopedCandidates` and `commitTransfer`.** Both take a `TransferRun`
  parameter, which is a plain structural interface — `{ scenario: { label, expected: { jobCards } }, crew,
  day, jobCardIds, ctx }` — and a `JourneyE2Run` satisfies it without inheritance. **`TransferRun` is not
  exported**, so `journeyEFlow.ts` can only *satisfy* the shape, never name it: define `JourneyE2Run`
  independently with those members and let structural typing do the rest. `SeedResult` **is** exported and
  can be imported and used by name. Import both functions from `@utils/journeys/journeyDFlow` and
  **re-export** them so the spec still imports exactly one flow module.
  Do **not** move them into a new shared module. (Revision 1 justified this by calling `journeyDFlow.ts`
  uncommitted D10 work — that is stale; D10 merged to `main` as `e355ec6`, PR #98.) The real reason stands:
  a move churns a file that is green for three workflows, for no behavioural gain. If a fourth consumer
  appears, extract then.
- **ESLint is a deny-list, not an allow-list — do not rely on it to police imports.** For
  `tests/web/**/*.spec.ts` it bans `@utils/api/*`, `@utils/relay/*`, `@utils/cleanup/*`, `@data/generated*`,
  `@pages/webpet/*` / `@fixtures/webpet*`, and the syntax
  `(sessionApi|apiRequest).(post|put|patch|delete|fetch)`. It does **not** enforce a whitelist, so the
  statement "the spec may import only `@fixtures/base.fixture`, `@data/schemas/journeyEScenario`,
  `@utils/data/scenarioLoader` and `@utils/journeys/journeyEFlow`" is a **convention this plan imposes and a
  reviewer must check by eye** — lint will not catch a fifth import. Every `sessionApi` write lives in the
  flow, inside `allowApiWrites('cleanup', …)`.
- **`previewColumnIndexes` extraction:** identical regex, identical error string, `previewSegments` switched
  to call it in the same commit, so the refactor is provably behaviour-preserving for D10.
- **Comments:** sparse, non-obvious "why" only. No JSDoc boilerplate.

## Validation

- `npm run typecheck`, `npm run lint`
- `npm run runner:sync && npm run runner:check` (after `enabled=1`, which is flipped last)
- `npm run test:dev -- tests/web/journey-e-payroll/e02-california-daily-overtime.spec.ts`
  (chromium, workers 2 — never lowered)
- `npm run test:dev -- tests/web/journey-d-office/d10-*.spec.ts` — the `previewColumnIndexes` extraction
  touches a method D10 depends on; one sibling run proves the refactor is inert
- `npm run ui-first:audit` → **0 violations**
- `npm run coverage:catalog` → report the E2 delta
- A red `UiFirstViolation` is never healed by adding an allowance: it means a step this spec performs
  through the API belongs on screen.

## Open questions for the tester

Six items. The seven of revision 1 were probed on 2026-10-05 and five are now settled in the body above —
the meal does bite, `considerEmployeeRate` defaults true, the codes are free, the thresholds are unreadable
and the rule is named `AG CA 2022`. What remains cannot be answered without running E2 itself, and two of
them are new: they were found by verifying revision 1 against the code, and either one can turn the first
run red in a way that looks like a product bug if it is not expected.

Each is written into the spec as a loud assertion. **None is a licence to adjust `expected` to whatever
comes back.**

- [ ] **1. Is the premium in the job card's `amount` at transfer time, or added at close/export?**
      **260.00** (premium included) vs **220.00** (straight time on eleven net hours). The plan asserts
      260.00. If the engine defers the premium to close, **that is a finding reported on the ticket, not
      something to heal around** — the assertion stays and the plan is revised only after the product
      behaviour is confirmed and accepted.
- [ ] **2. The Job Cards preview headers today, and the `job-cards-preview` field names.** D9 measured
      `Regular Hours` / `Overtime` / `Double Time` / `Meal` on 2026-10-01. `previewOvertimeBuckets()` fails
      loudly listing the real headers if they have moved — but confirm the strings so the first run is not
      spent on that. Related and unverified: whether a `job-cards-preview` row carries matching bucket
      fields, and under what names; and whether the Gross / Meal / Net cells render as decimals or as
      `HH:MM` (the new format guard throws by name if they are `HH:MM`, and the Meal unit — 0.50 vs 30 vs
      `0:30` — is driven from `scenario.expected` for the same reason).
- [ ] **3. Precedence between the Job's `overtimeRulesCounter` and the Field's `overTimeRulesCounter` (and
      `stateCounter`).** Largely defused: `B1 FIELD` reads null for both today, so E2 has no conflict to
      resolve. But precedence itself is unverified, `B1 FIELD` is shared, and it must never be edited by
      this spec — so the flow keeps annotating both and failing loudly on a conflicting non-null.
- [ ] **4. What kind of control is Consider Employee Rate, and does turning it off actually take?**
      It defaults to `true`, so E2 must change it. The control's shape (checkbox, switch, or a Select
      needing `pickSelectByValue`) is unknown, which is why the Generator is told to read
      `considerEmployeeRate` back over `GET /jobs/{id}` and fail loudly if it is still true, and why the
      employee's own rate fields are read and failed loudly if positive.
- [ ] **5. NEW — does a *second* meal bite past ten hours?** `employeeMealStart 4` has been read here as
      "one meal once the day passes four hours". California's actual rule — which this engine may well model
      — is a **second** 30-minute meal after ten hours. Two meals on an 11.50 h day gives net **10.50**,
      buckets **8 / 2 / 0.50** and an amount of **240.00**, which is close enough to 260.00 to read as a
      rounding bug and be "fixed" by weakening something. It is not a rounding bug. The guard is that the
      Meal assertion carries its expected minutes from `scenario.expected.mealMinutes` (30), so the failure
      names itself: *Meal read 1.00, expected 0.50*. If a second meal does bite, the correction is to
      lengthen the day again so net returns to 11.00 — never to accept 10.50 and restate the buckets.
- [ ] **6. NEW, and the single most likely cause of a first-run red — does the auto-meal split the day into
      more than one job card?** This plan hard-codes `expected.jobCards: 1`, `previewTotals().jobCards === 1`
      and `rowsForCrew('E2 CREW')` count 1 throughout. **D10 proved the engine does carve a day into
      multiple cards** for exercise and break segments. If the meal deduction behaves the same way — a card
      06:00–11:xx and a card 11:xx–17:30 — then the preview shows two rows, every count assertion fails at
      once, and E2's assertion shape changes from *"one row, seven columns"* to *"N rows, summed"*: the
      buckets and the amount would have to be summed across rows before comparison, and the Meal cell would
      appear on one row or be absent entirely. The before-phase sweep and the cleanup loop are already
      written for a plural outcome, so a red here leaves no residue. If it fires, the fix is a shape change
      in the flow and the schema — **not** a change to any expected number: 8 / 2 / 1 and 260.00 hold either
      way, because the split would be a presentation of the same day.

Items 1, 5 and 6 are the three that can change the plan. 2, 3 and 4 can each only turn a first run red in a
way that names itself.

---

**Handback notes for the orchestrator (not part of the plan file):**

- Write the above to `test-plans/journey-e/e02-california-daily-overtime.md`, replacing revision 1 in full.
  I wrote nothing to disk and launched no browser, per instruction.
- Everything in §B and §C of the task was verified against the real source, not assumed:
  `JobPage.setPieceRate` (lines 121-142) drives Save itself and never calls `saveEdit()`;
  `PickerComponent.pickCombobox` ends with `expect(combobox).toHaveValue(PickerComponent.labelPattern(label))`
  and `labelPattern` is ``new RegExp(`(^|: )${escaped}$`)``; `previewSegments`'s `column()` is a closure at
  `TransferToJobCardsPage.ts:820-824` with the error string
  ``Job Cards preview has no '${name}' column; headers are ${JSON.stringify(headers)}`` and the parse
  `replace(/[^0-9.-]/g, '')` at line 833; `journeyDScenario.ts:165` defines `round4` and there is no
  `round2`; `TransferRun` at `journeyDFlow.ts:50` is a bare `interface` with no `export`, while
  `SeedResult` at line 220 is exported; `ensureOnScreen.ts`'s `JOB.needsRepair` checks only `isActive`;
  `JourneyDFixtureSchema` has a required `entities` block; the lint config is
  `config/lint/.eslintrc.json` (no `eslint.config.js` at the repo root) and its `tests/web/**/*.spec.ts`
  override is the five-pattern deny-list plus the `no-restricted-syntax` rule, with no allow-list;
  `src/data/runner/journey-e.csv:3` is the existing `E2` reservation at `status=draft,enabled=0` with an
  empty `jira` cell.
- The plan now has no banner and no internal contradictions. Open questions are non-empty, so the
  JOURNEY profile's step 3 checkpoint applies: **pause for the human before invoking the Generator.**
  Questions 5 and 6 in particular change the spec's assertion *shape*, not just its numbers, and both are
  cheap to settle with a single read-only probe run (seed the day, open the preview, read the row count and
  the Meal cell) before any generation happens.
