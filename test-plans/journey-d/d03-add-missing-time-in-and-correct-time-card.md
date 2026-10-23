# `D3` · Add missing time-in and correct time card

> **Fix the exception on the time card, not the job card.** D3 imports a device Time In that is
> missing its Ranch, Field and Job, together with a matching Time Out. The Transfer screen flags that
> Time In as **Blocking**, with two issues: missing Field and missing Job/Phase. The operator opens the
> record, fills in the missing values in the **Time In** side panel and saves. The spec proves on
> screen that the record re-analyses to **Ready**, is marked **Manually edited**, and that the Blocking
> pill drops by exactly the two issues. It also proves over a read-only GET that the correction landed
> on the time card and that no job card was written. Nothing is transferred.
>
> **Binding safety constraints** (inherited from D9):
> * Nothing is ticked and nothing is committed. The header **"Select all rows"**, the per-row
>   **"Delete Time Card ..."**, the toolbar **Reverse** and the **Transfer to Job Cards** commit button
>   are never touched. The panel's **Delete** button is never touched either.
> * The grid is scoped to the fixture day **and** to `D3 CREW` with the Work Crew filter. The
>   roster guard must see exactly this run's two References before the panel is opened.
> * The only record edited is this run's own imported Time In, by id. No existing dev record is
>   changed.

Source: QA re-test of WEBPET-2048 (Gukan, 2026-10-13, client 3 / QA Admin), with its happy-path
recording `d3-correct-time-card-happy-path-2026-10-13.mp4` attached to the ticket. The office surface
was checked live on `su` on 2026-10-13 using the **Add Time-In** dialog, which was discarded without
saving.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `D3` |
| Jira | `PET-12662` — [D3] Add missing time-in and correct time card |
| Recording | WEBPET-2048 attachment `d3-correct-time-card-happy-path-2026-10-13.mp4` |
| This plan | `test-plans/journey-d/d03-add-missing-time-in-and-correct-time-card.md` |
| Spec | `tests/web/journey-d-office/d03-add-missing-time-in-and-correct-time-card.spec.ts` |
| Scenario | `src/data/journey-d/d03-add-missing-time-in-and-correct-time-card.json` |
| Runner row | `src/data/runner/journey-d.csv` → `D3` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `D3` |
| Journey | `D` — Daily office processing (the engine) |
| Segments | `all` |
| Modules | `Windows` |
| Surface | `ui` — spec in `tests/web/journey-d-office/`; runner category `ui` |
| Demo candidate | **yes** (`demo=1` in the CSV → the test carries `@Demo`) |
| Catalog status | ticketed (PET-12662) |

**Summary** (from the catalog)
> Fix the flagged exceptions on the time card tab. Corrections are made on time cards, never job
> cards, so they survive a re-transfer.

## Catalog steps

| # | Catalog step | Office surface (WEBPET-2048 re-test + live 2026-10-13) | Automatable? |
|---|---|---|---|
| 1 | Select the record showing the exception. | **Transfer to Job Cards** `/transfer-to-job-cards`. Scope the day, **Analyze Transfer Candidates**, then Work Crew = `D3 CREW`. The imported Time In row shows Status **Blocking**, and its Field / Job / Ranch cells show `—`. The header pill reads `N Blocking` (2 per such Time In). The footer banner reads `N blocking issues to resolve before transfer`. Clicking the row's Reference opens the **Time In** side panel. | **yes** |
| 2 | Right-click **Add Time In** (the template inherits crew/date/employee). | Not what the re-test does. The re-test **edits the existing blocking Time In** instead of adding a new one. The new-record path is toolbar **New record ▸ Add Time-In**, which opens a separate dialog `"Add Time-In"`. | **no — deferred:** the spec mirrors WEBPET-2048's edit-in-place path. See Scope. |
| 3 | Set the time and the missing field/job, then save. | In the panel, set **Ranch \*** = `B1 RANCH`, then **Field \*** = `B1 FIELD`, then **Phase \*** = `D3 JOB`. Field stays disabled until a Ranch is set. Before the fix the Field shows `Select Field` and *This field is required*. The footer is Delete / *Unsaved changes* / *1 error* / Discard changes / **Save**. Clicking Save shows the toast **"Time In record saved"**, and the grid re-analyses on its own (*Analyzing...*). | **yes** |
| 4 | Confirm the exception clears. | The row now reads Status **Ready**, with a **Manually edited** pill in the same cell. Its Field / Job / Ranch cells carry the new values. The Blocking pill drops by 2, and Ready rises by the number of own rows that turned Ready. | **yes** |

