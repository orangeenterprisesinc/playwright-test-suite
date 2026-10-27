# `E11` · Reverse export

## Application Overview

**Revision 1, 2026-10-26. Planned at code level** from the orchestrator's read-only dev probe of File ▸ **Export to Accounting** (v2, `/export-to-accounting`) and File ▸ Administration ▸ Restore or Reverse ▸ **Reverse Payroll Export to Accounting** (`/export-to-accounting/reverse`), plus the QA recording and Datadog evidence of the "Nothing to export" defect. Transfer half reused from E8.

> **Export one crew day, reverse that export, correct a card, export again.** E11 seeds an ordinary 8-hour crew day on screen (E2's crew, picker and job, on day −20) and transfers it (E8's path). On **Export to Accounting** it exports exactly the crew's card for Payroll and proves on View ▸ Job Cards that the card reads **Exported Yes**. It then opens **Reverse Payroll Export to Accounting** and reverses exactly that run. The card reads **Exported No**. E11 corrects it on **Input ▸ Job Card** (Field `B1 FIELD` → `B2 FIELD EAST`), exports again, and proves a new run with the same card count is listed and the card reads Exported Yes.
>
> **Binding safety constraints**
> * Export: **refuse to click** unless the Candidates grid shows only this crew's rows (count = own card count, every Crew cell `E2 CREW`) and the footer reads `Export <own count> JobCards`. A `page.route` guard aborts any export/finalize/reverse POST for a run id this test did not create.
> * Reverse: only the row correlated with this test's run id; the route guard aborts a reverse POST for any other id (`BulkDeleteHistoryPage.undoBatch` pattern).
> * The defect seen on Sycamore2 is **asserted against, never healed around**: a "Nothing to export — no JobCards matched, or all matches were blocked as modified after export." toast, or a Confirm that sends no export request, fails by name.
> * View ▸ Job Cards' Delete ▾ / Export / Clear Export Flag / Recalculate stay unlocated (E8 constraint). The **Test File** button on the export page is not used (E8/E9 own it).
> * Card totals are never edited (an edit after export blocks reverse, M4). The correction is Field only, made **after** the reverse.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `E11` (line 1535) |
| Jira | `WEBPET-2067` · automation ticket `PET-12675` |
| Recording | QA recording of the Sycamore2 1-card Idle Time export (defect evidence only; path from the orchestrator) |
| This plan | `test-plans/journey-e/e11-reverse-export.md` |
| Spec | `tests/web/journey-e-payroll/e11-reverse-export.spec.ts` |
| Scenario | `src/data/journey-e/e11-reverse-export.json` |
| Schema | `journeyEScenario.ts` → new `JourneyE11ReverseExportCaseSchema` |
| Runner row | `journey-e.csv` → `E11` (line 12) |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `E11` |
| Journey | `E` — Weekly payroll close and export |
| Segments | `all` |
| Modules | `Windows` |
| Surface | `ui` — runner category `ui` |
| Demo candidate | no |
| Catalog status | draft |

**Summary**
> Undo a completed export so its job cards can be corrected and re-exported, distinct from simply re-sending the same file. Reversing un-marks the cards; re-sending just pushes the file again.

## Catalog steps

| # | Catalog step | Office surface | Automatable? |
|---|---|---|---|
| 0 | (precondition) a completed export | **File ▸ Export to Accounting**: Payroll toggle → **Dates** ("Pick a date range") = day −20 → **Refresh** (POSTs `…/candidates` and `…/runs`, which creates a DRAFT run; toast "Export run created") → grid **Candidates** (Employee, Date, Status `Pending`, Record Type, Crew, Department, Ranch, Field, Flags) → footer `Famous 120.03 · File output` → **Export 1 JobCards** → dialog "Export 1 JobCard to Famous 120.03 via File output?" → **Export** | **yes, on screen** |
| 1 | Open File → Restore → Reverse Export to Accounting and select the export by date and user. | **File ▸ Administration ▸ Restore or Reverse ▸ Reverse Payroll Export to Accounting**: "Reverse a completed Export to Accounting run…"; table Run date (`dd/mm/yyyy, HH:mm:ss`) · Type (`Payroll`) · Performed by (`Su`) · Job Cards · **Reverse**, newest first | **yes, on screen.** The row is selected by date + user + card count, correlated with the run id captured from the browser's own requests |
| 2 | Confirm; every job card in that export returns to exported-to-payroll = no. | In-page confirm "This will flip 1 Job Card(s) back to not-exported" → **Reverse run** → toast; the row leaves the list. View ▸ Job Cards: Exported **No** | **yes, on screen** |
| 3 | Correct the data and export again. | **Input ▸ Job Card** → day → `Edit Job Card: <ref>` → Field → `B2 FIELD EAST` → Save → reopen and read back. Export again as step 0 → new run on the Reverse list with 1 card; View ▸ Job Cards Exported **Yes**, Field `B2 FIELD EAST` | **yes, on screen** |

