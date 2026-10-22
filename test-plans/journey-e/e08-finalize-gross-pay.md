# `E8` · Finalize gross pay

## Application Overview

**Revision 1, 2026-10-22. Planned with live exploration** of View ▸ Job Cards, its Report dialog and its Test File sheet on dev staging as `su` (read-only: only Apply Filter, Refresh, the displayed-row filters, Report ▸ PDF/Excel and Test File were clicked; no Transfer, Delete, Recalculate, Clear Export Flag or Export to Accounting). The Transfer-screen half reuses E2's measured path unchanged. Sibling plan: `test-plans/journey-e/e02-california-daily-overtime.md`.

> **One crew, one day, one card — and the office signs it off.** E8 seeds a small crew day on screen (E2's own crew, picker and job, on a day of its own), proves on the Transfer screen that the crew's rows are clean (every own row **Ready**, no blocking exception) *before* anything commits, transfers exactly those rows, and proves the crew has nothing left to transfer. It then does what a payroll clerk does on Friday: opens **View ▸ Job Cards**, scopes it to the day and the crew, and reads the **Totals** bar. Gross, Meals, Net, Regular, Overtime, Double and Amount must reconcile with one another, with the pre-commit preview, and with the scenario. It runs the **Payroll Summary** report for that crew and day and keeps the files. Finally it runs **Test File**, the read-only "can these cards be exported?" check, and proves it changed nothing.
>
> **Binding safety constraints** (carried from E2 and D5, plus three new ones for this screen):
> * Transfer: rows are ticked **by Reference**. The header **"Select all rows"** is select-all-across-the-filter and is never touched. Scope with the **Work Crew** filter, never Employee (WEBPET-3397).
> * View ▸ Job Cards: the toolbar carries **Delete ▾** (`view-job-cards-delete`, whose menu holds `view-job-cards-delete-all`), **Export to Accounting** (`view-job-cards-export`), **Clear Export Flag** (`view-job-cards-clear-export-flag`), **Recalculate** (`view-job-cards-recalculate`), **Modify**, **Multi Edit** and **Add Job Card**. **None is ever located by the page object**, so E8 cannot click one. A "delete all loaded" wiped ~9.5 k dev job cards in Sept 2026.
> * The Report dialog's **Save ▾**, **Load**, **Edit in Report Editor** and **Export ▾** (CSV/Text/XML) are never used. Save writes a shared report layout.
> * The Test File sheet's **Yes** (log download) and `export-test-file-download` are never clicked. E8 dismisses with **No**. The file itself belongs to E9.
> * Every report runs on **one crew and one day**. A whole-day PDF can hit the 2-minute 504 "The report took too long to produce…" (WEBPET-2658).
> * **E8 writes no preference.** All setup writes go through E2's existing on-screen path, on E2's own rows.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `E8` (line 1465) |
| Jira | `WEBPET-2064` (feature) · automation ticket `PET-12673` |
| Recording | — none |
| This plan | `test-plans/journey-e/e08-finalize-gross-pay.md` |
| Spec | `tests/web/journey-e-payroll/e08-finalize-gross-pay.spec.ts` |
| Scenario | `src/data/journey-e/e08-finalize-gross-pay.json` |
| Schema | `src/data/schemas/journeyEScenario.ts` → new `JourneyE8FinalizeCaseSchema` |
| Runner row | `src/data/runner/journey-e.csv` → `E8` (existing reservation, line 9) |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `E8` |
| Journey | `E` — Weekly payroll close and export |
| Segments | `all` |
| Modules | `Windows` |
| Surface | `ui` — spec in `tests/web/journey-e-payroll/`; runner category `ui` |
| Demo candidate | no |
| Catalog status | draft (row `E8,…,ui,finalizeGrossPay,…,regression,0,,draft,0`) |

**Summary** (from the catalog)
> Confirm every crew has transferred cleanly for the week and treat the job cards as the payroll basis. The payroll summary report is the usual final check.

## Catalog steps

| # | Catalog step | Office surface | Automatable? |
|---|---|---|---|
| 1 | Confirm all crews and days are transferred with no open exceptions. | **Transfer to Job Cards** (left menu) → scope to the fixture day → **Analyze Transfer Candidates** → Work Crew = `E2 CREW`. Every own row's status badge reads **Ready**. Tick each own Reference → **Transfer to Job Cards 2** → confirm → toast **"Transfer complete — 1 job card written, 2 time cards transferred."** The app lands on `/view/job-cards?transferRun=N` (`viewJobCardsAfterTransfer` is true on dev). Back to Transfer via the menu → re-analyze: the crew's References are **no longer offered**. | **yes, on screen**, for **one crew and one day**. "All crews and days for the week" is a scope widening of the same check. The happy path proves it on the one crew E8 owns, because every other crew on a shared tenant belongs to someone else |
| 2 | Review the payroll summary (net regular, overtime, double time, pieces, paid pieces, amounts) by employee and day. | **View ▸ Job Cards** (left menu) → date range = fixture day → **Apply Filter** → **Crews** = `E2 CREW`. Read the **Totals** bar (`view-job-cards-shift-totals`), the row-count strip (`view-job-cards-row-count`) and the crew's single row (Regular Hours · Overtime · Double Time · Pieces · Paid Pieces · Amount · Exported). Then **Report** → **Payroll Summary** → **Excel** and **PDF**. | **yes, on screen.** Report *contents* are not parsed (there is no PDF/xlsx parser). E8 asserts that the request succeeds, the content type, a non-empty file, and the Excel extension |
| 3 | Treat the week's job cards as final for export. | **Test File** (`export-analyze-action`) opens the sheet "Test File — Check which job cards can be exported. No data is changed." It fires `POST /job-cards/export-to-accounting/candidates` (`analyze:true`) and `POST …/test-file`, then shows "N ready · M cannot export" and an **Analyze Results** alert. | **yes, read-only part only.** Live: both POSTs 200; after Refresh the row was still listed with Include Exported off and read **Exported = No**. E8 asserts the sheet's **total** (ready + cannot export = the crew's card count) and that **nothing changed**. The ready/cannot split, the export file and its earning codes are **deferred to E9** (A4 owns earning codes). Export to Accounting is out of scope |

## Expected outcomes

- When `E2 CREW` / `E2 PICKER ONE` / `E2 JOB` (`AG CA 2022`, Hourly Rate 20.00) carry exactly two time cards on day −18 (a crew time-in at **06:00** on `E2 JOB` and a crew time-out at **19:00**), the Transfer screen scoped to that day and crew shall offer exactly **2** candidates, both this run's References. **Both status badges shall read `Ready`**, and the non-committing analyze for the crew shall report `plannableTotal === 2` and **no blocking exception code**.
- Before the commit, the **Job Cards** preview tab shall show **1** row (Job `E2 JOB`) reading **Gross 13.00 · Meal 0.00 · Net 13.00 · Regular 8.00 · Overtime 4.00 · Double 1.00 · Amount 320.00**, with preview totals `{ jobCards: 1, employees: 1, pieces: 0 }`. These are E2's measured numbers, reused on purpose, so all three buckets are non-zero.
- Ticking the two own References and transferring shall show **"Transfer complete — 1 job card written, 2 time cards transferred."**. The app shall land on `/view/job-cards?transferRun=N`, where N is the execute job's `transferRunCounter`. `GET job-cards` scoped to the crew and day shall return exactly **1** card, recorded for cleanup before the count is asserted.
- On a re-analyze of the same day, **neither of this run's References shall be offered as a transfer candidate**, and the crew-scoped analyze shall report `plannableTotal === 0` with no blocking code. Both time cards shall read `transferred === true` over the read GET.
- **View ▸ Job Cards**, scoped to the fixture day and Crews = `E2 CREW`, shall show exactly **1** row (Reference = the written card, Work Crew `E2 CREW`, Employee containing `E2 PICKER ONE`, Job containing `E2 JOB`, **Exported `No`**). The strip shall read `1 of N record(s)` and `1 of M employee(s)` (displayed of loaded). The Pieces footer shall read **0** displayed.
- The **Totals** bar shall read **Gross 13.0000 · Net 13.0000 · Meals 0.0000 · Amount 320.00 · Regular 8.0000 · Overtime 4.0000 · Double 1.0000**, and **First Date** shall be the fixture day (`MM/DD/YY`). It shall reconcile with itself: **Net = Gross − Meals** and **Regular + Overtime + Double = Net**, each within 0.0001. It shall reconcile with the pre-commit preview: Gross, Meals, Net, Regular, Overtime, Double and Amount each equal the sum over the preview rows. And it shall equal `scenario.expected`.
- The crew row's cells (read by header, since the layout is user-reorderable) shall equal the Totals bar: Regular Hours 8 · Overtime 4 · Double Time 1 · Amount 320.00 · Pieces 0 · Paid Pieces 0 (or empty). That is the "by employee and day" view of one employee on one day.
- **Report ▸ Payroll Summary ▸ Excel** shall send `POST reports/run-excel` with `reportName: "JobCardPayrollSummary"`. Its `filters` shall carry From = To = the fixture day, `Exported = false`, and an entry scoping to `E2 CREW`. The response shall be **200** with content-type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment`. A browser **download** shall arrive whose suggested filename matches `/^Job Card - Payroll Summary .+\.xlsx$/` and whose saved size is **> 0** bytes.
- **Report ▸ Payroll Summary ▸ PDF** shall send `POST reports/run` → **200**, `application/pdf`, `Content-Disposition: inline`, with a non-empty body. A viewer dialog titled `Job Card - Payroll Summary — <date, time>` shall open with an iframe whose `src` starts `blob:`. Its **Download** shall produce a download whose suggested filename ends `.pdf` and whose size is > 0.
- **Test File** shall open `job-card-analyze-sheet` titled `Test File` with the description "Check which job cards can be exported. No data is changed.". Payroll is the active type. `POST job-cards/export-to-accounting/candidates` and `POST job-cards/export-to-accounting/test-file` shall both return 200. The summary's **ready + cannot export** shall equal **1**. The **Analyze Results** alert shall read "Correct job-cards: X. Incorrect job-cards: Y." with X + Y = 1. After **No** → Close → **Refresh**, the crew row shall still be listed with **Include Exported off** and read **Exported `No`**, and `GET job-cards/{id}` shall return `exported` falsy.
- **Which side of the Test File split the card lands on** (ready vs cannot export), the file state (`export-test-file-not-configured` / `-empty` / `-name`) and the failure text (live, the B1 row read "'' from Job (0 - Break) does not contain the Earning Code for Regular Time").
  _— **deferred: E9 owns the export file, A4 owns the job's earning codes.** Recorded as `test-file-evidence` annotations, never asserted. The split depends on `E2 JOB`'s earning codes and on the tenant's accounting format, not on E8._
- **The report's contents** (per-employee/day lines, totals inside the PDF/xlsx).
  _— **not automatable here: no PDF/xlsx parser in the suite** (by decision). The on-screen Totals bar and row carry the numeric proof. The report proves only that the office's final check runs for this crew and day and yields a file._
- **"All crews and days for the week"**.
  _— **not automatable on a shared tenant:** every other crew's state belongs to other runs and other users. E8 proves the check on its own crew and day. The page object's scoping is the same one a week-wide check would use._
- **Export to Accounting, Clear Export Flag, the export file and its identifiers.**
  _— **deferred: catalog E9 / E10.** Forbidden here by the safety constraints._
- **Pieces / Paid Pieces non-zero.**
  _— **deferred:** E2 JOB is time-paid, so both read 0. The Totals bar shows **no Pieces label** (measured: Gross · Net · Meals · Non-Labor Units · Amount · Regular · Overtime · Double · First Date). Pieces live in the row columns and the `view-job-cards-piece-count` footer, which E8 asserts at 0. A piece-paid finalize belongs to a piece workflow (D9/D5)._
- On-blur validation, Save-stays-disabled and the Unsaved-changes bar on the Setup/Batch forms.
  _`(POM)` — exercised by E2's setup path, which E8 reuses unchanged._

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Setup ▸ Crew / Employee / Job / Ranch / Field | via `ensureOnScreen` | existing | **unchanged** — E2's `prepareJourneyE2` |
| Input ▸ Batch ▸ Crew Time In / Out | menu | `CrewTimeInPage`, `CrewTimeOutPage` | **unchanged** — E2's `seedLongWorkday` |
| Transfer to Job Cards (Time Cards + Job Cards tabs) | `Transfer to Job Cards` | `TransferToJobCardsPage.ts` | **one new method** `reanalyze()` (below); everything else reused: `openFromMenu`, `scopeToDay`, `analyzeCandidates`, `filterByCrew`, `candidateReferences`, `rowStatusText`, `openJobCardsTab`, `previewOvertimeBuckets`, `previewTotals`, `openTimeCardsTab`, `selectAllRowsCheckbox`, `transferCompleteToast` (:925), `runTransfer` (:729) |
| **View ▸ Job Cards** | `View` ▸ `Job Cards` (`/view/job-cards`) | `src/pages/processing/ViewJobCardsPage.ts` | **extended** — today Reverse only (below) |
| Report dialog (from View ▸ Job Cards) | toolbar **Report** | **new** `src/pages/processing/ReportDialog.ts` | new class, composed into `ViewJobCardsPage` as `report`. Its test ids are generic (`report-*`), so it is probably shared with View ▸ Time Cards. It lives under `src/pages/processing/`, **not** `src/components/` root, so it stays out of the shared core |
| Test File sheet | toolbar **Test File** | **new** `src/pages/processing/TestFileSheet.ts` | new class, composed into `ViewJobCardsPage` as `testFile` |

### View ▸ Job Cards — measured 2026-10-22

Fresh menu entry: date range = last 7 days, Crews "All crews", Employees "All employees". **Nothing loads until Apply Filter.** Report, Test File, Export and Export to Accounting stay **disabled** until a load, and the Totals bar is absent until rows load. After Apply, the filter panel collapses to `YYYY-MM-DD – YYYY-MM-DD` + **Edit filter** (`view-job-cards-edit-filter`), and the URL gains `?filter={"version":1,"from","to","employeeIds","crewIds","includeExported":false,"criteria":[]}`. The load is `GET job-cards?from=D&to=D&includeExported=false&dateBasis=selection`.

| Element | Selector | Notes |
|---|---|---|
| date range trigger | `getByTestId('selection-date-range').getByRole('button', { name: 'First Day Start – Last Day Start' })` | same calendar popup as Transfer: day cells `"Sunday, October 4th, 2026"`, presets `date-range-preset-last30` etc., two `textbox "Day"` segments, **Apply**. One click moves one end of the range, so collapse with the read-back guard Transfer's `applyDateRange` uses. Chip reads `MM/DD/YYYY – MM/DD/YYYY` |
| Include Exported | `getByRole('switch', { name: 'Include Exported' })` (`view-job-cards-filter-include-exported`) | assert **off** |
| Apply Filter | `getByTestId('view-job-cards-apply')` | wait for `GET job-cards?from=day&to=day` 200 |
| Refresh | `getByTestId('view-job-cards-filter-refresh')` | re-reads the same filter (GET) |
| Crews filter | `getByTestId('view-job-cards-filter-crews')` → `searchbox "Search crews…"` → `button` exact crew name (option label is the **bare name**, e.g. `B1 CREW`) → `Clear (1)` appears → Escape. Chip: `view-job-cards-filter-crews-chips` | options come from the **loaded rows**, so it only works after Apply. It is client-side (re-totals instantly) and also written into the URL `filter.crewIds` |
| Employees filter | `view-job-cards-filter-employees` / `…-chips` ("All employees") | **persists across Apply Filter** (live: a chip survived a Crews clear and an Apply). Assert it reads `All employees` |
| grid | `getByRole('grid', { name: 'Job Cards' })` (`data-grid`); data rows `role=row` with **aria-label = Reference** (`JC00000654`, `261016-0000001-JC-001-Su`); `data-grid-count` "Total N rows"; empty `datagrid-empty-state` "No job cards match the current filter." | column order is a **per-user saved layout** (`GET user/grid-layouts/viewJobCards.columnOrder`). Live, Time Out sat before Time In, so always use `cellByHeader`. Headers: Work Crew, Employee, Time In, Time Out, Reference, Gross Time, Net Time, Regular Hours, Overtime, Double Time, Ranch, Field, Job, Rate Source, Hourly Rate, Time Amount, Pieces, Paid Pieces, Piece Rate, Piece Amount, Non-Labor…, Break Time, Piece Underpayment, Exported, Export Identifier, Run Number, Amount, Department. Grid cells render plain numbers ("8", "0", "19.998", "159.98"); Employee cell `"2345 : A Kishore"` / `": B1 ABSENTEE FOUR"` → use `toContainText` |
| **Totals bar** | `getByTestId('view-job-cards-shift-totals')` | children: `SPAN "Totals"`, then one `SPAN` per metric holding `SPAN label` + `SPAN value`. **Labels, in order:** `Gross`, `Net`, `Meals`, `Non-Labor Units`, `Amount`, `Regular`, `Overtime`, `Double`, `First Date`. **Formats:** hours 4 dp (`"8.0000"`, `"72.0333"`), Non-Labor Units 6 dp (`"0.000000"`), Amount 2 dp, no currency sign (`"159.98"`, `"1600.38"`), First Date `MM/DD/YY`. **No Pieces label.** Re-computes for the displayed-row filters (live: 10 rows 72.0333 → 1 row 0.0333) |
| row-count strip | `view-job-cards-row-count` → `view-job-cards-record-count` ("1 record" unfiltered, "1 of 10 record" filtered), `view-job-cards-employee-count` ("1 of 2 employee"), `view-job-cards-piece-count` ("0.000000 of 0.000000 pieces") | displayed **of** loaded. The plural is irregular ("1 of 32 record", "0 of 32 records"), so parse numbers with `/([\d.,]+)(?:\s+of\s+([\d.,]+))?/` |
| toolbar (allowed) | Report `view-job-cards-print-report` · Test File `export-analyze-action` (tooltip wrapper `export-analyze-action-tooltip`) | |
| toolbar (**never located**) | `view-job-cards-delete` (+ `-delete-all`), `view-job-cards-export`, `view-job-cards-clear-export-flag`, `view-job-cards-recalculate`, `view-job-cards-modify`, `view-job-cards-add`, Multi Edit, `view-job-cards-export-data` (grid Export), Save/Load Filter | |

**New `ViewJobCardsPage` members** (no delete/export/recalc member is ever added):
`openFromMenu()` (leftNav `['View', 'Job Cards']`, `/view/job-cards`, heading visible) · `scopeToDay(day)` (popup day-cell + collapse guard + Apply + chip read-back; mirror `TransferToJobCardsPage.applyDateRange`'s day-cell branch, do not refactor Transfer) · `includeExportedSwitch` · `applyFilter()` (click + `waitForResponse(GET /job-cards?from=…)` 200 + `data-grid-count` visible) · `refresh()` · `filterByCrew(name)` · `crewChips` / `employeeChips` · `readTotals(): Promise<JobCardTotals>` returning `{ gross, net, meals, nonLaborUnits, amount, regular, overtime, double, firstDate }` by **label** (never index). It throws by name on a missing label (listing the labels it saw) and on an `HH:MM` value (E2's guard). NaN while empty, so a poll keeps waiting · `readCounts()` returning `{ records, employees, pieces }`, each `{ shown, loaded }` · `report: ReportDialog` · `runReport(name, format)` delegating to it · `testFile: TestFileSheet`. Keep `rowsForCrew` and `cellByHeader` as they are.

### Report dialog — measured

Trigger `view-job-cards-print-report` opens `getByRole('alertdialog', { name: /^Report: / })`, heading `Report: <name> — <MM/DD/YYYY>`. **It always reopens on "All Data"**, so pick the report on every open. The report picker is an **unlabelled** combobox, the first `combobox` in the dialog (hidden input value `D|All Data` / `A|Payroll Summary`), with a listbox of `option`s. **"Payroll Summary" is present** (`reportName: "JobCardPayrollSummary"`, `reportType: "A"`), alongside "Payroll Summary (Job)", "… by Crew", etc., so pick it with `{ name: 'Payroll Summary', exact: true }`. Params block `report-params` (Payroll Summary has 20 `combobox`es with defaults, e.g. Show Time in Decimals = Yes). Leave every default. Buttons: `Edit in Report Editor`, **`Excel`**, `Export ▾` (`report-export-trigger`: CSV / Text / Text (Tab Separated) / XML), `Load` (`report-load-trigger`), `Save ▾` (`report-save-trigger`), **`PDF`**, `report-cancel-run` ("Cancel run"), close `report-close`.

**Delivery.** The request carries the screen's filter as server `filters`. Live, with the Employees chip set: `[{field:"JobCard.DateTimeIn",values:["2026-10-12"],operator:"greaterOrEqual",label:"From"}, {…"lessOrEqual",label:"To"}, {field:"JobCard.Exported",values:[false],operator:"equals"}, {field:"JobCard.EmployeeCounter",values:["83"],operator:"equals",label:"Employee",displayValue:" : B1 ABSENTEE FOUR"}]`. The crew entry's field name is unverified (Open question 2).
- **Excel** → `POST https://api.ptdev.xyz/api/reports/run-excel` → 200, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `attachment; filename="JobCardPayrollSummary.xlsx"`. The **browser fires a download event** with suggested name `Job Card - Payroll Summary 2026-10-22 15-05-16.xlsx`, and the dialog closes.
- **PDF** → `POST …/api/reports/run` → 200, `application/pdf`, `inline; filename="JobCard.pdf"`. **No download**: a viewer `getByRole('dialog', { name: /^Job Card - Payroll Summary — / })` opens with an `iframe` whose `src` is `blob:https://app.ptdev.xyz/<uuid>` and whose `title` equals the heading. The footer has `Close`, **`Download`** (an `<a download href="blob:…">`, which fires a download with suggested name `<uuid>.pdf`) and `Print`. The header has `Full screen` and `Close`.

`ReportDialog` API: `open()` · `selectReport(name)` (assert heading `Report: ${name} — `) · `run(format: 'excel' | 'pdf', saveTo: string): Promise<ReportOutput>` returning `{ format, status, contentType, contentDisposition, filters, bodyBytes, suggestedFilename, savedPath, savedBytes }`. Arm `page.waitForResponse` (POST, path `/reports/run-excel` or `/reports/run`) **and** `page.waitForEvent('download')` before the click (for PDF, arm the download before clicking the viewer's Download). `download.saveAs(saveTo)`, size from `fs.stat`. `filters` = `JSON.parse(response.request().postData()).filters`. Then close the viewer with its footer **Close**. 120 s timeout on the response, with a named error mentioning WEBPET-2658 on a 504.

### Test File sheet — measured

`export-analyze-action` is disabled until a load. Click → sheet `getByTestId('job-card-analyze-sheet')`, heading `Test File`, description `Check which job cards can be exported. No data is changed.` Export type group `Export type`: `job-card-analyze-type-payroll` (active by default) / `job-card-analyze-type-cost`. Summary `job-card-analyze-summary` ("0 ready" / "1 cannot export"). File block `export-test-file` with exactly one of `export-test-file-not-configured`, `export-test-file-empty` ("No job cards in this filter would be written to an export file."), `export-test-file-error`, or `export-test-file-name` + records + `export-test-file-download` / `export-test-file-download-unavailable`. Failures list `job-card-analyze-failures`. Alert `getByTestId('export-analyze-results')` "Analyze Results — Analyzing completed. Correct job-cards: 0. Incorrect job-cards: 1. Do you want to see the log file?" with `export-analyze-results-no` / `-yes` (Yes = a client-side `analyze-log-<type>-<iso>.html` blob). Requests (from the bundle + network log): `POST job-cards/export-to-accounting/candidates {exportType, from, to, employeeIds?, crewIds?, …, analyze:true, limit:1}` and `POST job-cards/export-to-accounting/test-file {same filter}`, both 200. Close with the sheet's `Close` button.

`TestFileSheet` API: `open()` (arm both `waitForResponse`s, click, sheet visible, both 200, returning the `crewIds` they carried) · `readSummary(): {ready, cannotExport}` · `fileState(): 'not-configured' | 'empty' | 'named' | 'error'` · `failureTexts()` · `resultsAlert` · `dismissResults()` (**No** only) · `close()`. No member for `-yes` or `export-test-file-download`.

### Transfer — one new method

`reanalyze(): Promise<void>` clicks **Analyze Transfer Candidates** and waits for the screen's own `POST transfer-to-job-cards/analyze` response (200), not for a candidate count. `analyzeCandidates({expected})` polls for at least N candidates, which a fully transferred crew can never satisfy honestly.

## Data

- **Fixture: reuse E2's block, on E8's own day.** `E2 CREW` (8016), `E2 PICKER ONE` (8017), `E2 JOB` (4607, Time, Hourly Rate 20, `AG CA 2022`), `B1 RANCH` / `B1 FIELD`, all through `prepareJourneyE2` unchanged. Its before-phase sweep and teardown are **crew + day scoped**, so day −18 never touches E2's day −14. No new fixture rows, no new codes, no `fixture.json` change. Risk of sharing: Open question 4.
- **Fixture day `dayOffset: -18`** (unused: B 0…−9, C −10, D6 −11, D9 −12, D10 −13, E2 −14). It is inside `maximumDaysForTransferExport = 21`, which `prepareJourneyE2` already gates (fails loudly). The View ▸ Job Cards default range (last 7 days) does **not** contain it, so `scopeToDay` must navigate the calendar.
- **The day: E2's measured shape.** 06:00 → 19:00, `E2 CREW` has no lunch length (asserted by `prepareJourneyE2`), meal 0 → Gross 13 = Net 13 → **8 / 4 / 1**, **320.00** (8×20 + 4×30 + 1×40). Reusing it keeps every bucket non-zero, so `Regular + Overtime + Double = Net` is not vacuous. `Net = Gross − Meals` is trivially true at Meals 0, and the plan says so rather than pretending otherwise.
- **Scenario JSON** `src/data/journey-e/e08-finalize-gross-pay.json`, validated by **`JourneyE8FinalizeCaseSchema`** (`.strict()`) in `journeyEScenario.ts`. It **structurally satisfies `E2Setup`** (`label`, `dayOffset`, `rule.name`, `capture`, `expected.{timeCards, jobCards, hourlyRate, mealMinutes}`), so `prepareJourneyE2` / `seedLongWorkday` take it unchanged.

  ```jsonc
  {
    "workflow": "E8",
    "label": "e08-finalize-gross-pay",
    "dayOffset": -18,
    "rule": { "name": "AG CA 2022", "dailyOvertimeAfterHours": 8, "doubleTimeAfterHours": 12, "overtimeMultiplier": 1.5, "doubleTimeMultiplier": 2 },
    "capture": { "timeIn": { "hour": 6, "minute": 0 }, "timeOut": { "hour": 19, "minute": 0 } },
    "expected": {
      "timeCards": 2, "jobCards": 1, "employees": 1, "pieces": 0, "hourlyRate": 20,
      "grossMinutes": 780, "mealMinutes": 0, "netMinutes": 780,
      "grossHours": 13, "mealHours": 0, "netHours": 13,
      "regularHours": 8, "overtimeHours": 4, "doubleTimeHours": 1, "totalAmount": 320,
      "transferToast": { "jobCards": 1, "timeCards": 2 }
    },
    "report": { "name": "Payroll Summary", "reportName": "JobCardPayrollSummary", "formats": ["excel", "pdf"], "excelFilename": "^Job Card - Payroll Summary .+\\.xlsx$" },
    "testFile": { "exportType": "payroll" },
    "cleanup": [ { "kind": "timeCards", "employeeCodes": ["8017"], "dayOffset": -18, "cardTypes": [0, 1] } ]
  }
  ```

  `superRefine`: `workflow === 'E8'` · `dayOffset === -18` (and explicitly `!== -14`) · `grossMinutes === minutes(timeOut) − minutes(timeIn)` · `netMinutes === grossMinutes − mealMinutes` · `mealMinutes === 0` (E2 CREW carries no lunch, and `prepareJourneyE2` enforces it) · `grossHours/mealHours/netHours === minutes/60` · E2's bucket derivation on **net** hours (`regular = min(net, dailyOT)`, `overtime = min(net, DT) − dailyOT`, `double = net − DT`, each > 0) · `regular + overtime + double === netHours` · `totalAmount === round2(regular×rate + overtime×rate×1.5 + double×rate×2)` · `transferToast.jobCards === jobCards` and `.timeCards === timeCards` · `report.formats` non-empty and includes `excel` · a `timeCards` cleanup step with `dayOffset === -18`. **Reuse** the module's existing `round2` and bucket helpers if E2's schema already has them local; do not import from the D module.
- The spec imports only `@fixtures/base.fixture`, `@data/schemas/journeyEScenario`, `@utils/data/scenarioLoader` and `@utils/journeys/journeyEFlow` (convention, checked by eye; lint is a deny-list).

## Preconditions

- [ ] Everything `prepareJourneyE2` already enforces, unchanged: fixture rows on screen, rule + rate applied on the Job form and read back, crew carries no exercise/break/lunch, picker carries no displacing rate, field carries no conflicting rule, `maximumDaysForTransferExport >= 18` (fail loudly), and the before-phase sweep (crew job cards on day −18, then crew time cards).
- [ ] **Preference gate, read not written:** `viewJobCardsAfterTransfer === true` (true on dev, D5's gate). Fail loudly by name otherwise, because the transfer-landing assertion depends on it.
- [ ] The Transfer grid is scoped by Work Crew before any row is ticked. `selectAllRowsCheckbox` is asserted unchecked.
- [ ] View ▸ Job Cards: Include Exported **off**, Employees chip `All employees`, Crews chip exactly `E2 CREW`, before any number is read.

## API allowances

Every call outside the browser. **Browser-issued requests are user actions and have no row:** `transfer-to-job-cards/analyze` (Analyze click), `…/execute` (Transfer click), `GET job-cards` (Apply Filter / Refresh), `reports/run` / `reports/run-excel` (PDF / Excel), and `job-cards/export-to-accounting/candidates` / `…/test-file` (Test File). They are observed with `waitForResponse`, never issued.

| Step / call | Endpoint | Allowance | Why |
|---|---|---|---|
| E2 setup (reused) | every row of E2's table: `GET preferences`, `GET overtime-rules`, fixture-row GETs, `POST <entity>/{id}/restore`, `GET jobs/{id}`, `GET employees/{id}`, `GET crews/{id}`, `GET fields/{id}` | read / cleanup | unchanged inside `prepareJourneyE2` |
| transfer-landing gate | `GET preferences` → `viewJobCardsAfterTransfer` | read | fail loudly if not true |
| before-phase sweep | `GET job-cards?from&to` → `DELETE job-cards/{id}`; `GET time-cards?from&to` → `DELETE time-cards/{id}` | cleanup | crew + day −18 scoped (`prepareJourneyE2`) |
| punch sync point + record ids | `GET time-cards?from&to` | plumbing read | `seedLongWorkday` — ids for cleanup, never asserted |
| record written card ids | `GET job-cards?from&to` | plumbing read | `commitTransfer` records ids for cleanup; the "Transfer complete" toast is the proof of what was written |
| execute job | `GET` the execute job (inside `commitTransfer`) | plumbing read | `transferRunCounter` for the landing assertion |
| teardown | `GET job-cards/{id}` → `DELETE job-cards/{id}` (rowversion); `DELETE time-cards/{id}`; crew-day sweep | cleanup | `run.cleanup()` from `prepareJourneyE2` |

**No `arrange` row, no configuration row:** E8 creates no reference data of its own and writes no preference. No DB. No UI delete. No `bulk-delete`. No reverse. No export.

**No read is a proof (2026-10-22).** The Ready/Blocking pills, the row Status badges, the "Transfer complete" toast, the Totals bar, the row cells, the Exported column and the re-analyze are the evidence; the earlier `analyze` cross-checks and `GET job-cards/{id}` / `GET time-cards` read-backs were removed.

## Cleanup

Identical to E2's, on day −18. It is wired by `prepareJourneyE2` and registered with `currentScope(testInfo)`, so a timeout still tears down.

| Phase | Step | How |
|---|---|---|
| after, 1 | own job card(s) by id | `GET job-cards/{id}` → `DELETE` with `version`, for every id `commitTransfer` recorded |
| after, 2 | own time cards by id | from `seedLongWorkday`'s recorded ids |
| after, 3 | crew-scoped day −18 sweep | belt to step 2's braces |
| after, 4 | nothing | fixture rows (E2's, protected by `/^E\d{1,2} /`); transfer-run audit row (never reversed); report/download files live in `testInfo.outputPath()` only; Test File writes nothing |

**Budget:** E2's setup path, plus the Transfer screen twice, View ▸ Job Cards, two report runs and one Test File, all with per-action screenshots. `test.slow()` **and** `test.setTimeout(480_000)`.

## Test case

**One workflow, one happy-path test, one runner row, and the id is the workflow id.** This overrides the shared planner agent's generic "edge/negative cases" guidance (JOURNEY profile).

Runner row `src/data/runner/journey-e.csv:9` is a reservation (`E8,E8,E,ui,finalizeGrossPay,…,regression,0,,draft,0`), so this is a flip. **Exactly three cells change:** `jira` → `PET-12673`, `status` → `automated`, `enabled` → `1`. Leave `category=ui` and all other cells. **Flip `enabled` LAST**, after the spec exists. Then `npm run runner:sync && npm run runner:check`.

```ts
test.describe('E8 · Finalize gross pay', { tag: ['@JourneyE', '@E8'] }, () => {
    test('[Payroll] Transfer a crew day cleanly, reconcile its gross pay on View ▸ Job Cards and run the Payroll Summary.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E8' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

`runner:check` allows only `@Journey<X>`/`@<WF>` on describe and the tier chain (+`@Demo`) on tests. **No `@Workflow`.**

The numbered steps are in the suite below.

## Implementation notes for the Generator

- **Flow** `src/utils/journeys/journeyEFlow.ts`: add E8 functions beside E2's and **reuse `prepareJourneyE2`, `seedLongWorkday`, `analyzeCrewDay`, `readDailyOvertime`, and the re-exported `openScopedCandidates` / `commitTransfer`** as-is (the E8 scenario satisfies `E2Setup` and the run satisfies `TransferRun` structurally). New: `assertTransferLandingGate(run, {sessionApi})` · `confirmCrewDayClean(run, {sessionApi, pages}, seed)` (the scoped analyze, the Ready badges via `rowStatusText(id)`, `analyzeCrewDay`, then preview buckets summed + `previewTotals`, back to the Time Cards tab, returning `{candidates, previewSums}`) · `transferCrewDay(run, opts, seed, candidates)` (D5 pattern: start `transferCompleteToast(1, 2).waitFor({timeout:150_000})` **before** `commitTransfer`, then `viewJobCards.waitForTransferLanding()` + `transferRunParam() === transferRunCounter`) · `confirmNothingLeft(run, opts)` (Transfer via menu → `scopeToDay` → `reanalyze()` → own refs ∉ `candidateReferences()` → `analyzeCrewDay` → transferred GET) · `reviewPayrollTotals(run, opts)` · `runPayrollSummary(run, opts, testInfo)` (attach both files with `testInfo.attach`, record `filters` as an annotation) · `testFileIsReadOnly(run, opts)`.
- Do not rename `prepareJourneyE2` or its "E2 teardown" reason strings. Changing a green E2 file for cosmetics is churn.
- **Page objects:** extend `ViewJobCardsPage`; add `ReportDialog.ts` and `TestFileSheet.ts` under `src/pages/processing/`; add `reanalyze()` to `TransferToJobCardsPage`. No `PageObjects` registry change is needed (`viewJobCards` already registered). Locators by test id/role exactly as measured above; numbers by **label/header**, never by index.
- Report requests are browser-issued POSTs: they never pass through `sessionApi`, so `writeGuard` does not see them and **no `allowApiWrites` is needed or allowed** for them.
- Comments: sparse, non-obvious "why" only.

## Validation

- `npm run typecheck`, `npm run lint`
- `npm run runner:sync && npm run runner:check` (after `enabled=1`, flipped last)
- `UI_FIRST_GUARD=enforce npm run test:dev -- tests/web/journey-e-payroll/e08-finalize-gross-pay.spec.ts` (chromium, workers 2)
- `npm run test:dev -- tests/web/journey-e-payroll/e02-california-daily-overtime.spec.ts` (shared flow file and fixture: prove E2 is still green). Also `tests/web/journey-d-office/d05-*.spec.ts` (`ViewJobCardsPage` is D5's page)
- `npm run ui-first:audit` → **0 violations**; `npm run coverage:catalog` → report the E8 delta
- A red `UiFirstViolation` is never healed with an allowance.

## Open questions for the tester

Each is written into the spec as a loud, named assertion. **None is a licence to weaken an expectation.**

- [ ] **1. After the commit, does the Transfer re-analyze still list the crew's two time cards (with Transferred = Yes, not Ready), or drop them?** Not explored: Transfer clicks were out of bounds for this planning pass. The plan asserts only what holds either way: neither own Reference is offered as a candidate (no `Select <ref>` checkbox), the crew analyze reports `plannableTotal === 0`, and the GET reads `transferred === true`. If the rows *are* listed, add the on-screen `Transferred` (col 15) = Yes assertion after the first run. If a listed row is still selectable, that is a product finding, not something to heal.
- [ ] **2. Which `filters` entry carries the Crews chip in `reports/run(-excel)`?** Measured only for Employees (`JobCard.EmployeeCounter`, `displayValue " : B1 ABSENTEE FOUR"`). The plan asserts some entry names `E2 CREW` (by `displayValue`, or `values` containing the crew id) and attaches the full `filters` array. If the report ignores the crew scope, it runs on the whole day: a scope bug, and a WEBPET-2658 504 risk.
- [x] **3. Test File's positive path.** *Decided 2026-10-22 (Gukan): include it, read-only. Assert the total and the no-mutation invariant; never click the download.* Live, the only sampled card fell into "cannot export" (missing Regular Time earning code) with "No job cards in this filter would be written to an export file". `E2 JOB` most likely does the same. When a card *is* exportable and the tenant format is configured, `…/test-file` returns `filename` + `downloadUrl`, i.e. a server-generated file. Is that still "no file written to the accounting system"? The plan never clicks `export-test-file-download` and asserts only the total and the no-mutation invariant. If the answer is "a stored test file is a side effect", drop step 9 to an annotation and defer it wholly to E9.
- [x] **4. Sharing E2's fixture with E2 in the same run (workers 2).** *Decided 2026-10-22 (Gukan): reuse E2's rows. Switch to an own `e8` block only if a run shows the race or the hidden picker.* Warm (dev today), both specs' Job-form setters are read-first no-ops, and their sweeps are day-scoped, so no collision. Cold, both could race to create `E2 CREW` / `E2 PICKER ONE` / `E2 JOB` (duplicate-code 409). Unverified: does the Crew Time Out form for day −18 still offer `E2 PICKER ONE` while E2 holds an open time-in for him on day −14? If either bites, give E8 its own `e8` block (crew/employee/job codes to be probed free, live and recycle bin, per WEBPET-2368).
- [ ] **5. Is the Report dialog shared with View ▸ Time Cards?** Its test ids are generic (`report-close`, `report-params`, `report-export-trigger`…), which suggests yes. Placed in `src/pages/processing/ReportDialog.ts` (journey-only, out of the shared core). Promote it to `src/components/` only when a second screen needs it, and then run both suites' gates.

Items 1 and 3 can change an assertion's shape. 2, 4 and 5 name themselves on a first run.

## Test Scenarios

### 1. E8 · Finalize gross pay (one happy-path test, testCaseId E8, @JourneyE @E8 @Regression)

**Seed:** `tests/seed.spec.ts`

#### 1.1. [Payroll] Transfer a crew day cleanly, reconcile its gross pay on View ▸ Job Cards and run the Payroll Summary.

**File:** `tests/web/journey-e-payroll/e08-finalize-gross-pay.spec.ts`

**Steps:**
  1. 1. Arrange. `loadScenario(JourneyE8FinalizeCaseSchema, testInfo)` → `prepareJourneyE2(scenario, {sessionApi, testInfo, pages})` unchanged: ranch/field, `E2 CREW` → `E2 PICKER ONE` → `E2 JOB` on screen; `AG CA 2022` + Hourly Rate 20 on the Job form, read back; crew/employee/field guards; `maximumDaysForTransferExport >= 18`; before-phase sweep of crew job cards then crew time cards on day −18. Then `assertTransferLandingGate` reads `viewJobCardsAfterTransfer`.
    - expect: The run returns crew/picker/job/day with empty jobCardIds/timeCardIds; cleanup is registered with currentScope before anything is seeded
    - expect: `viewJobCardsAfterTransfer === true`; otherwise the test fails loudly by name, never skips
  2. 2. Seed on screen. `seedLongWorkday(run, …)`: Crew Time In 06:00 on day −18, Phase `E2 JOB`, employees [`E2 PICKER ONE`]; wait (read GET) until the time-in is readable; Crew Time Out 19:00. Ids are recorded before any assertion.
    - expect: Exactly `expected.timeCards` (2) own time cards exist for E2 CREW on day −18, and their ids are in run.timeCardIds
  3. 3. Catalog step 1, before commit. `confirmCrewDayClean`: Transfer to Job Cards via the left menu → `scopeToDay(day)` → Analyze Transfer Candidates → `filterByCrew('E2 CREW')` (via `openScopedCandidates(run, {pages, crew}, seed)`, which refuses foreign References). For each own time card, `rowStatusText(id)`. Then `analyzeCrewDay(run, {sessionApi})`.
    - expect: The candidates are exactly this run's two References; `selectAllRowsCheckbox` is not checked
    - expect: Both own rows' status badge text is exactly `Ready` (crew-scoped; the progress pills count the whole date scope and are not asserted)
    - expect: Crew-scoped analyze: `plannableTotal === 2`, `blocking` is empty
  4. 4. Preview, still before commit. `openJobCardsTab()` → `previewOvertimeBuckets()` (sum over rows) and `previewTotals()` → `openTimeCardsTab()`.
    - expect: 1 preview row, Job contains `E2 JOB`
    - expect: Summed preview: Gross 13 · Meal 0 · Net 13 · Regular 8 · Overtime 4 · Double 1 · Amount 320 (all from scenario.expected); kept as `previewSums` for step 7
    - expect: `previewTotals()` equals `{ pieces: 0, jobCards: 1, employees: 1 }`
  5. 5. Commit. `transferCrewDay`: arm `transferCompleteToast(1, 2).waitFor({timeout: 150_000})` FIRST, then `commitTransfer(run, {sessionApi, pages}, seed, candidates)` (ticks each own Reference, Transfer to Job Cards 2, confirm, records every written id on every poll). Then `viewJobCards.waitForTransferLanding()`.
    - expect: Toast 'Transfer complete — 1 job card written, 2 time cards transferred.' was seen
    - expect: commitTransfer: `jobCardsWritten === 1`, `timeCardsTransferred === 2`; run.jobCardIds holds the one id
    - expect: The URL is `/view/job-cards?…transferRun=N` and `transferRunParam() === result.transferRunCounter`
  6. 6. Catalog step 1, after commit. `confirmNothingLeft`: Transfer to Job Cards via the left menu → `scopeToDay(day)` → `reanalyze()` (waits for the screen's own analyze POST 200) → read `candidateReferences()`. Then `analyzeCrewDay` and the read GET of the two time cards.
    - expect: Neither of this run's References is offered as a candidate
    - expect: Crew-scoped analyze: `plannableTotal === 0`, `blocking` empty
    - expect: Both own time cards read `transferred === true`
  7. 7. Catalog step 2, the totals. `reviewPayrollTotals`: View ▸ Job Cards via the left menu (`viewJobCards.openFromMenu()`) → `scopeToDay(day)` → assert Include Exported off → `applyFilter()` → `filterByCrew('E2 CREW')` → `readTotals()`, `readCounts()`, and the crew row via `rowsForCrew` + `cellByHeader`.
    - expect: Crews chip reads exactly `E2 CREW`; Employees chip reads `All employees`
    - expect: `rowsForCrew('E2 CREW')` has 1 row whose Reference (row aria-label) is the written card's; Employee contains `E2 PICKER ONE`; Job contains `E2 JOB`; Exported cell reads `No`
    - expect: readCounts: records.shown 1, employees.shown 1, pieces.shown 0
    - expect: Totals: gross 13, net 13, meals 0, regular 8, overtime 4, double 1, amount 320.00; firstDate = fixture day as MM/DD/YY
    - expect: Net = Gross − Meals and Regular + Overtime + Double = Net, within 0.0001
    - expect: Each Totals metric equals the corresponding `previewSums` value from step 4
    - expect: The crew row's Regular Hours/Overtime/Double Time/Amount equal the Totals; Pieces 0; Paid Pieces 0 or empty
  8. 8. Catalog step 2, the report. `runPayrollSummary`: `viewJobCards.runReport('Payroll Summary', 'excel')` then `runReport('Payroll Summary', 'pdf')`. Each opens Report (`view-job-cards-print-report`), picks the exact option `Payroll Summary` (the dialog reopens on All Data), leaves the defaults, clicks Excel / PDF, saves the download to `testInfo.outputPath()`, and attaches it. For PDF: verify the viewer, click its Download, then its footer Close.
    - expect: Dialog heading starts `Report: Payroll Summary — `
    - expect: Excel: POST reports/run-excel → 200, content-type spreadsheetml, Content-Disposition attachment; request `reportName === 'JobCardPayrollSummary'`; filters carry From = To = day, `JobCard.Exported` false, and an entry naming E2 CREW; download suggestedFilename matches `^Job Card - Payroll Summary .+\.xlsx$`, saved size > 0
    - expect: PDF: POST reports/run → 200, application/pdf, inline, body length > 0, same filter checks; viewer dialog `Job Card - Payroll Summary — …` with iframe src starting `blob:`; Download yields a `.pdf` with size > 0
    - expect: Report contents are not parsed; the `filters` array is attached as an annotation
  9. 9. Catalog step 3, read-only. `testFileIsReadOnly`: still on the crew-scoped View ▸ Job Cards, `testFile.open()` (Test File button, arms both POSTs) → readSummary/fileState/failureTexts → `dismissResults()` (No) → `close()` → `viewJobCards.refresh()` → re-read the crew row → `GET job-cards/{id}`.
    - expect: Sheet `job-card-analyze-sheet` heading `Test File`, description 'Check which job cards can be exported. No data is changed.', Payroll type active
    - expect: POST job-cards/export-to-accounting/candidates and …/test-file both 200, and their bodies carry this crew's id in `crewIds`
    - expect: ready + cannotExport === 1; the Analyze Results alert reads Correct + Incorrect = 1
    - expect: After Refresh, with Include Exported still off, the crew row is still listed and its Exported cell reads `No`; `GET job-cards/{id}` returns exported falsy
    - expect: The ready/cannot split, file state and failure texts are recorded as `test-file-evidence` annotations only (deferred to E9 / A4)
  10. 10. Read-back + teardown. `readDailyOvertime(run, …)` (annotations), then `await run.cleanup()`.
    - expect: job-card-fields annotation recorded
    - expect: After cleanup, scoped `GET job-cards` and `GET time-cards` for E2 CREW on day −18 are empty