## Scope

**In:** one happy path: the edit-in-place correction of one imported blocking Time In, as in the
WEBPET-2048 re-test.

**Out (deferred, each a separate ticket if wanted):**
- The catalog's step 2 as written: right-click / **New record ▸ Add Time-In** with an inherited template.
- The catalog variations **add meal return** and **delete duplicate**. The duplicate variation would
  also require a delete, which this suite's safety constraints forbid on the Transfer grid.
- **Survives a re-transfer.** D4/D5 own the transfer and the reverse. D3 commits nothing.

## Expected outcomes

- When a device envelope delivers one Time In for `D3 PICKER ONE` on `D3 CREW` that carries **no
  Ranch, Field or Job**, plus a matching Time Out, the office stores the Time In with
  `fieldCounter`, `jobCounter` and `ranchCounter` all **null** and `programCreated === true`. This is
  asserted by `deliverAndVerifyCards`. It also proves the importer did not back-fill a default context,
  which would make the test vacuous.
- When the Transfer screen is scoped to the fixture day and to `D3 CREW`, it offers exactly the
  run's two References. The Time In row reads Status **Blocking**, and its Field (7), Job (8) and
  Ranch (11) cells read `—`.
- Before the correction, the footer banner reads **`<B> blocking issues to resolve before transfer`**,
  where `<B>` is the Blocking pill's value and `<B> >= 2`.
- When the row's Time In panel is opened, Ranch is unset, the **Field** combobox is disabled with the
  hint *Select a Ranch first*, and the Phase input is empty. (*This field is required* only appears
  once a field is touched, which is what the re-test frame showed; first run 2026-10-13.)
- When Ranch, Field and Phase are set to `B1 RANCH` / `B1 FIELD` / `D3 JOB`, the panel's **Save** is
  enabled and no *error* chip is shown. After clicking Save, the toast **"Time In record saved"**
  appears.
- After the automatic re-analyse settles, the Time In row's status badge reads **Ready**. The same
  Status cell carries the **Manually edited** pill. The row's Field / Job / Ranch cells read
  `B1 FIELD` / `D3 JOB` / `B1 RANCH`.
- The Blocking pill reads exactly `<B> - 2`: the two issues of the one fixed Time In are gone.
- The Ready pill rises by exactly the number of this run's rows whose badge changed from non-Ready to
  Ready (at least 1, the Time In). The pills count the whole date scope, not the crew filter, so the
  delta is the faithful assertion.
- The footer banner reads `<B - 2> blocking issues ...`, or is gone when that number is 0 (the
  expected state on `su`, where day -15 has no other eligible rows).
- `GET time-cards/{timeInId}` returns `ranchCounter` = B1 RANCH id, `fieldCounter` = B1 FIELD id and
  `jobCounter` = D3 JOB id. `employeeCounter`, `crewCounter` and `dateTime` are unchanged, and
  `transferred` is false. The correction lives on the time card.
- `GET job-cards?from=day&to=day`, filtered to `D3 CREW`, returns **no** cards. The correction wrote
  no job card. This is the catalog's "never on job cards".
- The Time Out row's status before and after.
  _— not asserted: depends on pairing rules (it showed Warning in the re-test, with 3 Time Ins and
  1 Time Out). It is read and recorded as an annotation only._
- The row turning the **Manually Edited Records** legend colour (magenta).
  _— not automatable as stated: the colour comes from the tenant-configurable
  `grid-row-colors`. The **Manually edited** pill is the same fact in text and is asserted._
- The Issues panel's group titles for missing Field / Job.
  _— deferred: the titles were not confirmed live on `su`. `issueGroupTexts()` is attached as
  evidence, not asserted._
- The panel's on-blur validation and the *Unsaved changes* bar.
  _`(POM)` — relied on by the correction helper. Only the required-error state and the enabled Save
  are asserted._
- The setup forms' on-blur validation and Save-stays-disabled behaviour.
  _`(POM)` — exercised through `ensureOnScreen`._

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Setup ▸ Crew / Employee / Job | `/setup/crews\|employees\|jobs/new` | `CrewPage` / `EmployeePage` / `JobPage` via `src/utils/fixtureRows/ensureOnScreen.ts` | exists |
| Connectivity ▸ Import ▸ Internet | left nav | `pages.importInternet` via `deliverAndVerifyCards` (`src/utils/api/officeVerification.ts`) | exists. The import click stays on screen |
| Transfer to Job Cards — Time Cards tab + **Time In panel** | `/transfer-to-job-cards` | `src/pages/processing/TransferToJobCardsPage.ts` | **extended** (below) |