## Expected outcomes

- Day −20, E2 CREW, crew time-in 06:00 on `E2 JOB` (AG CA 2022, rate 20), crew time-out 14:00: the transfer shall show "Transfer complete — 1 job card written, 2 time cards transferred." and land with this run's id. View ▸ Job Cards (day, Crews = E2 CREW, Include Exported off) shall show 1 row reading **Regular Hours 8 · Overtime 0 · Amount 160** and **Exported `No`**.
- On Export to Accounting, with Payroll active and Dates = day −20, **Refresh** shall show the toast "Export run created" and a Candidates grid holding exactly 1 row: Crew `E2 CREW`, Employee containing `E2 PICKER ONE`, Status `Pending`, Flags empty. The footer shall read `Famous 120.03 · File output` and the button `Export 1 JobCards`. The draft run id is taken from the browser's `POST …/runs` response and recorded for cleanup before any assertion.
- **Export → confirm** ("Export 1 JobCard to Famous 120.03 via File output?") shall send **at least one export request for the own run id** (path calibrated on the first run, Open question 3) answering 2xx, and shall show a success toast. **"Nothing to export" shall not appear.** Its presence, or the absence of an export request, fails by name: "export defect: Confirm sent no export / Nothing to export (Sycamore2 QA recording, Datadog)". The "N Ready" card shall drop by 1 after a Refresh. Any browser download is saved to `testInfo.outputPath()` and attached.
- View ▸ Job Cards with **Include Exported on** shall list the card with **Exported `Yes`**. Export Identifier and Run Number cells are recorded as `export-evidence`.
- The Reverse page shall list a row with Type `Payroll`, Performed by `Su`, Job Cards `1`, and Run date inside this test's window. It is the newest such row; a newer foreign row is annotated, not refused. **Reverse** shall show "This will flip 1 Job Card(s) back to not-exported". **Reverse run** shall post `…/runs/{own id}/reverse?exportType=payroll` → 200 `{ jobCardsReversed: 1 }`, show a toast, and the row shall leave the list.
- View ▸ Job Cards (Include Exported off) shall list the card again with **Exported `No`**.
- On Input ▸ Job Card, the card's Field shall change from `B1 FIELD` to `B2 FIELD EAST`, save (2xx), and read `B2 FIELD EAST` after a fresh open.
- The **re-export** shall meet the same criteria as the first: a new draft id ≠ the first, an export request for it, success, no "Nothing to export", 1 card. A **new** row (Job Cards 1) shall appear on the Reverse page. View ▸ Job Cards shall show Exported `Yes` and Field `B2 FIELD EAST`.
- **"Re-sending just pushes the file again"** (the variation: network or wrong-folder failure). *— deferred: E9 owns the file and its delivery; a re-send has no distinct UI on v2 (Recent Exports retry is v2 history, not E11).*
- **The export file's contents.** *— deferred to E9 (file) / E10 (identifiers) / A3 (earning codes).*
- **Job Costing (Cost Accounting) reverse.** *— deferred: same route, other export type. One type proves the workflow.*

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| E2 setup, punches, Transfer | as E8 | existing | unchanged (`prepareJourneyE2`, `seedLongWorkday`, `openScopedCandidates`, `commitTransfer`) |
| View ▸ Job Cards | `View ▸ Job Cards` | `ViewJobCardsPage.ts` | **+ `setIncludeExported(on)`** (expandFilter, then toggle the switch only if its state differs, then assert it) |
| **Export to Accounting** | `File ▸ Export to Accounting` (`/export-to-accounting`) | **new** `src/pages/processing/ExportToAccountingPage.ts` | to write. Locators from the measured facts. `ExportDispatchWorkspacePage` (webpet) is reference only: its testids `export-v2-*` may apply, but **verify, never import** |
| **Reverse Payroll Export** | `File ▸ Administration ▸ Restore or Reverse ▸ Reverse Payroll Export to Accounting` (`/export-to-accounting/reverse`) | **new** `src/pages/admin/ReverseExportPage.ts` (beside `BulkDeleteHistoryPage`) | to write |
| Input ▸ Job Card (Edit form) | `Input ▸ Job Card` | `JobCardsPage.ts` | **+ `fieldCombobox`, `readField()`, `changeFieldAndSave(name)`**, the class's first save member, scoped to one card by Reference. The class doc is updated: Delete is never exposed |

