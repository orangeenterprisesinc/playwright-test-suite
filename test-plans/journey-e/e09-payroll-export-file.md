# `E9` · Payroll export file

## Application Overview

**Revision 2, 2026-10-27. Planned at code level** (MCP browser unavailable). Sources: the orchestrator's read-only su probes on dev (2026-10-27), the E11 plan, spec and helpers, and E8's Test File sheet. This revision replaces revision 1, which only recorded a verdict.

> **Run the Test File on a two-job crew day, fix the gap it flags on the Job form, export the day and read the file.** E9 seeds one crew day on screen: E2 CREW and E2 PICKER ONE on day −17, split across two of E9's own Time jobs at rate 20. `E9 JOB CODED` runs 06:00–10:00 and has its Earning Code typed on its Job form. `E9 JOB NOCODE` runs 10:00–14:00 and has its Earning Code **cleared on its Job form on every run**, so the gap is always there. E9 transfers the day and opens **Export to Accounting** for that day and crew. Its **Test File** shows 1 ready, 1 cannot export, and a failure about the missing Earning Code. E9 fixes the gap on the Job form and runs Test File again: 2 ready, 0 cannot export. It then exports both cards. **Recent Exports** lists the run with "2 records written". E9 downloads that run's file and checks it holds exactly the two records. View ▸ Job Cards shows both cards as **Exported Yes**.
>
> **Binding safety constraints** (carried from E11)
> * **Export guard.** Export is clicked only if the Candidates grid shows only this crew's rows (count = 2, every Crew cell `E2 CREW`) and the button reads `Export 2 JobCards`. A `page.route` guard aborts any non-GET `…/export-to-accounting/runs/{id}/…` for a run id this test did not create (`exportOwn`).
> * **Download guard.** Only the own run's Recent Exports row is downloaded. The `GET …/export-to-accounting/download/{id}` response must carry the own run id, or the step fails.
> * **Known failure modes fail by name.** A "Nothing to export" toast, a Confirm that sends no export request, or "No export file was stored for this run" each fails by name, quoting the server's `failures[].reason`. None is healed around.
> * **Test File changes nothing.** Its results alert is answered **No** (Yes downloads a client-side log).
> * **Untouched controls.** View ▸ Job Cards' Delete ▾, Export, Clear Export Flag and Recalculate stay unlocated (E8 constraint).
> * **Preferences are read, never written.** The tenant format is a gate.

## Earlier verdict (2026-10-27, revision 1, superseded)