### `TransferToJobCardsPage` additions (measured live 2026-10-13 unless marked)

| Member | Locator / behaviour |
|---|---|
| `blockingCount(): Promise<number>` | `getByTestId('v2-progress-pill-blocking')` innerText is `"6\nBlocking"`. Parse the **leading** integer, stripping commas. **Do not** reuse `counterCount`: its `/\((\d+)\)/` does not match these pills. NaN until rendered, so a poll keeps waiting. |
| `readyCount(): Promise<number>` | Same parsing on `v2-progress-pill-ready` (e.g. `20109` in the re-test, so strip commas). |
| `blockingBanner: Locator` | `pageRoot.getByText(/^\d+ blocking issues? to resolve before transfer$/)` |
| `rowManuallyEdited(counter): Locator` | `cellAt(rowCells(counter), 19).getByText('Manually edited', { exact: true })`. The `role=status` badge holds only the keyword; the pill is its sibling. |
| `rowField/rowJob/rowRanch(counter)` | `cellAt(rowCells(counter), 7 / 8 / 11)` |
| `timeInPanel` (**re-scoped**) | Today it is filtered `has: button /^Cancel$/`. Once dirty, the footer's Cancel becomes **"Discard changes"** (seen live on the Add Time-In dialog and in the re-test recording), so the panel locator stops matching mid-edit. Re-scope it to heading `/^Time In$/` **+ `button /^Save$/`**, which is present in both states. `cancelPanel()` keeps clicking Cancel (pristine-only callers in `officeVerification.ts`). _Verify on first run: a pristine edit panel shows Cancel._ |
| `panelSaveButton` | `timeInPanel.getByRole('button', { name: /^Save$/ })` |
| `panelErrorChip` | `timeInPanel.getByText(/^\d+ errors?$/)` (the recording reads "1 error"). _Verify the shape on first run._ |
| `panelFieldNeedsRanch` | `timeInPanel.getByText('Select a Ranch first', { exact: true })` — the pristine-panel hint under the disabled Field |
| `pickPanelOption(label: 'Ranch'\|'Field'\|'Phase', name)` | **Ranch** is a *button* combobox: click it, then `page.getByRole('option', { name, exact: true }).click()`; assert `toContainText(name)`. **Field / Phase** are *input* autocompletes (placeholders `Select Field` / `Select Job`): click, `fill(name)`, then click the page-level option `{ name, exact: true }`; assert `toHaveValue(name)`. The listbox renders in a **portal outside the panel**, so the option locator is page-scoped. Field is **disabled until a Ranch is set**, so the order is Ranch → Field → Phase. Option names are plain names (`B1 RANCH`, `B1 FIELD`, `D9 JOB` measured). |
| `correctTimeIn({ ranch, field, phase })` | the three picks in order |
| `savePanel()` | Click Save, then wait for `savedToast` and for the panel to close or settle. |
| `savedToast` | `page.getByText('Time In record saved', { exact: true })` (sonner region "Notifications alt+T") |
| `waitForReanalyze()` | After the save, `analyzeCandidatesButton` reads *Analyzing...*, then returns to enabled. Wait for it to be enabled; the callers then poll their own reads. |

No delete, no commit and no select-all are added.

## Data

- **Journey D fixture, new `d3` block** in `src/data/journey-d/fixture.json`. Add a `D3Block` to
  `src/data/schemas/journeyDFixture.ts` (optional, like d9/d10) and a `journeyD3Fixture()` accessor
  in `src/data/journey-d/fixture.ts`. The names are protected by the existing `/^D\d{1,2} /` pattern.

  | Record | Name | Code | Free on dev 2026-10-13? | Notes |
  |---|---|---|---|---|
  | Crew | `D3 CREW` | `8018` | yes (live + recycle bin) | 8016 is E2's |
  | Employee | `D3 PICKER ONE` | `8019` | yes | active, home crew `D3 CREW` |
  | Job | `D3 JOB` | `4608` | yes | `paymentType: 'Time'`, `hourlyRate: 1` (D10 shape). 4602 is burnt; 4607 is E2's |

  Ranch `B1 RANCH` (162) and field `B1 FIELD` (99) are **reused read-only**, built through
  `ensureRanchOnScreen` / `ensureFieldOnScreen` with `JOURNEY_B_FIXTURE` exactly as D9 does.
  Live check: `B1 FIELD` is offered under `B1 RANCH`.