**`ExportToAccountingPage`** (BasePage):
- `openFromMenu()`.
- `typeToggle(name: 'Payroll'|'Cost Accounting')` + `activeType()` (shape unmeasured: assert `aria-pressed`/`aria-checked`/`data-state="on"`).
- `readyCount()` (`/^(\d+) Ready$/`).
- `scopeToDay(day)`: "Pick a date range" button → calendar day-cell + collapse guard + Apply. Mirror `ViewJobCardsPage.scopeToDay`; do not refactor it.
- `refresh(): { draftRunId }`: arm `waitForResponse` POST `/export-to-accounting/candidates$` and POST `/export-to-accounting/runs$`; the id is parsed from the runs body (`exportRunCounter|runId|id`; throw listing the keys if none); then toast "Export run created".
- `candidates()` reads `getByRole('grid', { name: 'Candidates' })` rows by header → `{ employee, date, status, recordType, crew, flags }`.
- `exportButton` (`/^Export (\d+) JobCards?$/`) and `exportCount()`.
- `destinationText` (`/Famous 120\.03 · File output/`).
- `exportOwn(ownRunIds, expectedCount)`:
  - refuses unless the roster guard passes;
  - installs the route guard on `**/export-to-accounting/runs/*/**` (abort if the id ∉ own);
  - arms a request collector (every non-GET under `/export-to-accounting/` after the click), an optional download (30 s), and toasts `/^Nothing to export/` and a success toast (text unmeasured; first run calibrates);
  - clicks Export, asserts the dialog text `/^Export (\d+) JobCards? to (.+) via (.+)\?$/` with n = expected, clicks **Export**;
  - returns `{ requests, nothingToExport, successText, download? }`.
- No Test File member.

**`ReverseExportPage`** (BasePage):
- `openFromMenu()`: intro text `/^Reverse a completed Export to Accounting run/` visible.
- `table` = `getByRole('main').getByRole('table')`; columns read by header (Run date, Type, Performed by, Job Cards).
- `rows({ type, performedBy, jobCards })`.
- `parseRunDate(text)` (dd/mm/yyyy, HH:mm:ss local → Date).
- `reverseRun(own: { id, row })`: route guard on `**/export-to-accounting/runs/*/reverse*` aborting other ids → the row's **Reverse** → read the prompt `/This will flip (\d+) Job Card\(s\) back to not-exported/` → arm `waitForResponse` POST `/runs/{id}/reverse` → **Reverse run** → return `{ prompt, status, jobCardsReversed }`.
- `reversedToast` (text calibrated on the first run).

## Data

- **Fixture:** E2's block via `prepareJourneyE2` unchanged (E8's model: it sets E2 JOB to AG CA 2022 / 20, which E2 also sets, and restores). Plus `B2 FIELD EAST` (Journey B `field2`, code 4102) via `ensureFieldOnScreen` under `B1 RANCH`. The Generator verifies that its ranch is B1 RANCH; if not, the Job Card form's Field picker may not offer it (Open question 4).
- **Day −20.**
- **Scenario JSON** (`JourneyE11ReverseExportCaseSchema`; structurally satisfies `E2Setup`):