* Revision 1 was a verdict with no spec. Jira `WEBPET-2065` was closed Done on 2026-09-29, although every step was marked Fail at QA on 09-07 and 09-09. Its nine bugs (2702, 2792, 2794, 2796, 2877, 2872, 2873, 2876, 2783) are Done. `WEBPET-2795` (database backup option) is Deferred and is not an automation target.
* On su, E11 measured on 2026-10-26: `POST …/export-to-accounting/run` → `matched 1, exported 0, failed 1, missing_earning_code` for a card whose Job carries `RH,,OT,,DT,,RDP,,ODT,,DDT` with `earnDeductionCodeLocation = 3` (Job). The page shows only "Nothing to export". This is bug draft 4 in `HANDOFF-2026-10-26-E6-E11-E13.md`, not yet filed. web-pet PRs #1504 and #1508 are not a fix.
* **New fact (2026-10-27): this is a regression.** Run 10 (Su, payroll, finalized 2026-10-09, 11 cards, jobs 4000-General / 1031-BED PREP) carries the identical `earnDedCode` string and **did** export on 10-09. So the break falls between 10-09 and 10-26. The candidates are web-pet #1504 and #1508, merged 10-23 and 10-24.
* **Decision (Gukan, 2026-10-27):** E9 is Done, so it is automated on the catalog's claim now. If the product fails on dev, the spec is red by name and the row is parked `automated, enabled 0` with the bug. There will be no verdict-only plan and no assertion healed around a failure.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `E9` (line 1488) |
| Jira | `WEBPET-2065` · automation ticket `PET-12493` |
| Recording | none (E11's Sycamore2 recording shows the export defect only) |
| This plan | `test-plans/journey-e/e09-payroll-export-file.md` |
| Spec | `tests/web/journey-e-payroll/e09-payroll-export-file.spec.ts` |
| Scenario | `src/data/journey-e/e09-payroll-export-file.json` |
| Schema | `src/data/schemas/journeyEScenario.ts` → new `JourneyE9PayrollExportFileCaseSchema` |
| Runner row | `src/data/runner/journey-e.csv` → `E9` (line 10) |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `E9` |
| Journey | `E` — Weekly payroll close and export |
| Segments | `all` |
| Modules | `Windows` |
| Surface | `ui` — runner category `ui` |
| Demo candidate | **yes** (`demo 1` in the CSV → test tag `@Demo`, as E6) |
| Catalog status | draft |

**Summary**
> Generate the payroll file in the customer's accounting format and hand it to the accounting system, which runs its own paycheck calculation. Always preview with a test file first to catch missing earning codes.

## Catalog steps

| # | Catalog step | Office surface (measured 2026-10-26/27) | Automatable? |
|---|---|---|---|
| 1 | Set the format and summary level under Preferences → Accounting (Famous, ADP, DataTech, QuickBooks, Paychex, or Compute; daily or detailed). | The tenant format is read as an **environment gate** and never written: `payrollExportFormat 53` = Famous 120.03, `payrollExportDailySummary 0`, `earnDeductionCodeLocation 3` (Job), `exportToAccountingSelectionByDate true`. The screen proof is the export page footer `Famous 120.03 · File output`. | **gate + on-screen footer.** Writing the format is never done: it is tenant-wide, and E11 shares it. Reading the Preferences ▸ Accounting screen itself is *deferred* (no page object, route unmeasured) |
| 2 | Open Export to Accounting, select the last start date, and filter by employee, crew, department, or ranch. | **File ▸ Export to Accounting** → **Payroll** tab (`aria-selected`) → **Dates** = day −17 → Refine ▸ Search by **Job Card Crew** · Contains · Is Value = `E2 CREW` → **Refresh**. Refresh POSTs `…/candidates` and `…/runs`, which creates a draft and shows the toast "Export run created". The **Candidates** grid follows. | **yes, on screen** (E11's `openFromMenu`, `selectType`, `scopeToDay`, `scopeToCrew`, `refresh`) |
| 3 | Run the Test File and fix any flagged gaps (for example a penalty job missing a regular-time earning code). | The footer's **Test File** opens the `TestFileSheet`: `export-analyze-action` → `job-card-analyze-sheet`. It shows the summary "N ready / N cannot export", `job-card-analyze-failures`, and the results alert "Correct job-cards: X. Incorrect job-cards: Y.". The fix is made on **Setup ▸ Job** ▸ `E9 JOB NOCODE` ▸ Earning Code (`#earnDedCode`). Test File is then run again. | **yes, on screen** |
| 4 | Export; the file is written for the accounting admin to import. | Clicking **Export 2 JobCards** opens the dialog "Export 2 JobCards to Famous 120.03 via File output?". **Export** sends `POST …/run`. **Recent Exports** ("Recent" button) then shows the run's row with "{{count}} records written" and **Download file**, which sends `GET …/export-to-accounting/download/{runId}` (default name `export.txt` in the bundle). | **yes, on screen.** The delivery into the server folder `C:\emptrack\Accounting` is **not automatable** (server-side, no DB or file access from tests). The downloadable copy on Recent Exports is the file the admin receives |

## Expected outcomes

- **Arrange gates.** The tenant gates read `payrollExportFormat 53`, `payrollExportDailySummary 0`, `earnDeductionCodeLocation 3`, `exportToAccountingSelectionByDate true` and `maximumDaysForTransferExport ≥ 17`. Any other value fails by name: `environment-gate: <key>`.
- **Job forms after a fresh load.** `E9 JOB CODED` (4621) reads Overtime Rule `AG CA 2022`, Hourly Rate `20`, Earning Code `RH,,OT,,DT,,RDP,,ODT,,DDT`. `E9 JOB NOCODE` (4622) reads `AG CA 2022`, `20`, and an **empty** Earning Code.
- **Seed.** On day −17, three time cards are seeded on screen for E2 CREW: crew time-in 06:00 on `E9 JOB CODED`, crew time-in 10:00 on `E9 JOB NOCODE` (the job change), and crew time-out 14:00.
- **Transfer.** The transfer shows "Transfer complete — 2 job cards written, 3 time cards transferred." and lands on View ▸ Job Cards with this run's id.
- **View ▸ Job Cards after the transfer** (day, Crews = E2 CREW, Include Exported off): exactly 2 rows. The `E9 JOB CODED` row and the `E9 JOB NOCODE` row each read **Regular Hours 4 · Overtime 0 · Amount 80** and **Exported `No`**.
- **Step 2.** With Payroll selected, Dates = day −17 and the crew criterion set, **Refresh** shows "Export run created". The Candidates grid holds exactly **2** rows, each with Crew `E2 CREW`, Employee containing `E2 PICKER ONE` and Status `Pending`. The footer reads **`Famous 120.03 · File output`** (step 1's proof) and the button reads **`Export 2 JobCards`**. The draft id from the browser's `POST …/runs` is recorded for cleanup before any assertion. The Flags cells are recorded as `export-evidence` and not asserted, because the gap may or may not raise a Flag (unmeasured).
- **Step 3a, Test File before the fix.** The sheet is titled `Test File`. The summary reads **1 ready · 1 cannot export**. The results alert reads **"Correct job-cards: 1. Incorrect job-cards: 1."**. `job-card-analyze-failures` holds a line containing **"does not contain the Earning Code for Regular Time"** (the text measured by E8 for a job with no code; see Open question 3). Results are dismissed with **No** and the sheet is closed. The button still reads `Export 2 JobCards`, because Test File exports nothing.
- **Step 3b, the fix.** On Setup ▸ Job ▸ `E9 JOB NOCODE`, the Earning Code is set to `RH,,OT,,DT,,RDP,,ODT,,DDT` and saved. After a fresh load it reads that value.
- **Step 3c, Test File after the fix.** On a re-opened export page (same scope, Refresh, new draft recorded), Test File reads **2 ready · 0 cannot export** and **"Correct job-cards: 2. Incorrect job-cards: 0."**, with no failure lines.
- **Step 4, export.**
  - **Confirm.** **Export** → the dialog "Export 2 JobCards to Famous 120.03 via File output?" → **Export**.
  - **The request.** At least one export request (`POST …/run`) is sent, answering 2xx.
  - **What the screen must show.** A success toast appears and **"Nothing to export" does not**. If it does, or if no request is sent, the step fails by name: "export defect: … server said {runBody}", quoting `failures[].reason`. The Ready pill then drops below its value before the export.
- **Recent Exports.** It lists the own run (row matched by the own run id) with **"2 records written"**. **Download file** answers `GET …/download/{own id}` 200. A browser download arrives, is saved to `testInfo.outputPath('e09-export.txt')`, is non-empty, and is attached. Its suggested filename is recorded as evidence (`export.txt` per the bundle; not asserted, because #1508 changed file naming). If "No export file was stored for this run" appears, the step fails by name.
- **The file.**
  - **Record count.** It holds exactly **2 record lines**. The record-line pattern is `scenario.file.recordLine` and defaults to every non-blank line (Open question 2).
  - **Employee token.** Both lines carry the same employee token: the value that View ▸ Job Cards' **Export Identifier** cell shows for the crew's cards.
  - **Attached.** The whole file is attached and its lines are annotated as `export-file-evidence`.
- **View ▸ Job Cards with Include Exported on.** Both rows read **Exported `Yes`** with the same hours and amounts. Export Identifier and Run Number are recorded as `export-evidence`.
- **Per-line hours, rate, earning code and the Job's export identifier in the file.** *— deferred: the Famous 120.03 line layout is unmeasured (no file has ever been produced on su). They are recorded as evidence. A3 owns the earning codes and E10 owns the identifier.*
- **Other formats (ADP, DataTech, QuickBooks, Paychex, Compute) and the daily or detailed summary level.** *— not automatable under UI-first: a tenant preference is never written, and E11 shares the tenant's export format.*
- **"A database backup before a large export".** *— not automatable: it is not a PET Web feature (WEBPET-2795 Deferred).*
- **Filtering by employee, department or ranch.** *— deferred: one filter (crew) proves the step. The crew filter is also the export guard.*

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Fixture rows, punches, Transfer | as E6/E13 | existing | unchanged: `ensure*OnScreen`, `crewTimeIn`, `crewTimeOut`, `openScopedCandidates`, `commitTransfer` |
| Setup ▸ Job (edit) | `Setup ▸ Job` | `src/pages/setup/JobPage.ts` | exists. `setOvertimeRule`, `setHourlyRate`, `setEarningCodes` (also used with `''` to clear; Open question 4). No new member for E9 (E10 adds the export identifier) |
| View ▸ Job Cards | `View ▸ Job Cards` | `src/pages/processing/ViewJobCardsPage.ts` | exists: `scopeToDay`, `setIncludeExported`, `applyFilter`, `filterByCrew`, `rowsForCrew`, `readCell`, `readNumber`, `cellByHeader` |
| Export to Accounting | `File ▸ Export to Accounting` | `src/pages/processing/ExportToAccountingPage.ts` | exists. **Gains the members below** |
| Test File sheet | footer button on the export page | `src/pages/processing/TestFileSheet.ts` | exists, unchanged (`open`, `heading`, `readSummary`, `resultsCounts`, `failureTexts`, `dismissResults`, `close`) |

**`ExportToAccountingPage` additions.** Locators are unmeasured until the first run. The webpet `ExportDispatchWorkspacePage` testids are a *reference only* (verify, never import).
- `readonly testFile: TestFileSheet`, created in the constructor. `readTestFile()` uses it instead of creating its own; its behaviour is unchanged.
- `readonly recentButton`. CALIBRATE: `getByTestId('export-v2-history-button').or(getByRole('button', { name: /^Recent/ }))`.
- `readonly recentSheet`. CALIBRATE: `getByTestId('export-v2-history-sheet').or(getByRole('dialog', { name: /Recent Exports/i }))`.
- `readonly noStoredFileText` = `getByText(/No export file was stored for this run/)`.
- `openRecentExports()`: click `recentButton`, then wait until the sheet is visible.
- `closeRecentExports()`.
- `recentRow(runId)`. CALIBRATE: `getByTestId(`export-v2-history-row-${runId}`)`. Never fall back to "the newest row": a missing own row fails by name.
- `recordsWritten(runId): Promise<number>`: parses `/(\d+) records? written/` inside the row.
- `downloadRunFile(runId, saveTo)`:
  - arms `waitForEvent('download')` and `waitForResponse(GET /export-to-accounting/download/(\d+))`;
  - clicks the row's **Download file**;
  - **throws** if the response's id ≠ `runId`;
  - returns `{ stored: boolean, status, path, bytes, suggestedFilename, text }`. `stored: false` when `noStoredFileText` shows instead of a download.

## Data

- **Fixture (`src/data/journey-e/fixture.json` + `journeyEFixture.ts` + `fixture.ts`).** New block `e9` with accessor `journeyE9Fixture()`. Schema: `E9Block = { jobs: { coded: E2Job, nocode: E2Job } }`.
  ```json
  "e9": { "jobs": {
      "coded":  { "code": "4621", "name": "E9 JOB CODED",  "paymentType": "Time", "hourlyRate": 20 },
      "nocode": { "code": "4622", "name": "E9 JOB NOCODE", "paymentType": "Time", "hourlyRate": 20 } } }
  ```
  - Codes 4621–4635 were probed free on 2026-10-27 (4620 is E5's; `/jobs/deleted` is empty).
  - The `E9 ` prefix is protected by `PROTECTED_NAME_PATTERNS /^E\d{1,2} /`.
  - Crew `E2 CREW` 8016 and picker `E2 PICKER ONE` 8017 come from `journeyE2Fixture()`. Ranch and field are `B1 RANCH` / `B1 FIELD`.
  - A new job's Export Identifier defaults to its name (measured on E11 JOB). E9 does not change it.
- **Day −17.** E2 CREW is busy on −14, −18, −19, −20, −21 and the E1/E3 week (−12…−6). Day −17 is free for the crew and inside `maximumDaysForTransferExport 21`.
- **Uniqueness.** Job code and name are unique (409 inline). Fixed codes are safe because the jobs are never deleted.
- **Scenario JSON** (`src/data/journey-e/e09-payroll-export-file.json`, `JourneyE9PayrollExportFileCaseSchema`; it satisfies `EOwnJobsSetup` structurally):

```jsonc
{
  "workflow": "E9", "label": "e09-payroll-export-file", "dayOffset": -17,
  "rule": { "name": "AG CA 2022", "dailyOvertimeAfterHours": 8 },
  "hourlyRate": 20,
  "jobs": { "coded": { "earningCodes": "RH,,OT,,DT,,RDP,,ODT,,DDT" }, "nocode": { "earningCodes": "" } },
  "fix": { "job": "nocode", "earningCodes": "RH,,OT,,DT,,RDP,,ODT,,DDT" },
  "segments": [ { "job": "coded", "start": { "hour": 6, "minute": 0 } }, { "job": "nocode", "start": { "hour": 10, "minute": 0 } } ],
  "timeOut": { "hour": 14, "minute": 0 },
  "gates": { "payrollExportFormat": 53, "payrollExportDailySummary": 0, "earnDeductionCodeLocation": 3, "exportToAccountingSelectionByDate": true },
  "expected": {
    "timeCards": 3, "jobCards": 2,
    "perJob": { "coded": { "hours": 4, "regular": 4, "overtime": 0, "amount": 80 }, "nocode": { "hours": 4, "regular": 4, "overtime": 0, "amount": 80 } },
    "totals": { "hours": 8, "amount": 160 },
    "transferToast": { "jobCards": 2, "timeCards": 3 },
    "exportedNo": "No", "exportedYes": "Yes",
    "testFileBefore": { "ready": 1, "cannotExport": 1, "gapFailure": "does not contain the Earning Code for Regular Time" },
    "testFileAfter": { "ready": 2, "cannotExport": 0 },
    "recordsWritten": 2
  },
  "export": {
    "type": "Payroll", "candidateStatus": "Pending", "destination": "Famous 120.03 · File output",
    "runCreatedToast": "Export run created", "nothingToExport": "Nothing to export",
    "noStoredFile": "No export file was stored for this run"
  },
  "file": { "recordLine": "\\S" },
  "cleanup": [ { "kind": "timeCards", "employeeCodes": ["8017"], "dayOffset": -17, "cardTypes": [0, 1] } ]
}
```

  `superRefine` rules:
  - **Day.** `dayOffset === -17` (E2 CREW's other days are named in the message).
  - **Segments.** Exactly 2, on different jobs, `coded` before `nocode`; starts strictly increase and end before `timeOut`. Each span equals `perJob[job].hours`. `regular === hours ≤ rule.dailyOvertimeAfterHours` and `overtime === 0`.
  - **Amounts.** `amount === round2(hours × hourlyRate)`, and `totals` is the sum of both jobs.
  - **Card counts.** `timeCards === segments + 1`, `jobCards === segments`, and the toast equals both.
  - **The gap.** `jobs.coded.earningCodes` is non-empty and `jobs.nocode.earningCodes === ''` (the gap exists). `fix.job === 'nocode'` and `fix.earningCodes` is non-empty.
  - **Test File counts.** `testFileBefore.ready + cannotExport === jobCards`, `testFileBefore.cannotExport === 1`, `testFileAfter.ready === jobCards`, `testFileAfter.cannotExport === 0`.
  - **Export and file.** `recordsWritten === jobCards`. `file.recordLine` compiles as a RegExp.
  - **Cleanup.** A `timeCards` step with `dayOffset -17` and `employeeCodes ["8017"]` is present, and there is **no** `restore` step: E9's jobs belong to the scenario and are re-armed on screen each run.

## Preconditions

- [ ] **Export-residue heal before the sweeps.** `healExportResidue(crew, day −17)` runs through the new `beforeSweep` hook of `prepareJourneyEOwnJobs`. A killed run can leave the crew's day exported, and the sweeps cannot delete exported cards. The run is reversed only if it holds exclusively this crew's cards of the day; otherwise the step fails by name.
- [ ] **Fixture rows and job forms.** Ranch, field, crew, picker and the two jobs are ensured on screen (`arrange` only inside `ensureOnScreen` when a row is missing or binned). Each job's rule, rate and earning code are set on its Job form and read back after a fresh load (read-first no-op). The **NOCODE job is cleared on every run**, re-arming the gap the previous run fixed.
- [ ] **Fixture gates (`prepareJourneyEOwnJobs`).** The crew has no exercise job, break automation or lunch. The picker has no own rate. The field's overtime rule equals the jobs' rule. `maximumDaysForTransferExport ≥ 17`. `viewJobCardsAfterTransfer true`. `session/me` names the user. Then `assertTransferLandingGate`.
- [ ] **Export gates.** The `gates` keys are read from `GET preferences` and never written. A mismatch fails by name as `environment-gate: <key> reads <v>, E9 needs <w>`. `lockJobCardsAfterExport`, `exportRate`, `exportAmount`, `famousVerifyMinimumWage` and `stateCodeForFamous` are recorded as `preference-evidence`.
- [ ] **`startedAt` recorded.**

## API allowances

Browser-issued and observed, so no row:
- the transfer;
- Refresh's `POST …/candidates` and `POST …/runs`;
- Test File's `POST …/candidates` and `POST …/test-file`;
- `POST …/run` after Confirm;
- `GET …/download/{id}`;
- the Job form's `PUT jobs/{id}`;
- View ▸ Job Cards' `GET job-cards`.

| Step / call | Endpoint | Allowance | Why | Proof on screen |
|---|---|---|---|---|
| fixture lookup | `GET ranches/fields/crews/employees/jobs?code=` (`findByCode`) | plumbing read | `ensureOnScreen` decides create vs reuse | Job form read-back |
| fixture row binned | `POST <entity>/{id}/restore` | arrange | inside `ensureOnScreen` only | — |
| fixture gates | `GET overtime-rules`, `GET crews/{id}`, `GET employees/{id}`, `GET fields/{id}` | plumbing read | fail loudly on a fixture the day's arithmetic cannot tolerate | — |
| tenant gates | `GET preferences` | plumbing read | export format / summary / earning-code location / window gates; never written | step 2 footer `Famous 120.03 · File output` |
| session user | `GET session/me` | plumbing read | user id for the run | — |
| residue heal: find | `GET job-cards?…&includeExported=true`, `GET …/reversible-runs`, `GET …/runs/{id}` | plumbing read | find a killed run's finalized export of the crew's day | — |
| residue heal: reverse | `POST …/runs/{id}/reverse?exportType=payroll` | cleanup | before-phase sweep of a previous run's residue; own crew + day only | — |
| before sweeps | `GET`/`DELETE job-cards/{id}`, `GET`/`DELETE time-cards/{id}` (crew + day) | cleanup | previous run's residue | — |
| seed / transfer ids | `GET time-cards` (poll), transfer execute polls, `GET job-cards` | plumbing read | ids recorded before asserting (as E6/E11) | transfer toast, View ▸ Job Cards |
| teardown: own runs | `GET …/runs/{id}` → `POST …/runs/{id}/reverse` (finalized) / `DELETE …/runs/{id}` (draft) | cleanup | puts back what the test exported on screen; survives a timeout; **runs before card deletes** | — |
| teardown: cards | `DELETE job-cards/{id}`, `DELETE time-cards/{id}`, crew-day sweep | cleanup | own records by id | — |

No `arrange` is declared outside `ensureOnScreen`. No preference is written. No `api-only-evidence`: every outcome is on screen. The `POST …/run` response body is the browser's own traffic and is quoted only to name a failure.

## Cleanup

| Phase | Step | How |
|---|---|---|
| before | export-residue heal | `healExportResidue` via `prepareJourneyEOwnJobs(..., { beforeSweep })` |
| before | crew job cards → declared steps → crew time cards (day −17) | `prepareJourneyEOwnJobs` (unchanged order) |
| after, 1 | own export runs | `run.exportRunIds`: every draft id from the browser's `POST …/runs`, plus the `…/run` body's id if it differs, recorded at capture time. Finalized runs are reversed; drafts are DELETEd. Registered with `currentScope` **after** the own-jobs cleanup, so the newest-first drain runs it first |
| after, 2 | own job cards by id → `timeCards` step → own time cards by id → crew-day sweep | the own-jobs `finishCleanup` |
| — | `E9 JOB NOCODE`'s Earning Code (fixed by the test) | **not restored.** The next run's arrange clears it on screen (scenario-owned job) |
| — | downloaded file | `testInfo.outputPath` only |

| Entity | Table | Name column | Prefix | Id source |
|---|---|---|---|---|
| Time card | `TimeCard` | — | — | `GET time-cards` after seeding (crew + day) |
| Job card | `JobCard` | — | — | transfer execute / landing read |
| Export run | ExportRun | — | — | browser `POST …/runs` response (+ `…/run` body) |

## Test case

Runner row `journey-e.csv:10`: `status` → `automated` and `jira` stays `PET-12493`. `enabled` stays **0** while the export defect stands; it is flipped last, once green on dev. Category `ui`. CSV `tags` = `regression`, `demo` = 1.

```ts
test.describe('E9 · Payroll export file', { tag: ['@JourneyE', '@E9'] }, () => {
    test('[Payroll] Test-file a two-job crew day, fix the missing earning code, export it and read the file.', {
        tag: ['@Regression', '@Demo'],
        annotation: [{ type: 'testCaseId', description: 'E9' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

`test.setTimeout(900_000)` (two jobs × three Job-form saves, two Test Files, export, download; no `test.slow()`).

Spec skeleton:
1. `prepareJourneyE9`: residue heal, fixtures, job forms (NOCODE cleared), gates, sweeps.
2. `assertTransferLandingGate`.
3. `seedJobChangeDay`.
4. `transferExportDay`.
5. `assertOwnCards({ exported: false })`, which returns the employee token.
6. `openCrewExport({ requireNoFlags: false })`.
7. `testFileOnExport(testFileBefore)`.
8. `fixEarningCode`.
9. `openCrewExport({ requireNoFlags: true })`.
10. `testFileOnExport(testFileAfter)`.
11. `confirmCrewExport`.
12. `readRecentExportFile`.
13. `assertFileRecords`.
14. `assertOwnCards({ exported: true })`.
15. `run.cleanup()` in `finally`.

## Files to change

- `src/data/journey-e/fixture.json`, `src/data/schemas/journeyEFixture.ts`, `src/data/journey-e/fixture.ts`: the `e9` block and `journeyE9Fixture()`.
- `src/data/schemas/journeyEScenario.ts`: `JourneyE9PayrollExportFileCaseSchema` and its type.
- `src/data/journey-e/e09-payroll-export-file.json`: new.
- `src/pages/processing/ExportToAccountingPage.ts`: `testFile` member and the Recent Exports members above.
- `src/utils/journeys/journeyEFlow.ts`:
  - **Own-jobs setup.**
    - `EOwnJobSpec` gains `earningCodes?: string` and `exportIdentifier?: string` (E10). They are applied in the per-job Job-form loop with a reopen between setters and a read-back expect.
    - `prepareJourneyEOwnJobs` gains an optional 4th parameter `{ beforeSweep? }`, called just before the before-phase sweeps as in `prepareJourneyE2`.
  - **New export setup.** `prepareJourneyEExport` (wraps own-jobs: residue heal, `gates` read, export-run teardown registered after) plus `prepareJourneyE9`.
  - **`exportCrewDay` split, type-only otherwise.**
    - It is split into `openCrewExport` (lines 419–441, with a `requireNoFlags` option) and `confirmCrewExport` (lines 444–473; it also returns the Confirm-time download and the `…/run` body id).
    - `exportCrewDay` = both, and **E11's behaviour is unchanged**.
    - Types are widened to structural slices (`{ crew, picker, day, exportRunIds }`, `{ label, expected: { jobCards }, export }`).
    - The Flags message no longer names "E11 JOB".
  - **`transferE11Day`.** Its types are widened to any transfer-run shape, or a 6-line `transferExportDay`.
  - **New helpers.** `assertOwnCards`, `testFileOnExport`, `fixEarningCode`, `readRecentExportFile`, `assertFileRecords`.
- `tests/web/journey-e-payroll/e09-payroll-export-file.spec.ts`: new.
- `src/data/runner/journey-e.csv` row 10, then `npm run runner:sync`.

## Open questions for the tester

First-run calibrations. Each one states what the spec asserts regardless.

- [ ] **1. Recent Exports locators and run identity.**
  - **Unmeasured:** the `Recent` button, the sheet, the row testid, the "records written" wording, and whether the Recent row's id is the draft id from `POST …/runs` or a new id in the `…/run` body.
  - **First run:** reads `runIdOf(runBody)` when present and calibrates the locators.
  - **Asserted regardless:** the own run's row reads 2 records written, and the downloaded file's response id is the own id.
- [ ] **2. Famous 120.03 file layout.**
  - **Unmeasured:** header or trailer lines; where the employee, earning code, hours, rate and Job identifier sit.
  - **First run:** attaches the file. The Generator or Healer then pins `file.recordLine` in the JSON (data, not code).
  - **Asserted regardless:** a non-empty file whose record lines number exactly 2 and carry the same employee token the screen shows.
  - **If the Export Identifier cell is blank:** the token is the picker's code `8017` (the card's `code`). Calibrate which one; never both.
- [ ] **3. The NOCODE failure text.**
  - **Measured texts:** E8 measured "does not contain the Earning Code for Regular Time" for a job with a **null** code. E11 saw "No Earning Code is configured for this job card" on a **coded** job (the defect).
  - **First run:** if a cleared (`''`) code renders the second text, pin `gapFailure` to it.
  - **Asserted regardless:** 1 ready / 1 cannot export, and a failure line containing `Earning Code`.
- [ ] **4. Can the Earning Code be cleared to empty on the Job form?** If Save stays disabled, the gap becomes the catalog's own example, "missing a regular-time earning code": NOCODE gets `,,OT,,DT,,RDP,,ODT,,DDT` (empty RH slot). Only the JSON changes. The assertions stay.
- [ ] **5. Does Test File see the Job's fix without a Recalculate?** The card may snapshot the code at transfer. The spec asserts 2 ready / 0 cannot export after the fix. If it still reads 1 / 1, it fails by name: "the Job's earning-code fix is not seen by the transferred card — Recalculate (D6) needed?". That is a **human** decision (does the catalog fix include D6?), never a Healer one.
- [ ] **6. Does Confirm also stream a download?** `exportOwn` captures one if it does, and it is attached as evidence. The Recent Exports download is the asserted file.
- [ ] **7. Day −17 neighbours.** Other journeys use −17 with their own crews. Everything is crew-scoped on screen. If a foreign dangling time-in on −17 makes the transfer write 0 cards (Journey D fixture-day poisoning), move to −15 (JSON + `superRefine` only).

**Needs a human decision before generation:**
- Open question 5's policy: a fix the Test File does not see fails E9 by name. Confirm that this is a product failure and not a missing Recalculate step.
- "No export file was stored for this run" on a File-output tenant fails E9 by name. Confirm that this is a product failure on a Done ticket, not an environment gap of the server folder `C:\emptrack\Accounting`.

## Dev results expected on the first run (2026-10-27 dev build)

- **Most likely red at step 3a or step 4, by product.** E11's coded card got "No Earning Code is configured for this job card" from Test File and `missing_earning_code` from `POST …/run`. So Test File may read **0 ready / 2 cannot export**, and the export may answer `nothingToExport: true`.
- **Soft vs hard assertions.** The Test File count assertions are `expect.soft`, with a message naming bug draft 4 and the 10-09 → 10-26 regression (run 10 exported the same code string; candidates web-pet #1504/#1508). The run therefore reaches the export, whose hard "Nothing to export" assertion stops it and quotes `failures[].reason`.
- **Row and bug.** The row is parked `automated, enabled 0` with bug draft 4 filed. The Recent Exports, file and Exported Yes steps stay unverified on dev until the fix lands.

## Decisions (2026-10-27, Gukan's rule: Done tickets are automated now, product failures are looked at later)

- Open question 5 (fix not seen by Test File): **product failure, fail by name.** No Recalculate is added; the catalog's fix is the Job form.
- "No export file was stored for this run" on this File-output tenant: **fails by name.** Whether it is product or the server folder is decided on the bug, not in the spec.
- Expected first run: red by product (bug draft 4); row parked `automated, enabled 0`, bug filed from the run's evidence.

## Dev results (2026-10-27, su, `UI_FIRST_GUARD=enforce`, bundles `index-Be3btT6B.js` then `index-BQKz7htu.js`)

- **Red by product at the export, as expected.** Steps 1–5 pass on screen (fixture rows, both jobs' rule/rate/code, 3 time cards, transfer toast "2 job cards written, 3 time cards transferred", View ▸ Job Cards 2 × Regular 4 · Amount 80 · Exported No, Candidates 2 rows, footer Famous 120.03 · File output, "Export 2 JobCards").
- **Test File reads 0 ready / 2 cannot export before AND after the fix** — the coded job fails too, with "No Earning Code is configured for this job card" (soft, recorded). The header pill says "2 Ready — Will export on the next run" at the same time, and the sheet's Export file box says "No job cards in this filter would be written to an export file." A null code and a cleared code render the same text; `gapFailure` stays E8's text for the null-code case and is soft.
- **Export → Confirm** sends the request; `POST …/export-to-accounting/run` answers 200 `{"summary":{"matched":2,"exported":0,"failed":2,"truncated":false},"failures":[{"jobCardCounter":…,"reason":"missing_earning_code"},…],"deliveredVia":"download","nothingToExport":true}` and the page shows only "Nothing to export". The spec fails by name quoting this body. `deliveredVia: "download"` is new on the 10-27 bundle: the file is meant to stream as a browser download.
- **Framework fact:** re-opening Test File on the same page serves cached results and never re-POSTs, so `TestFileSheet.open()` (which waits for both POSTs) times out; the evidence-only read in `confirmCrewExport` is skipped after an asserting Test File (`testFileEvidence: false`), and `readTestFile()`'s failure path now closes the sheet with its own Close button (Escape leaves it open and hides the grid).
- Candidates Employee cell renders ": E2 PICKER ONE" (empty identifier prefix); `assertOwnCards` falls back to the picker code when the Job Cards Export Identifier cell is blank.
- Cleanup verified by API read after the runs: no E2 CREW cards or time cards on −17, no draft or finalized own runs.
- **Row:** `automated, enabled 0` until the export defect is fixed (bug draft 4 of 10-26, now with E9's evidence: run 10 exported the same code string on 10-09; every card is refused since at least 10-26, on 10-27's bundle too).
- Unverified on dev until then: Recent Exports locators/wording, the download, the Famous line layout (`file.recordLine` still `\S`).

## Test Scenarios

### 1. E9 · Payroll export file

**Seed:** `tests/seed.spec.ts`

#### 1.1. [Payroll] Test-file a two-job crew day, fix the missing earning code, export it and read the file.

**File:** `tests/web/journey-e-payroll/e09-payroll-export-file.spec.ts`

**Steps:**
  1. Arrange: heal export residue for E2 CREW on day -17, ensure fixture rows on screen, set E9 JOB CODED (rule AG CA 2022, rate 20, Earning Code RH,,OT,,DT,,RDP,,ODT,,DDT) and E9 JOB NOCODE (same rule and rate, Earning Code cleared) on their Job forms, read tenant export gates
    - expect: Both Job forms read back their rule, rate and earning code after a fresh load
    - expect: payrollExportFormat 53, payrollExportDailySummary 0, earnDeductionCodeLocation 3, exportToAccountingSelectionByDate true, maximumDaysForTransferExport >= 17, or fail by name
  2. Seed on screen: crew time-in 06:00 on E9 JOB CODED, crew time-in 10:00 on E9 JOB NOCODE, crew time-out 14:00; transfer the crew day
    - expect: 3 own time cards
    - expect: Toast 'Transfer complete — 2 job cards written, 3 time cards transferred.' and landing with this run's id
    - expect: View > Job Cards: 2 rows, each Regular Hours 4, Overtime 0, Amount 80, Exported No
  3. Export to Accounting: Payroll, Dates = day -17, Job Card Crew = E2 CREW, Refresh
    - expect: Toast 'Export run created'
    - expect: Candidates: exactly 2 rows, Crew E2 CREW, Employee contains E2 PICKER ONE, Status Pending
    - expect: Footer 'Famous 120.03 · File output', button 'Export 2 JobCards'
  4. Test File on the export page; dismiss results with No; close
    - expect: 1 ready · 1 cannot export
    - expect: 'Correct job-cards: 1. Incorrect job-cards: 1.'
    - expect: A failure line containing 'does not contain the Earning Code for Regular Time'
  5. Setup > Job > E9 JOB NOCODE: set Earning Code RH,,OT,,DT,,RDP,,ODT,,DDT, save; reopen the export page scoped as before, Refresh, Test File again
    - expect: The Job form reads the code after a fresh load
    - expect: 2 ready · 0 cannot export, 'Correct job-cards: 2. Incorrect job-cards: 0.', no failure lines
  6. Export 2 JobCards → confirm Export
    - expect: Dialog 'Export 2 JobCards to Famous 120.03 via File output?'
    - expect: POST …/run answers 2xx, a success toast, no 'Nothing to export' (fails by name with failures[].reason)
    - expect: Ready drops
  7. Recent Exports: own run row → Download file
    - expect: Row reads '2 records written'
    - expect: GET …/download/{own id} 200, a non-empty file saved and attached; 'No export file was stored for this run' fails by name
    - expect: Exactly 2 record lines, both carrying the employee token shown on View > Job Cards
  8. View > Job Cards, Include Exported on
    - expect: Both rows Exported Yes with unchanged hours and amounts