- **Fixture day: `dayOffset: -15`.** B owns 0..-9, C -10, D6 -11, D9 -12, D10 -13, **E2 -14**. -15 is
  inside `maximumDaysForTransferExport = 21`. On 2026-10-13, day -15 on `su` held only two
  already-transferred foreign cards and no eligible rows.
- **Envelope (device simulation)**, built with `buildEnvelope` (`src/utils/relay/exportEnvelope.ts`).
  `buildRow` omits Ranch/Field/Job tags when the codes are absent.

  | # | node | part | employeeSource | employee | crew | ranch/field/job | time |
  |---|---|---|---|---|---|---|---|
  | 0 | `TimeCard` | `TI` | `BarcodeBadge` | 8019 | 8018 | **none** | 07:00 |
  | 1 | `TimeOut` | `TO` | `BarcodeBadge` | 8019 | 8018 | none (a time-out never carries them, per B11) | 15:30 |

  The Time Out is mandatory. An unpaired Time In on a fixture day poisons transfers.
  The prefix is `lineagePrefix('D3', testInfo.retry)`, the file is `exportFileName(prefix)`, and the
  device address is `relayConfig().from`.
- **Correction values:** Ranch `B1 RANCH`, Field `B1 FIELD`, Phase `D3 JOB`. The scenario names them
  by fixture key, and the flow resolves them to names and ids.
- **Scenario JSON** `src/data/journey-d/d03-add-missing-time-in-and-correct-time-card.json`, validated
  by a new **`JourneyD3CorrectionCaseSchema`** in `src/data/schemas/journeyDScenario.ts`
  (`.strict()`). Shape: `workflow`, `label`, `dayOffset`,
  `records[] {node, part, employeeSource, employee:'picker', crew:'crew', time}`,
  `correction {ranch:'ranch', field:'field', phase:'job'}`,
  `expected {timeCards:2, statusBefore:'Blocking', statusAfter:'Ready', manuallyEdited:'Manually edited', emptyCell:'—', blockingIssuesFixed:2, toast:'Time In record saved', jobCards:0}`,
  `annotations[]`, `cleanup[]`.
  The `superRefine` checks:
  - `workflow === 'D3'` and `dayOffset === -15`;
  - exactly one `TI` and one `TO` record, and the `TI` record carries **no** ranch/field/job keys;
  - `TI.time < TO.time`;
  - a `timeCards` cleanup step with `employeeCodes` ⊇ `['8019']` and `cardTypes: [0, 1]` is present.
- **Uniqueness:** crew/employee/job codes are unique database-wide and across the recycle bin. Nothing
  is minted per run except the envelope prefix.

## Preconditions

- [ ] **On screen, through `ensureOnScreen`:** first B1 RANCH / B1 FIELD, then `D3 CREW`, then
      `D3 PICKER ONE` (home crew `D3 CREW`; the crew must exist first), then `D3 JOB`.
- [ ] **Before-phase sweep** of the fixture day:
      1. `D3 CREW` job cards on the day, by id. This is defensive: D3 writes none, but someone may have
         transferred by hand, and a transferred card blocks the time-card delete.
      2. `runCleanup(..., phase 'before')`.
      3. The crew-scoped time-card sweep (`sweepOwnTimeCards`).
- [ ] Test budget: `test.slow()` plus
      `testInfo.setTimeout(Math.max(360_000, journeyBTestTimeoutMs(testInfo) + 240_000))`. The relay
      pull shares one import deadline, and three Setup forms may run on a cold fixture.

## API allowances