```jsonc
{
  "workflow": "E11", "label": "e11-reverse-export", "dayOffset": -20,
  "rule": { "name": "AG CA 2022", "dailyOvertimeAfterHours": 8, "doubleTimeAfterHours": 12, "overtimeMultiplier": 1.5, "doubleTimeMultiplier": 2 },
  "capture": { "timeIn": { "hour": 6, "minute": 0 }, "timeOut": { "hour": 14, "minute": 0 } },
  "expected": {
    "timeCards": 2, "jobCards": 1, "employees": 1, "hourlyRate": 20, "mealMinutes": 0,
    "grossHours": 8, "regularHours": 8, "overtimeHours": 0, "doubleTimeHours": 0, "totalAmount": 160,
    "transferToast": { "jobCards": 1, "timeCards": 2 }, "status": "Ready",
    "exportedNo": "No", "exportedYes": "Yes"
  },
  "export": {
    "type": "Payroll", "exportType": "payroll", "candidateStatus": "Pending",
    "destination": "Famous 120.03 · File output",
    "exportButton": "^Export (\\d+) JobCards?$", "confirm": "^Export (\\d+) JobCards? to (.+) via (.+)\\?$",
    "runCreatedToast": "Export run created", "nothingToExport": "Nothing to export"
  },
  "reverse": { "type": "Payroll", "performedBy": "Su", "prompt": "This will flip {n} Job Card(s) back to not-exported", "confirmButton": "Reverse run" },
  "correction": { "fromField": "field", "toField": "field2" },
  "cleanup": [
    { "kind": "timeCards", "employeeCodes": ["8017"], "dayOffset": -20, "cardTypes": [0, 1] },
    { "kind": "restore", "target": "e2JobRuleAndRate" }
  ]
}
```

  `superRefine` rules:
  - `dayOffset === -20`; gross = span; `mealMinutes === 0`; `regular === min(gross, 8)`, `overtime === 0`, `double === 0` (so `gross <= 8`).
  - `totalAmount === round2(regular × rate)`; toast counts equal `jobCards` / `timeCards`; `jobCards === 1`.
  - `fromField !== toField`; the `e2JobRuleAndRate` restore and a −20 `timeCards` step are present.

## Preconditions

- [ ] **Before `prepareJourneyE2`: export-residue heal** (`healExportResidue`). Resolve E2 CREW's id (plumbing read by code). `GET job-cards?from=-20&to=-20&includeExported=true`, filtered to the crew. For each exported card, find its export run (job-card run key, else `GET …/reversible-runs`). Reverse that run under `cleanup` **only if** it holds exclusively this crew's cards on day −20; otherwise fail by name. Then DELETE any own drafts still listed. Reason: `prepareJourneyE2`'s sweeps cannot delete exported cards, and their time cards stay transferred.
- [ ] Everything `prepareJourneyE2` enforces (E8 list), plus `assertTransferLandingGate`.
- [ ] `startedAt` recorded (Reverse row window); session user display name read from `session/me` and compared with `reverse.performedBy` (plumbing; a mismatch fails by name).

## API allowances

Browser-issued and observed (no row): Refresh's `POST …/candidates` and `POST …/runs` (the draft); the export POST(s) after Confirm; the Reverse page's `POST …/runs/{id}/reverse`; the Job Card form's `PUT job-cards/{id}`; Apply/Refresh `GET job-cards`.

| Step / call | Endpoint | Allowance | Why | Proof on screen |
|---|---|---|---|---|
| E2 setup (reused) | E8's rows | read / arrange / cleanup | unchanged | Job form read-back |
| residue heal: exported own cards | `GET job-cards?…&includeExported=true`, `GET …/reversible-runs` | plumbing read | find a killed run's finalized export | — |
| residue heal: reverse / drop | `POST …/runs/{id}/reverse?exportType=payroll`, `DELETE …/runs/{id}` | cleanup | before-phase sweep of a previous run's residue; own crew only | — |
| field2 missing | `POST fields/{id}/restore` | arrange | inside `ensureOnScreen` only | — |
| session user | `GET session/me` | plumbing read | Reverse "Performed by" gate | step 7 row match |
| ids for cleanup | `GET time-cards`, `GET job-cards`, execute job | plumbing read | as E8 | toast / landing |
| own-run correlation | `GET …/reversible-runs` | plumbing read | confirms the own run id is listed and gives its timestamp, so the screen row is chosen by date + user + count | Reverse row + prompt + toast (step 7) |
| teardown: own runs | `GET …/runs/{id}` (status) → `POST …/runs/{id}/reverse` if finalized, `DELETE …/runs/{id}` if draft | cleanup | puts back what the test did on screen; survives a timeout; **runs before card deletes** | — |
| teardown: cards | E2's `DELETE job-cards/{id}`, `DELETE time-cards/{id}`, sweep | cleanup | as E8 | — |

