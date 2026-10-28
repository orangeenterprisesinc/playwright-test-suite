# R2 · Run dialog and report parameters

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `R2` |
| Journey | `R` — Reports |
| Segments | `all` |
| Modules | `Reports` |
| Surface | `ui` → `tests/web/journey-r-reports/` |
| Demo candidate | no |
| Catalog status | draft (source `reports-passfail-2026-08-05.csv`, Jira PET-12682, manual case WEBPET-1841) |

**Summary** (from the catalog)
> Run a report from the hub through its Run dialog: readable parameter labels, a variant picker, date, entity, yes/no and choice parameters, then the PDF viewer.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `R2` |
| This plan | `test-plans/journey-r/r02-run-dialog-and-report-parameters.md` |
| Spec | `tests/web/journey-r-reports/r02-run-dialog-and-report-parameters.spec.ts` |
| Data | `src/data/journey-r/r02-run-dialog-and-report-parameters.json` |
| Runner row | `src/data/runner/journey-r.csv` → `R2` (exists, draft, enabled 0) |

**Why two reports.** I checked about 300 available reports through the meta endpoint and none combines variants whose parameters differ, a single-date field, an entity picker, Yes/No and a dropdown. The smallest set that covers everything, both Job Card and both available on su:
- **Hourly Totals by Field** (`JobCardHourlyTotal`): variants "Hourly Totals by Field" (Show Employee Name on each line, Sort By) and "Hourly Totals by Job" (Show Employee Name on each line only). It has a Yes/No pair and a dropdown.
- **Attendance** (`JobCardAttendance`): Crew entity picker, Hire Date (a range), First and Last Work Date (single dates), Sort Employee By and Included Employees dropdowns, and two number boxes. It ran in about 2 s on su.

"Piece Summary by Employee Detailed" was rejected: switching its variant changes only the title (same 11 parameters) and its date is a range.

## Catalog steps