| Step / call | Endpoint | Allowance | Why |
|---|---|---|---|
| fixture-row existence | `GET ranches/fields/crews/employees/jobs` (+ `/{id}`) | read | `ensureOnScreen`: existence is a GET, create/repair is UI |
| binned fixture-row restore | `POST <entity>/{id}/restore` | cleanup | already wrapped inside `ensureOnScreen` |
| before-phase sweep | `GET job-cards?from&to` → `DELETE job-cards/{id}`; `GET time-cards?from&to` → `DELETE time-cards/{id}` | cleanup | crew-scoped. A crashed run's Time In would otherwise be a duplicate |
| device envelope push | relay `UploadFile` via `sendToRelay` | device | the handheld itself. Wrap in `allowApiWrites('device', 'D3: PET Pocket envelope with a context-less Time In', ...)` for the ledger (it does not travel on `sessionApi`) |
| import read-back | `GET time-cards?from&to` (`findByReferences` inside `deliverAndVerifyCards`) | read | records both ids **before** any assertion. The import click itself is on screen (Connectivity ▸ Import ▸ Internet) |
| own job-card ids | `GET job-cards?from&to` | read | `recordOwnJobCardIds`: ids recorded for cleanup before anything is asserted. Never the proof — the corrected Time In (Transfer panel, compared with the same reader's capture before the fix), its Transferred cell and the empty View ▸ Job Cards day are all read on screen |
| after-phase teardown | `DELETE time-cards/{id}` | cleanup | by id, from the ids recorded at import |

The **Time In correction itself has no row here**: it is the panel's Save, on screen. No preference
write, no transfer analyze/execute over the API, no DB.

## Cleanup

| Phase | Step | How |
|---|---|---|
| after, 1 | **[declarative]** `{ kind:'timeCards', employeeCodes:['8019'], dayOffset:-15, cardTypes:[0,1] }` | `ctx.cards` = the two imported cards, recorded before assertions |
| after, 2 | **[imperative]** crew-scoped day sweep | `sweepOwnTimeCards(api, { day, crewCounter: D3 CREW })` under `allowApiWrites('cleanup', ...)` |
| after, 3 | **[nothing]** setup rows | `D3 CREW` / `D3 PICKER ONE` / `D3 JOB` are permanent fixture rows, protected by `/^D\d{1,2} /` |
| after, 4 | **[nothing]** import run | the Connectivity import run keeps an audit row. JSON entry `{ kind:'unremovable', entity:'importRun', reason }` |

The cards are untransferred, so `DELETE time-cards/{id}` succeeds (no `record.transferred_delete`).
Do **not** add a `jobCard` entry to `cleanupTargets.ts`.

## Flow helper — `src/utils/journeys/journeyDFlow.ts`

```ts
export interface JourneyD3Run {
    scenario: JourneyD3CorrectionCase;
    ranch: EnsuredRecord; field: EnsuredRecord; crew: EnsuredRecord;
    picker: EnsuredRecord; job: EnsuredRecord;
    punchDate: Date; day: string;
    jobCardIds: number[];          // stays empty; satisfies TransferRun for openScopedCandidates
    cleanup(): Promise<void>;
    readonly ctx: CleanupContext;
}
export interface D3Seed extends SeedResult {
    timeInId: number; timeInReference: string;
    timeOutId: number; timeOutReference: string;
}
export async function prepareJourneyD3(scenario: JourneyD3CorrectionCase,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects }): Promise<JourneyD3Run>;
export async function seedBlockingTimeInDay(run: JourneyD3Run,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects }): Promise<D3Seed>;
export async function readCorrection(run: JourneyD3Run,
    opts: { sessionApi: APIRequestContext }, seed: D3Seed): Promise<{ timeIn: OfficeTimeCard; jobCards: JobCardRecord[] }>;
```

- `prepareJourneyD3` mirrors `prepareJourneyD9`: annotations, `ensureOnScreen`, `ctx`/`finishCleanup`
  registered on `currentScope(testInfo)`, then the before-phase sweep. It does **not** read the piece
  preferences.
- `seedBlockingTimeInDay` does the following:
  1. Resolve the records' fixture keys to codes and build `DeviceRecord[]` with `at = punchMoment(h, m, punchDate)`.
  2. Build with `buildEnvelope` and wrap with `envelopeView(xml, references, fileName, prefix)`.
  3. Push with `sendEnvelope` and `expect(send.success)`. Widen `sendEnvelope`'s first parameter to
     `Pick<MintedRun, 'deviceAddress'>`; this is backward compatible, and it is the only change to
     `journeyBFlow.ts`.
  4. Call `deliverAndVerifyCards({ ..., pages, crewId, ranchId: ranch.id, cardType: null, sweep: false, fileName, lineagePrefixes: [prefix], punchDate, expected })` with:
     - the TI: `{reference, employeeId, fieldId: null, jobId: null, ranchId: null}`;
     - the TO: `{reference, employeeId}`.
  5. Set `run.ctx.cards = result.cards` **immediately**, then return the ids and References.
- `openScopedCandidates(run, { pages, crew: run.crew.name }, seed)` is **reused unchanged** for scope,
  analyze, the crew filter and the roster guard. It never ticks anything. D3's `scenario.expected`
  carries `jobCards: 0` to satisfy `TransferRun`.

## Test case

**One workflow, one happy-path test, one runner row, and the id is the workflow id.**

The `D3` row already exists in `src/data/runner/journey-d.csv`, so this is a flip, not an insert:
`jira` → `PET-12662`, `status` → `automated`, `enabled` → `1`. Keep `category=ui`,
`testName=addMissingTimeInAndCorrectTimeCard`, `tags=regression` and `demo=1`. Then run
`npm run runner:sync && npm run runner:check`.

| id | Title | Tags | Category | enabled |
|---|---|---|---|---|
| `D3` | Correct a blocking device Time In on the time card and see it re-analyse to Ready | `regression` | `ui` | 1 |

```ts
test.describe('D3 · Add missing time-in and correct time card', { tag: ['@JourneyD', '@D3'] }, () => {
    test('[Transfer] Correct a blocking device Time In on the time card and see it re-analyse to Ready.', {
        tag: ['@Regression', '@Demo'],
        annotation: [{ type: 'testCaseId', description: 'D3' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* ... */ });
});
```

**Steps:**

1. `loadScenario(JourneyD3CorrectionCaseSchema, testInfo)` → `prepareJourneyD3(...)`. This builds the
   fixture rows on screen and runs the before-phase sweep.
2. `seedBlockingTimeInDay(...)`: build the envelope, push it to the relay, run the **on-screen**
   Internet import, and record both card ids. `deliverAndVerifyCards` asserts that the Time In has
   null field/job/ranch and `programCreated` true.
3. **Catalog step 1.** `openScopedCandidates(run, { pages, crew: 'D3 CREW' }, seed)`. The roster
   guard must see exactly the two own References. Then:
   - Assert that `rowStatusText(timeInId)` is `Blocking` and that the Field/Job/Ranch cells read `—`.
   - Read `B = blockingCount()` and `R = readyCount()`, and assert `B >= 2`.
   - Assert that `blockingBanner` reads `${B} blocking issues to resolve before transfer`.
   - Record each own row's badge (`ownReadyBefore`) and the Time Out's status (annotation).
   - Attach `issueGroupTexts()`.
4. **Open the record.** Call `openRow(timeInId)`. Assert `panelFieldNeedsRanch` is visible, Field is
   disabled and Phase has the value `''`.
5. **Catalog step 3.** Call `correctTimeIn({ ranch: 'B1 RANCH', field: 'B1 FIELD', phase: 'D3 JOB' })`.
   Assert `panelSaveButton` is enabled and `panelErrorChip` is hidden. Call `savePanel()` and assert
   that `savedToast` is visible.
6. **Catalog step 4.** Call `waitForReanalyze()`, then poll:
   - `rowStatusText(timeInId)` → `Ready`;
   - `rowManuallyEdited(timeInId)` is visible;
   - the Field/Job/Ranch cells read `B1 FIELD` / `D3 JOB` / `B1 RANCH`;
   - `blockingCount()` → `B - 2`;
   - `readyCount() - R` equals the number of own rows that turned Ready (≥ 1);
   - `blockingBanner` reads `B - 2`, or is hidden when that is 0.
7. `readCorrection(...)`:
   - The Time In's `ranchCounter` / `fieldCounter` / `jobCounter` equal the B1 RANCH / B1 FIELD /
     D3 JOB ids.
   - `employeeCounter`, `crewCounter` and `dateTime` are unchanged, and `transferred` is false.
   - `jobCards` (D3 CREW, the day) has length **0**.
8. Assert `selectAllRowsCheckbox` is not checked. Then `await run.cleanup()`.

**Proof the test is real, not vacuously green:**
- The import read proves the Time In arrived context-less.
- The Blocking badge, the `—` cells and the Ranch-locked Field are all asserted **before** the save.
- The badge flips to Ready, and the Blocking pill moves by exactly 2.
- The GET shows the three ids on the **time card**, with zero job cards.
- After `run.cleanup()`, the scoped `GET time-cards` for D3 CREW on the day is empty.

## Open questions for the tester

None outstanding.
