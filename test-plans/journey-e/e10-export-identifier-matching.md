# `E10` · Export-identifier matching

## Application Overview

**Revision 2, 2026-10-27. Planned at code level** (MCP browser unavailable). Sources: the orchestrator's read-only su probes on dev (2026-10-27), the E11 plan and helpers, and the E9 plan (revision 2), which E10 builds on. This revision replaces revision 1, which only recorded a verdict.

> **Export a job by its export identifier, fix the identifier the accounting system rejected, and re-export it.** E10 gives its own Time job `E10 JOB` (4623, rate 20, earning codes typed as in E11) an **Export Identifier that is not its name**: `E10PH1`, set on the Job form on every run. It seeds a crew day on screen (E2 CREW, E2 PICKER ONE, day −16, 06:00–14:00, one card), transfers it and exports it. It downloads the run's file from **Recent Exports** and proves the line carries **`E10PH1`, not `E10 JOB`**. The accounting system then rejects the code, a step outside PET Web. E10 follows the catalog's fix path:
> 1. reverse that export on the Reverse page;
> 2. change the identifier on the Job form to `E10PH2`;
> 3. **re-run the Test File** (1 ready, 0 cannot export);
> 4. export again.
>
> The new file carries **`E10PH2`** and neither `E10PH1` nor the name. View ▸ Job Cards shows Exported Yes.
>
> **E10 does not re-prove E9.** The "Nothing to export" guard, the export guard, the Test File gap and the record count all belong to E9. E10 asserts the identifier and the reverse-fix-re-export loop, and reuses E9's and E11's helpers unchanged.
>
> **Binding safety constraints** (carried from E9 and E11)
> * **Export guard.** Export only the own crew's single row (`exportOwn` roster guard, plus a route guard on foreign run ids).
> * **Reverse guard.** Reverse only the own run (`ReverseExportPage.reverseRun` route guard).
> * **Download guard.** Download only the own run's Recent Exports row (the response id must be the own id).
> * **Known failure modes fail by name.** "Nothing to export", no export request, and "No export file was stored for this run" each fail by name, quoting `failures[].reason`.
> * **The card is never edited.** It is only reversed and re-exported, so `modifiedAfterExport` stays out of play.
> * **Preferences are read, never written.**

## Earlier verdict (2026-10-27, revision 1, superseded)

* Revision 1 was a verdict with no spec. Jira `WEBPET-2066` was closed Done on 2026-09-29: step 1 **passed** QA on 09-04. Steps 2–3 were blocked on the missing Test File button `WEBPET-2702`, since fixed. Side bugs 2706 and 2712 are Done. Runner row `journey-e.csv:11` holds `jira` = `PET-12674`.
* **The rejection lives outside PET Web.** Step 2's "on a rejection" happens in Famous or ADP after the import, and no PET Web screen shows it. PET Web can prove three things:
  * (a) the identifier is a Job-form field of its own, independent of the name;
  * (b) the exported file carries the identifier, not the name;
  * (c) the fix path works.
* (b) and (c) need the file. So E10 is built after E9 on E9's fixtures and helpers, plus E11's reverse helper. Its first dev run was refused like E9's, for the same cause: the blank `B1 FIELD` Export Identifier (see the E9 plan's Root cause). `ensureFieldOnScreen` now repairs it on screen. A spec of (a) alone would prove nothing about export.
* **Decision (Gukan, 2026-10-27):** E10 is Done, so it is automated on the catalog's claim now. If the product fails on dev, the spec is red by name and the row is parked `automated, enabled 0` with the bug.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `E10` (line 1512) |
| Jira | `WEBPET-2066` · automation ticket `PET-12674` |
| Recording | none |
| This plan | `test-plans/journey-e/e10-export-identifier-matching.md` |
| Sibling plans | `test-plans/journey-e/e09-payroll-export-file.md` (helpers, file reader), `test-plans/journey-e/e11-reverse-export.md` (reverse) |
| Spec | `tests/web/journey-e-payroll/e10-export-identifier-matching.spec.ts` |
| Scenario | `src/data/journey-e/e10-export-identifier-matching.json` |
| Schema | `src/data/schemas/journeyEScenario.ts` → new `JourneyE10ExportIdentifierCaseSchema` |
| Runner row | `src/data/runner/journey-e.csv` → `E10` (line 11) |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `E10` |
| Journey | `E` — Weekly payroll close and export |
| Segments | `all` |
| Modules | `Windows` |
| Surface | `ui` — runner category `ui` |
| Demo candidate | no |
| Catalog status | draft |