## Cleanup

| Phase | Step | How |
|---|---|---|
| before | export-residue heal | `healExportResidue` (above), before `prepareJourneyE2` |
| after, 1 | own export runs | `run.exportRunIds` (every draft id captured from the browser's `POST …/runs` responses, recorded at capture time): finalized → reverse; draft → DELETE. Registered with `currentScope` **after** `prepareJourneyE2`, so the scope's newest-first drain runs it first |
| after, 2–4 | E2's teardown (job cards by id, time cards, crew-day sweep, `e2JobRuleAndRate` restore) | `run.cleanup()` |
| — | the job card's Field change | gone with the card (deleted) |

## Test case

Runner row `journey-e.csv:12`: `jira` → `PET-12675`, `status` → `automated`, `enabled` → `1` (flip last). Category `ui`.

```ts
test.describe('E11 · Reverse export', { tag: ['@JourneyE', '@E11'] }, () => {
    test('[Payroll] Export a crew day, reverse the export, correct the card and export it again.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E11' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

`test.setTimeout(720_000)`.

## Open questions for the tester

- [ ] **1. Is an `E2 JOB` card exportable at all?** E8's Test File showed a sampled card failing "does not contain the Earning Code for Regular Time". If E2 JOB lacks earning codes, the Candidates row carries a Flag or the export says "Nothing to export", and **E11 cannot pass**. Decide before generating: (a) give `E2 JOB` earning codes on screen (an A3 surface not yet in `JobPage`), or (b) give E11 its own job with codes. The spec fails by name on a non-empty Flags cell before clicking Export.
- [ ] **2. Does a reversed-then-edited card re-export?** The server's "blocked as modified after export" rule (`modifiedAfterExport` exists on the job-card record) may still fire after a reverse. If the re-export answers "Nothing to export", that **is** the catalog's step 3 failing: report it, never heal it.
- [ ] **3. The export request's path and success toast** are unmeasured (the defect is that none is sent). The first run records every non-GET under `/export-to-accounting/` after Confirm and calibrates the path regex and toast text. The assertion "≥ 1 export request for the own id, 2xx" stays.
- [ ] **4. Does `B2 FIELD EAST` belong to `B1 RANCH`?** If not, the correction uses the Ranch + Field pair, and the plan's "Field only" changes to "Ranch + Field".
- [ ] **5. Does File output stream a browser download?** If yes, assert a non-empty file; if not, annotate `no-download`. Calibrate on the first run.
- [ ] **6. Menu path.** The probe gives `File ▸ Administration ▸ Restore or Reverse ▸ …`, while `BulkDeleteHistoryPage` uses `['File','Restore or Reverse','Reverse Multi Delete']`. The Generator uses the measured path and corrects it on the first run if it does not land.

## Dev results (2026-10-26, su, `UI_FIRST_GUARD=enforce`)

- **Red by product:** E11's own card (E11 JOB, Earning Code `RH,,OT,,DT,,RDP,,ODT,,DDT`, tenant `earnDeductionCodeLocation = 3` = Job) is matched by the export but refused: `POST …/export-to-accounting/run` answers 200 with `{"summary":{"matched":1,"exported":0,"failed":1},"failures":[{"reason":"missing_earning_code"}],"nothingToExport":true}`; Test File on the same card says "No Earning Code is configured for this job card". The page shows only "Nothing to export — no JobCards matched, or all matches were blocked as modified after export." — the real reason is hidden. Same symptom as the QA recording (Sycamore2, 10-24). The spec names the server's reason and stops; Reverse, the correction and the re-export are therefore unverified on dev.
- Correction to the earlier note: the browser does send the export request; Datadog simply does not log `POST …/run`.
- Measured: header toggle is a `tab` (`aria-selected`); "Dates" button; past days hold other suites' cards (Journey B's A Kishore on −20), so the export is scoped on screen with Refine ▸ Search by **Job Card Crew** · Contains · Is Value (the D6 criteria builder; the grid's row checkboxes are `checked disabled`); "—" is an empty cell. E2 JOB has no earning code, hence E11 owns `E11 JOB`.
- Runner row parked `automated, enabled 0` until the export defect is fixed.