| # | Manual step (WEBPET-1841) | What the screen does (measured 2026-10-28) | Automatable? |
|---|---|---|---|
| 1 | Click Run on a report with parameters; dialog "Run" + name | Row button "Run <name>" opens `role=dialog` named by its h2 "Run <selected variant name>", with description "Choose how this report should run. The options are the ones the legacy report dialog offered." and footer Cancel / Run. For a variant report the title follows the selected variant; the default variant's name can differ from the hub name (Piece Summary by Employee Detailed opens as "Run Piece Summary by Employee"). | yes |
| 2 | Every parameter has a readable English label; grey description lines read as sentences | `label[data-slot=label][for=<id>]` per parameter. The optional description is the `<p>` right after the label (e.g. "Defines the sorting of the employees in the report"). Yes/No option labels have `for` ending in `-Yes`/`-No`. | yes (exact label list and description text from data) |
| 3 | Report select (variant picker): switching updates the parameter set | `#report-run-variant`, a select-trigger button (accessible name "Report") whose options are the variant names. Picking "Hourly Totals by Job" retitles the dialog and removes "Sort By". | yes |
| 4 | Date parameter holds after clicking elsewhere (single date fields) | `#report-run-FirstDay` / `#report-run-LastDay`: button (`data-slot=date-picker`) reading "Pick a date". It opens a popover with Month / Day / YYYY segment boxes, Previous/Next month buttons, a day grid (cell names like "Tuesday, October 20th, 2026", today prefixed "Today, "), Clear and Close. Clicking a day closes the popover; the button then reads "10/20/2026" and a Clear button appears next to it. It still reads that after clicking the dialog heading. Hire Date (`#report-run-sel-Employee.HireDate`) is a range ("Pick a date range"). | yes |
| 5 | Entity picker: type into "Search…", results come back, select one | `#report-run-sel-employee_crew.CrewCounter`, a typable combobox (name "Crew", placeholder "Search…"). Opening it reads `GET /reports/lookups/crews` (the app's own request). Typing "CREW" lists B1 CREW, C6 CREW, D10 CREW … Picking sets the input to "B1 CREW". | yes |
| 6 | Yes/No renders as a radio pair; fixed choice as a dropdown with legible options | Yes/No: `div#report-run-<Param>[role=radiogroup]` with two `role=radio` named "Yes"/"No" (`aria-checked`), plus hidden native inputs. Fixed choice: select-trigger button (`#report-run-SortBy` etc.) with a listbox of options (Sort By: Export Identifier, Name; Included Employees: All, Qualified, Not Qualified). | yes |
| 7 | Clear a required-looking parameter and Run | — | **no — negative case, out of scope (one happy path)** |
| 8 | Run with valid parameters → "Running..." then PDF viewer | The Run button reads "Running…" (single ellipsis character) for about 2 s; `POST /reports/run` answers 200. The Run dialog closes and a viewer `role=dialog` opens, named "Attendance — 10/28/2026, 3:37:18 PM", holding an `iframe` with a `blob:` src and the same title. Buttons: Full screen, Close (header), Close / Download / Print (footer). The hub row's Last Run changes from "Never" to "10/28/2026, 3:37:20 PM". | yes |
| 9 | Reopen and Cancel → closes without running | Cancel closes the dialog; no `POST /reports/run` is sent (I checked the full request log); Last Run stays the same. | yes |

## Expected outcomes

- Clicking Run on Hourly Totals by Field (For "Job Card") opens a dialog titled "Run Hourly Totals by Field" with the configured description line and Cancel / Run buttons. *Proof: dialog name, description text, buttons.*
- The dialog's parameter labels are exactly "Report", "Show Employee Name on each line", "Sort By" in that order. None looks like a raw identifier (no dots, underscores or camelCase). "Sort By" carries the description "Defines the sorting of the employees in the report". *Proof: label list, description `<p>`.*
- "Show Employee Name on each line" is a radio group of exactly two radios, "Yes" and "No", with "No" checked. Choosing "Yes" checks it and unchecks "No". *Proof: `role=radio` count and names, `aria-checked`.*
- "Sort By" is a dropdown offering exactly "Export Identifier" and "Name". Choosing "Export Identifier" shows it as the value. *Proof: listbox options, trigger text.*
- The Report variant picker offers exactly "Hourly Totals by Field" and "Hourly Totals by Job". Switching to "Hourly Totals by Job" retitles the dialog "Run Hourly Totals by Job" and the labels become exactly "Report", "Show Employee Name on each line" ("Sort By" is gone). *Proof: dialog name; label list.*
- Cancel closes the dialog, sends no run request within the configured window, and the row's Last Run is unchanged ("Never" in a fresh browser). *Proof: dialog hidden; network watch (`page.waitForRequest` must time out); Last Run cell.*
- Clicking Run on Attendance (For "Job Card"; exact name, because "Attendance 1" also exists) opens "Run Attendance" with exactly the configured eight labels, and the configured descriptions on "Sort Employee By" and "Included Employees". *Proof: as above.*
- "First Work Date" and "Last Work Date" are single-date fields reading "Pick a date". Picking a day (offsets −8 and −1 from today) shows that one date (M/D/YYYY, leading zero optional, no range separator). Each date still shows after clicking the dialog heading. "Hire Date" reads "Pick a date range". *Proof: field button text before and after the blur.*
- Typing the configured search text into the Crew picker lists at least one result including "B1 CREW". Picking it sets the picker's value to "B1 CREW". *Proof: listbox options; input value.*
- "Included Employees" offers exactly "All", "Qualified", "Not Qualified". Choosing "All" shows "All". *Proof: options; trigger text.*
- Clicking Run turns the button to "Running…". `POST /reports/run` answers 200, the Run dialog closes, and a viewer opens whose heading starts with "Attendance — " and whose frame shows a `blob:` document. Downloading it from the viewer gives a non-empty file starting with "%PDF". *Proof: button text; viewer heading and iframe src; the downloaded file. The app's response is observed with `page.waitForResponse`, which is not a test API call.*
- After closing the viewer, Attendance's Last Run shows a date-time instead of the value read before the run. *Proof: Last Run cell matches `lastRunPattern` and differs from the value before.*
- Reopening Attendance and clicking Cancel closes the dialog, sends no run request, and leaves Last Run as it was. *Proof: dialog hidden; network watch; Last Run cell unchanged.*
- The response content type of `POST /reports/run` (expected `application/pdf`). — **recorded, not asserted**: I did not measure it. The spec annotates `run-response` with status and content type; the viewer and the %PDF header are the proof.
- Clearing a required parameter and running (manual step 7). — **out of scope: negative case.**
- Whether the description lines are grammatical sentences. — **not judged**: the exact text from data is asserted; grammar is for the reviewer.
- What the PDF contains. — **out of scope**: report-output parity is deferred under the reports strategy (WEBPET-1839, R3–R8).
- Print and Full screen. — **not automatable / not exercised**: Print opens the operating system's print dialog.
- Excel, CSV, Text and XML output. — **not offered here**: the generic Run dialog is PDF-only (catalog variation).
- "Running…" is visible for about 2 s on su. — `(POM)` the run method checks the busy label right after the click and before awaiting the response. If dev becomes fast enough for this to race, report it; do not delete the assertion.

## Screens and page objects

The hub page, registry entry and shared schema file are described once in R1's plan (`test-plans/journey-r/r01-reports-hub-listing-filtering-favorites.md`). R2 adds the two dialog classes and the `ReportDialog` refactor.

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Reports hub | `File ▸ Administration ▸ Reports` | `src/pages/reports/ReportsHubPage.ts` (`pages.reportsHub`) | to write (R1) |
| Run dialog | hub row ▸ Run | **`src/pages/reports/ReportRunDialog.ts`** (`pages.reportsHub.runDialog`) | to write |
| PDF viewer | after Run | **`src/pages/reports/PdfViewerDialog.ts`** (`runDialog.viewer`) | to write, extracted from `src/pages/processing/ReportDialog.ts` |
| Single-date popover | inside the Run dialog | `src/pages/processing/dateRangePopup.ts` | extend: add `pickDayInPopup` |

**`ReportRunDialog`** (constructor `(page)`, holds `PickerComponent` and `viewer: PdfViewerDialog`). Measured locators:
- root: `page.getByRole('dialog', { name: /^Run / })`. The viewer is also a dialog, named "<report> — <timestamp>".
- `title`: `root.getByRole('heading', { level: 2 })`. `description`: `root.locator('[data-slot="dialog-description"]')`.
- `runButton`: `root.getByRole('button', { name: /^(Run|Running…)$/ })`. `cancelButton`: `root.getByRole('button', { name: 'Cancel', exact: true })`.
- `parameterLabels()`: `root.locator('label[data-slot="label"]:not([for$="-Yes"]):not([for$="-No"])')` → `allInnerTexts()`.
- `control(label)`: read that label's `for`, return `root.locator(\`[id="${for}"]\`)`. Ids contain dots (`report-run-sel-TimeCard.DateTime`), so use the attribute selector, never `#id`.
- `descriptionOf(label)`: `labelLocator.locator('xpath=following-sibling::p[1]')`.
- `yesNo(label)`: `control(label)` (the radiogroup) `.getByRole('radio')`. Named "Yes"/"No"; the hidden native inputs are `aria-hidden` and excluded.
- `selectOptions(label)`: click `control(label)`, read `page.getByRole('listbox').getByRole('option')` texts, press Escape. `pickChoice(label, option)`: `picker.pickSelect(control(label), option)`. The variant picker is the same, with label "Report".
- `pickDate(label, dayOffset)`: work out the local date (today + offset), click `control(label)`, popover = `page.getByRole('dialog').filter({ has: page.getByRole('textbox', { name: 'YYYY' }) })`, then `pickDayInPopup(popover, isoDay)`, then click `title` (the "click elsewhere") and expect `control(label)` to match `^0?M/0?D/YYYY$`. Returns the ISO day. Do not import `isoDay` from `@utils/api/*`; lint bans it, so compute the date locally.
- `searchEntity(label, text)`: fill `control(label)` (combobox, placeholder "Search…"), wait for the listbox, return the option texts. `pickEntity(label, option)`: click `getByRole('option', { name: PickerComponent.labelPattern(option) })`, then expect `toHaveValue`.
- `run(saveTo)`: watch `waitForResponse(POST …/reports/run)` (120 s), click Run, expect `runButton` to read "Running…", await the response (fail by name on no response or 504, as `ReportDialog` does), expect root hidden, then `viewer.waitOpen()` and `viewer.download(saveTo)`. Returns `{ status, contentType, viewerHeading, viewerSrc, savedBytes }`.
- `cancel(windowMs)`: arm `page.waitForRequest(POST …/reports/run, { timeout: windowMs })`, click Cancel, expect root hidden, and expect the armed wait to time out. Fail with "Cancel sent POST /reports/run" if it resolves.

**`PdfViewerDialog`** (extracted, keeps the current `ReportDialog` behavior exactly):
- root: `page.getByRole('dialog').filter({ has: page.locator('iframe[src^="blob:"]') })`.
- `waitOpen(timeout = 30_000)` → `{ heading, src, title }`.
- `download(saveTo)` → `{ suggestedFilename, savedBytes }`, by clicking the Download link or button as today.
- `close()`: footer `getByRole('button', { name: 'Close', exact: true }).last()`, then expect hidden.

`ReportDialog.run()`'s PDF branch (lines 97–109) is replaced by `new PdfViewerDialog(page)` calls with identical waits. The Excel branch and `closeIfOpen` stay as they are.

**`dateRangePopup.ts`:** add `export async function pickDayInPopup(popup: Locator, day: string)` reusing the file's `ordinal` and day-cell lookup: up to 12 "Go to the previous/next month" clicks, then click the cell. `pickRangeInPopup` is unchanged.

Placement: `src/pages/reports/` is journey-only, so this is not a shared-core change and the webpet gates are not affected. `processing/ReportDialog.ts` importing `../reports/PdfViewerDialog` is a same-registry import.

## Data

`src/data/journey-r/r02-run-dialog-and-report-parameters.json`, validated by `RunDialogCaseSchema` in `src/data/schemas/journeyRScenario.ts` (shared with R1).

```json
{
  "_notes": [
    "Two reports because no single report on su has variant-changing parameters + single date + entity + Yes/No + choice (surveyed 2026-10-28).",
    "Read-only: a report run writes no records; Last Run is browser-local."
  ],
  "workflow": "R2",
  "hub": { "menuPath": ["File", "Administration", "Reports"], "url": "/settings/reports" },
  "dialog": { "titlePrefix": "Run ", "description": "Choose how this report should run. The options are the ones the legacy report dialog offered.", "rawLabelPattern": "[._]|[a-z][A-Z]" },
  "variantReport": {
    "module": "Job Card", "nameFilter": "Hourly Totals", "report": "Hourly Totals by Field",
    "labels": ["Report", "Show Employee Name on each line", "Sort By"],
    "descriptions": { "Sort By": "Defines the sorting of the employees in the report" },
    "yesNo": { "label": "Show Employee Name on each line", "options": ["Yes", "No"], "default": "No", "pick": "Yes" },
    "choice": { "label": "Sort By", "options": ["Export Identifier", "Name"], "pick": "Export Identifier" },
    "variant": { "label": "Report", "options": ["Hourly Totals by Field", "Hourly Totals by Job"], "switchTo": "Hourly Totals by Job", "labelsAfter": ["Report", "Show Employee Name on each line"] }
  },
  "runReport": {
    "module": "Job Card", "nameFilter": "Attendance", "report": "Attendance",
    "labels": ["Crew", "Hire Date", "Sort Employee By", "First Work Date", "Last Work Date", "Qualified Attendance Percentage", "Number of Available Days Ignored", "Included Employees"],
    "descriptions": { "Sort Employee By": "Defines the sorting of the employees in the report", "Included Employees": "Defines the included employees in the report" },
    "dates": [ { "label": "First Work Date", "dayOffset": -8 }, { "label": "Last Work Date", "dayOffset": -1 } ],
    "singleDatePrompt": "Pick a date",
    "range": { "label": "Hire Date", "prompt": "Pick a date range" },
    "entity": { "label": "Crew", "placeholder": "Search…", "searchText": "CREW", "pick": "B1 CREW" },
    "choice": { "label": "Included Employees", "options": ["All", "Qualified", "Not Qualified"], "pick": "All" },
    "runningText": "Running…",
    "viewerHeadingPrefix": "Attendance — ",
    "pdfMagic": "%PDF"
  },
  "lastRunPattern": "^\\d{1,2}/\\d{1,2}/\\d{4}, \\d{1,2}:\\d{2}:\\d{2}\\s?(AM|PM)$",
  "neverRunText": "Never",
  "noRunWindowMs": 3000,
  "annotations": [
    { "type": "not-asserted", "description": "Manual step 7 (clear a required parameter and Run) is a negative case — out of scope under one-happy-path." }
  ],
  "cleanup": []
}
```

`RunDialogCaseSchema` is `.strict()` with these `superRefine` checks:
- `yesNo.options` is exactly `["Yes","No"]`, and `default` and `pick` are in it and differ.
- each `choice.pick` is in its `options`.
- `variant.switchTo` is in `variant.options` and is not `variantReport.report`.
- `variant.labelsAfter` is a strict subset of `labels`.
- every key of `descriptions` is in `labels`.
- every `dates[].label` is in `runReport.labels` and its `dayOffset` is between -27 and 0, with first < last.
- `entity.pick` contains `entity.searchText` (case-insensitive).
- `report` contains `nameFilter`.
- `lastRunPattern` and `rawLabelPattern` compile.
- `noRunWindowMs` is between 1000 and 10000.

`entity.pick` "B1 CREW" is the permanent Journey B fixture crew (protected by `PROTECTED_NAME_PATTERNS` in `cleanupTargets.ts`).

## Preconditions

- su session with `reports.configure`; the Hourly Totals by Field and Attendance rows are available (have Run). If either row lacks Run, fail by name.
- "B1 CREW" exists. It is a permanent fixture row; if it is missing, `PickerComponent` fails listing the crews it offered. No arrange: the workflow only selects a crew and never creates one.

## API allowances

R2 makes **no test-initiated API call** (no `sessionApi`). Everything happens on screen. The spec only *observes* the app's own traffic with `page.waitForResponse` / `page.waitForRequest`; those are not API calls and need no allowance:
- `GET /reports/config/meta?reportId=…` and `GET /reports/lookups/crews` (dialog open and search).
- `POST /reports/run` (the Run click).

Verify with `UI_FIRST_GUARD=enforce` and `UI_FIRST_READS=ledger`: zero violations and zero test reads.

| Step / call | Endpoint | Allowance | Why | Proof on screen |
|---|---|---|---|---|
| — | — | — | none | — |

## Cleanup

Nothing is created. Running a report writes no record, and Last Run lives in the browser's `localStorage` and is thrown away with the context. `cleanup: []`, no `cleanupTargets.ts` entry. The downloaded PDF goes to `testInfo.outputPath('r02-attendance.pdf')`.

## Test case

`src/data/runner/journey-r.csv` row `R2` already exists (`category ui`, `tags regression`, `jira PET-12682`, `status draft`, `enabled 0`). Finalize after a green run, then `npm run runner:sync && npm run runner:check`.

| id | Title | Tags | enabled |
|---|---|---|---|
| `R2` | Run dialog and report parameters | `regression` | 0 |

```ts
test.describe('R2 · Run dialog and report parameters', { tag: ['@JourneyR', '@R2'] }, () => {
    test('End-to-end: open a report\'s Run dialog, read its labels, switch the variant, use Yes/No, choice, date and entity parameters, run it to the PDF viewer, then reopen and Cancel', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'R2' }],
    }, async ({ pages }, testInfo) => { /* loadScenario(RunDialogCaseSchema, testInfo) … */ });
});
```

Fixture: `@fixtures/base.fixture` (`pages` only). Suggested `test.setTimeout(240_000)`.

Step order:
1. `reportsHub.openFromMenu()`.
2. Filter to `variantReport` (name + module), then `openRun(report)`: title, description, labels, descriptions, raw-label guard.
3. Yes/No: two radios, default checked, pick → checked.
4. Choice: options, pick.
5. Variant: options, switch, new title and `labelsAfter`.
6. Cancel: hidden, no run request, Last Run still "Never".
7. Filter to `runReport` and read the Last Run value before the run.
8. `openRun(report)`, exact name: title, labels, descriptions; Hire Date shows the range prompt.
9. Both dates: "Pick a date" first, then pick each date and check it holds after the blur.
10. Entity: search shows results including the pick; pick it and check the value.
11. Choice: options, pick.
12. `run()`: "Running…", 200, Run dialog hidden, viewer heading prefix, `blob:` src, PDF magic bytes; annotate `run-response` with status and content type.
13. `viewer.close()`; Last Run matches `lastRunPattern` and differs from before.
14. Reopen, `cancel(noRunWindowMs)`; Last Run unchanged.

## Validation

- `npm run typecheck`, `npm run lint`, `npm run runner:check`.
- `UI_FIRST_GUARD=enforce npm run test:dev -- tests/web/journey-r-reports/r02-run-dialog-and-report-parameters.spec.ts`, then `npm run ui-first:audit -- --reads`.
- Regression gate for the `ReportDialog` → `PdfViewerDialog` extraction: `npm run test:dev -- tests/web/journey-e-payroll/e08-finalize-gross-pay.spec.ts` (E8 runs PDF through `ViewJobCardsPage.runReport`).
- R1's spec in the same run (shared hub page and schema).

## Open questions for the tester

None that block. Non-blocking findings:
- [ ] Piece Summary by Employee: the parameter `ShowPiecesDetails` is labelled "Suppress Averages" (label and parameter disagree).
- [ ] For a variant report the dialog title shows the default variant ("Run Piece Summary by Employee"), not the hub row's name ("Piece Summary by Employee Detailed").