**Summary**
> Ensure every job's export identifier matches a phase or cost center in the accounting system, the single most common export failure. A mismatch rejects that job's records.

## Catalog steps

| # | Catalog step | Office surface (measured 2026-10-27) | Automatable? |
|---|---|---|---|
| 1 | Confirm each job's export identifier matches the accounting code, not the job name. | **Setup ▸ Job** (`/setup/jobs/{id}`): `#name` "Name *" and **`#exportIdentifier` "Export Identifier"**. The identifier is a text field, editable on edit for su (SU; `allowRecordExportIdModify true`). A new job's identifier defaults to its name (E11 JOB → "E11 JOB"). The Job's identifier is **not** copied onto the job card: `jobCard.exportIdentifier` and `code` are the employee's. | **yes, on screen.** The Job form read-back shows Export Identifier ≠ Name, and the exported file carries the identifier and not the name |
| 2 | On a rejection, either fix the identifier in Pet Tiger and reverse-then-re-export, or add the missing code in the accounting system first. | Reverse on **File ▸ Administration ▸ Restore or Reverse ▸ Reverse Export to Accounting (Payroll)** (E11 `reverseOwnExport`). Fix on the Job form (Export Identifier → `E10PH2`). Re-export on Export to Accounting. | **yes, on screen** for the PET Tiger branch. The rejection itself and "add the code in the accounting system" are **not automatable**: they happen in Famous, outside PET Web |
| 3 | Re-run the test file before re-exporting. | Export page footer **Test File** (`TestFileSheet`, as E9) | **yes, on screen** |
| var. | If job cards were already transferred with a bad identifier, reverse the job cards, fix, re-transfer, then export. | View ▸ Job Cards ▸ Reverse (`guardReversibleRun`, `openReverse`/`confirmReverse`, E6's `reverseOwnPass`) → fix → re-transfer → export | *deferred.* Implemented only if the first working export proves that the identifier is bound at transfer (Open question 2) |

## Expected outcomes

- **Arrange gates.**
  - **Shared with E9:** `payrollExportFormat 53`, `payrollExportDailySummary 0`, `earnDeductionCodeLocation 3`, `exportToAccountingSelectionByDate true`.
  - **E10's own:** `allowRecordExportIdModify true`, `usePreviousJobExportId 0` (an export must not substitute an earlier identifier), `lockJobCardsAfterExport "No"` (reverse and re-export allowed), and `maximumDaysForTransferExport ≥ 16`.
  - **On a mismatch:** the step fails by name, `environment-gate: <key>`. `allowDuplicateJobExportId` is recorded as `preference-evidence`.
- **Catalog step 1, Job form after a fresh load.** `E10 JOB` (4623) reads Name **`E10 JOB`**, Export Identifier **`E10PH1`**, Overtime Rule `AG CA 2022`, Hourly Rate `20` and Earning Code `RH,,OT,,DT,,RDP,,ODT,,DDT`. The flow asserts that the identifier ≠ the name. The Export Identifier input is **enabled**.
- **Seed.** On day −16, two time cards are seeded on screen for E2 CREW: crew time-in 06:00 on `E10 JOB` and crew time-out 14:00. The Crew Time In job option label is recorded as `identifier-evidence` (expected `E10PH1 : E10 JOB`; the picker matches by `labelPattern`).
- **Transfer.** The transfer shows "Transfer complete — 1 job card written, 2 time cards transferred." and lands with this run's id. View ▸ Job Cards (day, Crews = E2 CREW, Include Exported off) shows 1 row reading **Regular Hours 8 · Overtime 0 · Amount 160 · Exported `No`**.
- **First export (E9/E11 path, nothing new asserted).**
  - **Candidates.** Exactly 1 row (Crew `E2 CREW`, Status `Pending`). The footer reads `Famous 120.03 · File output`; the button reads `Export 1 JobCards`.
  - **Confirm.** The dialog reads "Export 1 JobCard to Famous 120.03 via File output?". At least one export request is sent, answering 2xx, with a success toast and no "Nothing to export".
  - **Run id.** The run id is recorded before any assertion.
- **First file.** On Recent Exports, the own run's row reads **"1 record written"** (`/(\d+) records? written/` → 1). **Download file** answers `GET …/download/{own id}` 200. The saved file is non-empty and attached. **It contains `E10PH1` and does not contain `E10 JOB`.**
- **The rejection.** *— not automatable: the accounting system's rejection happens in Famous. The test records `{ type: 'not-automatable', description: 'accounting rejection happens in Famous; E10 acts on it' }` and treats `E10PH2` as the code the accounting system expects.*
- **Catalog step 2, reverse.** The Reverse page lists a row with Type `Payroll`, Performed by `Su`, Job Cards `1`, and a Run date at or after `startedAt − 5 min`. **Reverse** shows "This will flip 1 Job Card(s) back to not-exported". **Reverse run** posts `…/runs/{own id}/reverse` → 200 (`jobCardsReversed 1` when present), a toast appears, and the row leaves the list. View ▸ Job Cards then shows the card as **Exported `No`**.
- **Catalog step 2, fix.** On Setup ▸ Job ▸ `E10 JOB`, Export Identifier is set to `E10PH2` and saved. After a fresh load it reads **`E10PH2`**, and Name still reads **`E10 JOB`**.
- **Catalog step 3.** On the export page (same scope, Refresh, draft recorded), Test File reads **1 ready · 0 cannot export** and **"Correct job-cards: 1. Incorrect job-cards: 0."**, with no failure lines. Results are dismissed with **No** and the sheet is closed.
- **Re-export.** It meets the first export's criteria, and its run id **≠ the first**.
- **Second file.** Recent Exports lists the new run with "1 record written". Its file **contains `E10PH2` and contains neither `E10PH1` nor `E10 JOB`**. If it still contains `E10PH1`, the step fails by name: "the re-export still carries E10PH1 — the identifier looks bound at transfer; the catalog variation (reverse job cards, fix, re-transfer) is the real path — plan decision, not a heal".
- **Final state.** View ▸ Job Cards with Include Exported on shows the card as **Exported `Yes`**.
- **The variation "reverse the job cards, fix, re-transfer, then export".** *— deferred until Open question 2 is settled by a working export.*
- **"Add the missing code in the accounting system".** *— not automatable: outside PET Web.*
- **Cost Accounting (Job Costing) export identifiers.** *— deferred: same Job field, other export type. Payroll proves the workflow.*
- **The export file's layout, record count and earning codes.** *— E9 owns them. E10 asserts only identifier presence and absence.*

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Fixture rows, punches, Transfer | as E9 | existing | unchanged |
| Setup ▸ Job (edit) | `Setup ▸ Job` | `src/pages/setup/JobPage.ts` | **+ export-identifier members (below)** |
| Export to Accounting + Test File + Recent Exports | `File ▸ Export to Accounting` | `ExportToAccountingPage.ts` (+ `TestFileSheet`) | as extended by E9 (`testFile`, `openRecentExports`, `recentRow`, `recordsWritten`, `downloadRunFile`, `closeRecentExports`). No E10 additions |
| Reverse Payroll Export | `File ▸ Administration ▸ Restore or Reverse ▸ Reverse Export to Accounting (Payroll)` | `src/pages/admin/ReverseExportPage.ts` | exists, unchanged |
| View ▸ Job Cards | `View ▸ Job Cards` | `ViewJobCardsPage.ts` | exists, unchanged |

**`JobPage` additions** (pattern: `CrewPage.exportIdentifierInput`; the save dance mirrors `setEarningCodes`):
- `readonly exportIdentifierInput = page.locator('#exportIdentifier')`.
- `readExportIdentifier(): Promise<string>`: waits for Name to hydrate (non-empty), then the input visible, then returns `inputValue()`.
- `setExportIdentifier(value: string): Promise<string>`:
  - read-first no-op;
  - otherwise asserts the input is **enabled**: "Export Identifier is read-only — allowRecordExportIdModify / SU gate";
  - then `fill`, `blur`, waits for Save to be enabled, clicks Save, waits for the unsaved bar to be hidden;
  - `gotoEditById(id, name)`, then returns `readExportIdentifier()`.

## Data

- **Fixture.** New block `e10` with accessor `journeyE10Fixture()`. Schema: `E10Block = { job: E2Job }`, like `E11Block`.
  ```json
  "e10": { "job": { "code": "4623", "name": "E10 JOB", "paymentType": "Time", "hourlyRate": 20 } }
  ```
  - 4623 was probed free on 2026-10-27 (4621/4622 are E9's).
  - The `E10 ` prefix is protected by `/^E\d{1,2} /`.
  - Crew 8016 and picker 8017 come from `journeyE2Fixture()`. Ranch and field are B1 RANCH / B1 FIELD.
- **Day −16.** It is free for E2 CREW inside the 21-day window. D5 uses −16 with its own crew; everything here is crew-scoped on screen.
- **Identifiers.** They are short, alphanumeric and space-free, so a substring search of the file is unambiguous and they cannot equal or contain the name `E10 JOB`. The initial one is re-armed on screen by every run's arrange (read-first no-op), so a killed run that left `E10PH2` heals itself.
- **Scenario JSON** (`src/data/journey-e/e10-export-identifier-matching.json`, `JourneyE10ExportIdentifierCaseSchema`; it satisfies `EOwnJobsSetup` structurally):

```jsonc
{
  "workflow": "E10", "label": "e10-export-identifier-matching", "dayOffset": -16,
  "rule": { "name": "AG CA 2022", "dailyOvertimeAfterHours": 8 },
  "hourlyRate": 20,
  "job": { "earningCodes": "RH,,OT,,DT,,RDP,,ODT,,DDT" },
  "identifiers": { "initial": "E10PH1", "corrected": "E10PH2" },
  "capture": { "timeIn": { "hour": 6, "minute": 0 }, "timeOut": { "hour": 14, "minute": 0 } },
  "gates": {
    "payrollExportFormat": 53, "payrollExportDailySummary": 0, "earnDeductionCodeLocation": 3, "exportToAccountingSelectionByDate": true,
    "allowRecordExportIdModify": true, "usePreviousJobExportId": 0, "lockJobCardsAfterExport": "No"
  },
  "expected": {
    "timeCards": 2, "jobCards": 1, "grossHours": 8, "regularHours": 8, "overtimeHours": 0, "totalAmount": 160,
    "transferToast": { "jobCards": 1, "timeCards": 2 },
    "exportedNo": "No", "exportedYes": "Yes",
    "testFileAfterFix": { "ready": 1, "cannotExport": 0 },
    "recordsWritten": 1
  },
  "export": {
    "type": "Payroll", "candidateStatus": "Pending", "destination": "Famous 120.03 · File output",
    "runCreatedToast": "Export run created", "nothingToExport": "Nothing to export",
    "noStoredFile": "No export file was stored for this run"
  },
  "reverse": { "type": "Payroll", "performedBy": "Su", "prompt": "This will flip {n} Job Card(s) back to not-exported", "confirmButton": "Reverse run" },
  "cleanup": [ { "kind": "timeCards", "employeeCodes": ["8017"], "dayOffset": -16, "cardTypes": [0, 1] } ]
}
```

  `superRefine` rules:
  - **Day.** `dayOffset === -16` (E9 −17, E2 CREW's other days named in the message).
  - **Hours and amount.** `timeIn < timeOut` and `grossHours === span`. `grossHours ≤ rule.dailyOvertimeAfterHours`, `regularHours === grossHours`, `overtimeHours === 0`, and `totalAmount === round2(regularHours × hourlyRate)`.
  - **Card counts.** `timeCards === 2`, `jobCards === 1`, and the toast equals both.
  - **Identifiers.** Both match `/^[A-Za-z0-9]+$/`. `initial !== corrected`, and neither contains the other.
  - **Test File and export.** `testFileAfterFix.ready === jobCards` and `cannotExport === 0`. `recordsWritten === jobCards`.
  - **Job.** `job.earningCodes` is non-empty (without it the export refuses by design and E10 would prove nothing).
  - **Cleanup.** A `timeCards` step with `dayOffset -16` is present, and there is **no** `restore` step.
  - **In the flow, against the fixture:** both identifiers ≠ `journeyE10Fixture().job.name`.

## Preconditions

- [ ] **E9's arrange, through the same `prepareJourneyEExport`.** One job spec: `{ job: { ...journeyE10Fixture().job, earningCodes, exportIdentifier: identifiers.initial } }`. It runs residue heal (crew, −16) → fixtures on screen → sweeps → Job form (rule, rate, earning code, Export Identifier, each read back) → fixture gates → `gates` → session user → export-run teardown registration.
- [ ] **`assertTransferLandingGate`.**
- [ ] **`startedAt` recorded** (Reverse row window).

## API allowances

Browser-issued and observed, so no row:
- the transfer;
- Refresh's `POST …/candidates` and `POST …/runs`;
- Test File's `POST …/candidates` and `POST …/test-file`;
- `POST …/run`;
- `GET …/download/{id}`;
- the Reverse page's `POST …/runs/{id}/reverse?exportType=payroll`;
- the Job form's `PUT jobs/{id}`;
- `GET job-cards`.

| Step / call | Endpoint | Allowance | Why | Proof on screen |
|---|---|---|---|---|
| E9's arrange rows (fixture lookup, binned-row restore, fixture gates, tenant gates, session user, residue heal, before sweeps, seed/transfer ids) | as the E9 plan | plumbing read / arrange (inside `ensureOnScreen` only) / cleanup | unchanged | Job form read-back, transfer toast |
| own-run correlation | `GET …/reversible-runs` | plumbing read | confirms the own run id is reversible before the screen row is chosen by date + user + count (E11) | Reverse prompt, toast and the row leaving the list |
| teardown: own runs | `GET …/runs/{id}` → `POST …/runs/{id}/reverse` / `DELETE …/runs/{id}` | cleanup | puts back what the test exported; **before card deletes** | — |
| teardown: cards | `DELETE job-cards/{id}`, `DELETE time-cards/{id}`, crew-day sweep | cleanup | own records by id | — |

No `arrange` is declared outside `ensureOnScreen`. No preference is written. No `api-only-evidence`: the identifier is proved by the file the screen hands over (Recent Exports ▸ Download file) and by the Job form.

## Cleanup

| Phase | Step | How |
|---|---|---|
| before | export-residue heal (crew, −16) → crew job cards → `timeCards` step → crew time cards | `prepareJourneyEExport` → `prepareJourneyEOwnJobs({ beforeSweep })` |
| after, 1 | own export runs: both exports and every draft. The first is already reversed, so it is skipped by status | `cleanupExportRuns(run.exportRunIds)`, registered after the own-jobs cleanup (drained first) |
| after, 2 | own job cards by id → `timeCards` step → own time cards by id → crew-day sweep | own-jobs `finishCleanup` |
| — | `E10 JOB`'s Export Identifier (`E10PH2` after the test) | **not restored.** The next run's arrange sets `E10PH1` on screen (scenario-owned job) |
| — | downloaded files | `testInfo.outputPath('e10-export-first.txt' / 'e10-export-second.txt')`, attached |

| Entity | Table | Name column | Prefix | Id source |
|---|---|---|---|---|
| Time card | `TimeCard` | — | — | `GET time-cards` after seeding |
| Job card | `JobCard` | — | — | transfer execute / landing |
| Export run | ExportRun | — | — | browser `POST …/runs` (+ `…/run` body) |

## Test case

Runner row `journey-e.csv:11`: `status` → `automated` and `jira` stays `PET-12674`. `enabled` stays **0** until the first green dev run; it is flipped last. Category `ui`. CSV `tags` = `regression`, `demo` = 0.

```ts
test.describe('E10 · Export-identifier matching', { tag: ['@JourneyE', '@E10'] }, () => {
    test('[Payroll] Export a job by its export identifier, reverse it, correct the identifier and export it again.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E10' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

`test.setTimeout(900_000)` (no `test.slow()`).

Spec skeleton:
1. `prepareJourneyE10`.
2. `assertTransferLandingGate`.
3. `assertJobIdentifier(initial)`: catalog step 1, the Job form read.
4. `seedJobChangeDay` (one segment).
5. `transferExportDay`.
6. `assertOwnCards({ exported: false })`.
7. `exportCrewDay('first')`.
8. `readRecentExportFile('first')`.
9. `assertFileIdentifier({ carries: initial, lacks: [jobName] })`.
10. The `not-automatable` annotation for the rejection.
11. `reverseOwnExport`.
12. `assertOwnCards({ exported: false })`.
13. `setJobExportIdentifier(corrected)`.
14. `openCrewExport({ requireNoFlags: true })`.
15. `testFileOnExport(testFileAfterFix)`.
16. `confirmCrewExport('second')`, with the run id ≠ the first.
17. `readRecentExportFile('second')`.
18. `assertFileIdentifier({ carries: corrected, lacks: [initial, jobName] })`.
19. `assertOwnCards({ exported: true })`.
20. `run.cleanup()` in `finally`.

## Files to change

E9's changes come first. E10 adds:
- `src/data/journey-e/fixture.json`, `src/data/schemas/journeyEFixture.ts`, `src/data/journey-e/fixture.ts`: the `e10` block and `journeyE10Fixture()`.
- `src/data/schemas/journeyEScenario.ts`: `JourneyE10ExportIdentifierCaseSchema` and its type.
- `src/data/journey-e/e10-export-identifier-matching.json`: new.
- `src/pages/setup/JobPage.ts`: `exportIdentifierInput`, `readExportIdentifier`, `setExportIdentifier`.
- `src/utils/journeys/journeyEFlow.ts`:
  - **New helpers.** `prepareJourneyE10`, `assertJobIdentifier`, `setJobExportIdentifier`, `assertFileIdentifier`.
  - **`reverseOwnExport`.** Types widened to structural slices (`run: { startedAt }`; scenario `{ label, expected: { jobCards }, reverse }`), behaviour unchanged.
  - **Reused from E9.** The `EOwnJobSpec.exportIdentifier` application, added by E9's change.
- `tests/web/journey-e-payroll/e10-export-identifier-matching.spec.ts`: new.
- `src/data/runner/journey-e.csv` row 11, then `npm run runner:sync`.

## Open questions for the tester

First-run calibrations. Each one states what the spec asserts regardless.

- [ ] **1. Does a Famous 120.03 payroll line carry the Job's export identifier at all?**
  - **Unmeasured:** no file has ever been produced on su.
  - **Asserted regardless:** file 1 contains `E10PH1` and not `E10 JOB`.
  - **If file 1 contains neither:** the step fails by name, "the payroll file carries no Job identifier". Whether that is a product gap or a property of the format is a **human** decision. A Healer must not swap in another token.
- [ ] **2. Is the identifier read at export time or bound at transfer?**
  - **Measured:** the card stores the *employee's* identifier, so export-time is likely.
  - **The spec implements the catalog's primary path** (reverse export → fix → Test File → re-export).
  - **If file 2 still carries `E10PH1`:** it fails by name and names the variation. Switching to "reverse the job cards, fix, re-transfer, export" needs a plan revision and a human decision. The building blocks exist (`guardReversibleRun`, `view.openReverse`/`confirmReverse`, `transferExportDay`).
- [ ] **3. Field width.**
  - **Unmeasured:** the Famous phase or cost-centre width.
  - **If the identifier is truncated or padded:** change the identifiers in the JSON (keep them alphanumeric and distinct).
  - **Asserted regardless:** presence of the corrected identifier and absence of the old one.
- [ ] **4. "records written" wording.** The bundle's i18n is "{{count}} records written". It may pluralise to "1 record written". The regex `/(\d+) records? written/` covers both. Asserted: the count is 1.
- [ ] **5. Recent Exports locators and run identity.** As E9 Open question 1. They are shared members, calibrated once.
- [ ] **6. Day −16 neighbours.** Day −16 is shared with D5 (own crew). If a foreign dangling time-in makes the transfer write 0 cards, move to −13 (JSON + `superRefine`). E9's fallback is −15, so the two never collide on E2 CREW.
- [ ] **7. The picker label after an identifier change.** Crew Time In may offer `E10PH1 : E10 JOB`. `PickerComponent.labelPattern` matches the name tail, and `assertOwnCards` matches the Job cell with `toContain(name)`. The label is recorded as evidence only.

**Needs a human decision before generation:**
- Open question 1's policy: a payroll file without the Job identifier fails E10 by name. Confirm, or rule that Famous 120.03 carries no phase and that E10 then needs another format (a tenant preference, which is never written, so it would become a gate).
- Open question 2's policy: if the identifier is bound at transfer, is the variation the spec's path from then on? The spec now fails by name and does not branch.

## Dev results expected on the next run (after the Field Export Identifier repair)

- **The first export should write 1 record.** E9's arrange repairs `B1 FIELD`'s blank Export Identifier on its Field form. The `missing_earning_code` refusal was that problem, mislabelled.
- **First-run calibrations remain:** Open questions 1–5. The S1 Famous line is fixed-width with the field id and crew near the end, so the Job identifier's position is read from the attached file.
- **Row.** `automated, enabled 0` until green on dev.

## Decisions (2026-10-27, Gukan's rule: Done tickets are automated now, product failures are looked at later)

- No Job identifier in the Famous 120.03 file: **fails by name**; a format change would be a preference write, so it stays a bug/gate question outside the spec.
- Second file still shows `E10PH1` (identifier bound at transfer): **fails by name, no branch.** The catalog's reverse-job-cards path becomes a plan revision only after that run proves it.
- Expected next run: green with E9 once the Field Export Identifier is repaired; row `automated, enabled 0` until then.

## Dev results (2026-10-27, su, `UI_FIRST_GUARD=enforce`, bundle `index-BQKz7htu.js`)

- Steps 1–4 pass on screen: `E10 JOB` reads Export Identifier `E10PH1` after a fresh load (set on the Job form), 2 time cards, transfer "1 job card written, 2 time cards transferred", View ▸ Job Cards Regular 8 · Amount 160 · Exported No, Candidates 1 row, "Export 1 JobCards".
- **Red by product at the first export:** `POST …/run` → `{"summary":{"matched":1,"exported":0,"failed":1},"failures":[{"jobCardCounter":…,"reason":"missing_earning_code"}],"deliveredVia":"download","nothingToExport":true}` — Datadog shows the refusal is provider `famous-120-3`'s "Field: Export Identifier can not be empty." (card 10450): the blank `B1 FIELD` identifier, mislabelled. Fails by name. Reverse, the identifier fix, the second Test File and the re-export are unverified on dev.
- Cleanup verified by API read: no cards, time cards or runs left on −16. Row `automated, enabled 0` until green on dev.

## Test Scenarios

### 1. E10 · Export-identifier matching

**Seed:** `tests/seed.spec.ts`

#### 1.1. [Payroll] Export a job by its export identifier, reverse it, correct the identifier and export it again.

**File:** `tests/web/journey-e-payroll/e10-export-identifier-matching.spec.ts`

**Steps:**
  1. Arrange via prepareJourneyEExport: residue heal for E2 CREW on day -16, fixtures on screen, E10 JOB (4623) rule AG CA 2022, rate 20, Earning Code RH,,OT,,DT,,RDP,,ODT,,DDT and Export Identifier E10PH1 on its Job form; read export gates
    - expect: Job form after a fresh load: Name 'E10 JOB', Export Identifier 'E10PH1' (differs from the name), input enabled
    - expect: allowRecordExportIdModify true, usePreviousJobExportId 0, lockJobCardsAfterExport No and E9's format gates, or fail by name
  2. Seed on screen: crew time-in 06:00 on E10 JOB, crew time-out 14:00; transfer the crew day
    - expect: Toast 'Transfer complete — 1 job card written, 2 time cards transferred.'
    - expect: View > Job Cards: 1 row, Regular Hours 8, Overtime 0, Amount 160, Exported No
  3. Export to Accounting (Payroll, day -16, Job Card Crew = E2 CREW): Refresh, Export 1 JobCards, confirm
    - expect: Exactly 1 own candidate, footer 'Famous 120.03 · File output'
    - expect: Export request 2xx, success toast, no 'Nothing to export' (fails by name with failures[].reason)
  4. Recent Exports: own run row → Download file
    - expect: '1 record written'
    - expect: The file contains 'E10PH1' and does not contain 'E10 JOB'
  5. Reverse Payroll Export to Accounting: reverse the own run
    - expect: Prompt 'This will flip 1 Job Card(s) back to not-exported'
    - expect: POST …/runs/{own id}/reverse 200, toast, row leaves the list
    - expect: View > Job Cards: Exported No
  6. Setup > Job > E10 JOB: Export Identifier → E10PH2, save
    - expect: Fresh load reads Export Identifier 'E10PH2', Name still 'E10 JOB'
  7. Export to Accounting (same scope): Refresh, Test File
    - expect: 1 ready · 0 cannot export, 'Correct job-cards: 1. Incorrect job-cards: 0.', no failure lines
  8. Export again; Recent Exports: new run row → Download file
    - expect: A new run id differing from the first, 2xx, success, no 'Nothing to export'
    - expect: The file contains 'E10PH2' and contains neither 'E10PH1' nor 'E10 JOB' (still E10PH1 fails by name naming the catalog variation)
  9. View > Job Cards, Include Exported on
    - expect: The card reads Exported Yes
