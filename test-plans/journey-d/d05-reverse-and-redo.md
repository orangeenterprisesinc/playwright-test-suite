# `D5` · Reverse and redo

> **Fix the time card, not the job card, and prove that the reverse puts the day back.**
> D5 creates a Time In (07:00) and a Time Out on screen. The Time Out is deliberately wrong (11:00).
> 1. The operator transfers the day. One 4-hour job card is written, and the app takes them to **Job Cards**.
> 2. They click **Reverse** and confirm **Reverse Transfer**. The app returns to Transfer to Job Cards, deletes that job card, and sets both time cards back to un-transferred.
> 3. The operator corrects the Time Out to 15:00 in its side panel and re-transfers.
>
> The spec proves three things: the old card is gone, exactly one **07:00–15:00, 8 h** work card exists, and no card with an 11:00 Time Out survives.
>
> **Binding safety constraints** (inherited from D3/D9, plus the reverse):
> * Never touch the header **Select all rows**, any **Delete** (grid row, panel, or the Job Cards **Delete ▾** menu, whose items include `view-job-cards-delete-all`), **Recalculate**, or **Multi Edit/Update**. Rows are ticked by Reference only (`selectCandidate`).
> * Every D5 Transfer is scoped by **Time Card Crew = D5 CREW**, so the analyze and the execute carry `crewIds` and cannot commit another run's cards on the day. Before each commit, `openScopedCandidates` must see exactly this run's two References. An unscoped execute or a short analyze fails by name.
> * **Reverse is clicked only for this run's own transfer run.**
>   * The Job Cards Reverse posts `POST /transfer-to-job-cards/runs/{transferRun}/reverse`, where `{transferRun}` is the URL parameter the transfer navigated with. This comes from the deployed bundle `index-N_7lm9SA.js`.
>   * `guardReversibleRun` refuses (it throws and does not click) unless that id belongs to this test's run.
>   * A second **"Confirm Reverse"** dialog (the edited-cards path) must never appear. The page object fails if it does, and it never clicks `reverse-transfer-edited-confirm-action`.

Source: WEBPET-2050 QA re-test, signed off 2026-10-14 (tester's tenant). The recording's keyframes are in `.video-annotations/d5-reverse-and-redo-happy-path-2026-10-14/`. The screens were checked live on `su` on 2026-10-15.

**Nothing was saved, transferred or reversed** during that check:
* both Add dialogs were cancelled or discarded;
* the Reverse dialog was opened on `/view/job-cards?transferRun=999999999`, a run that does not exist, and was cancelled.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `D5` |
| Jira | `PET-12489`, manual source `WEBPET-2050` |
| Plan | `test-plans/journey-d/d05-reverse-and-redo.md` |
| Spec | `tests/web/journey-d-office/d05-reverse-and-redo.spec.ts` |
| Scenario | `src/data/journey-d/d05-reverse-and-redo.json` |
| Runner row | `src/data/runner/journey-d.csv` → `D5` (exists as `draft`, `enabled=0`) |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `D5`. Journey `D`, Daily office processing (the engine) |
| Segments / Modules | `all` / `Windows` |
| Surface | `ui`. Spec in `tests/web/journey-d-office/`, runner category `ui` |
| Catalog status | draft → automated by this plan |

**Summary** (from the catalog)
> Reverse a committed transfer to return job cards to time cards, fix the underlying data, then re-transfer. Use this when the time card data itself is wrong, not when only a rate changed.

## Catalog steps

| # | Catalog step | Office surface (WEBPET-2050 + live 2026-10-15) | Automatable? |
|---|---|---|---|
| — | (setup) a transferred day with a wrong card | **Transfer to Job Cards** → **New record ▸ Add Time-In** (07:00) and **Add Time-Out** (11:00) → Analyze → tick the 2 rows → Transfer → confirm. The app navigates to `/view/job-cards?filter=…&transferRun=N`, because the preference `viewJobCardsAfterTransfer` is true on su. | **yes** |
| 1 | Click Reverse; the job cards are deleted and the records return to time cards. | Job Cards toolbar **Reverse** (`view-job-cards-reverse-transfer`). It renders only when the URL carries `transferRun`. It opens the alertdialog **"Reverse this transfer?"** with Cancel and **Reverse Transfer**. Confirming lands on `/transfer-to-job-cards` with the toast **"Transfer run reversed"**. | **yes** |
| 2 | Correct the time cards (not the job cards). | Click the Time Out row's date cell. In the **Time Out** side panel, set Date / Time to 15:00 and Save → **"Time Out record saved"**. The grid re-analyses (`autoAnalyzeAfterEditTransferJc` = true). | **yes** |
| 3 | Re-run the transfer. | Same commit path → `/view/job-cards?…&transferRun=M` | **yes** |

## Scope

**In:** the WEBPET-2050 happy path. A wrong Time Out is transferred, reversed from the Job Cards screen, corrected on the time card and re-transferred.

**Out (deferred, each needs its own ticket):**
- The four catalog variations: a late-found missing time card, a wrong crew job, an export-identifier mismatch, and a bad group piece-out distribution.
- Reversing from the Transfer screen's own toolbar **Reverse** (the runs-list page, "Reverse this transfer run?" / "Reverse run").
- The edited-job-card confirm path, and the path blocked by an export or lock.

## Expected outcomes

- **Time cards created on screen:**
  - Saving **Add Time-In** for `D5 PICKER ONE` on the fixture day at 07:00 shows the toast **"Time In record created"**. Work Crew auto-fills `D5 CREW`; the operator sets Ranch `B1 RANCH` → Field `B1 FIELD` → Phase `D5 JOB`.
  - Saving **Add Time-Out** for the same employee at 11:00 shows **"Time Out record created"**.
  - `GET time-cards` for the day then returns exactly these two own cards, both `transferred: false`.
- **Analyse:** the candidates are exactly the two own References, both rows read **Ready**, and the Ready pill reads 2.
- **First transfer:**
  - The toast reads **"Transfer complete — 1 job card written, 2 time cards transferred."**
  - The URL becomes `/view/job-cards` with `transferRun=N`, where N equals the execute job's `transferRunCounter`.
  - The grid shows one `D5 CREW` row with Gross Time 4.
  - `GET job-cards/{id}` reads `dateTimeIn …T07:00`, `dateTimeOut …T11:00`, `grossTime` 4.
- **Before Reverse is clicked**, `GET transfer-to-job-cards/runs` lists run N with:
  - `status: active` and `authorCounter` = the session user;
  - `runAtUtc` no earlier than the test start;
  - `jobCardCount` 1, `timeCardCount` 2, `jobCardsModified` 0.
- **The Reverse dialog:**
  - Its title is **"Reverse this transfer?"**, and its text begins "This deletes the job cards the transfer just created and returns the source time cards to their un-transferred state."
  - Confirming sends exactly `POST …/runs/N/reverse`, lands on `/transfer-to-job-cards`, and shows **"Transfer run reversed"**.
- **After the reverse:** the first job-card id is gone from `GET job-cards` for the day, both own time cards read `transferred: false`, and run N is no longer listed as `active`.
- **The correction:**
  - Re-analysing offers the same two References.
  - Saving the Time Out panel at 15:00 shows **"Time Out record saved"**.
  - `GET time-cards` then shows the Time Out at `…T15:00:00` and the Time In unchanged at `…T07:00:00`.
  - The Job Cards tab preview shows one `D5 JOB` segment with Gross Time 8.
- **The re-transfer:**
  - The toast reads "… 1 job card written, 2 time cards transferred."
  - The URL carries `transferRun=M`, with M ≠ N.
  - Exactly one work card exists (`jobCounter` = D5 JOB): `dateTimeIn …T07:00`, `dateTimeOut …T15:00`, `grossTime` 8, `netTime` 8 (D5 CREW has no lunch length).
  - Its id differs from the first card's id, and no own card has an 11:00 out.
- **Meal Penalty.** On su, `mealPenaltyRule` and `paidBreakPenaltyRule` are both **null** (read 2026-10-15), so no penalty card is expected.
  - If one appears anyway, it is tolerated only when it is a non-labor card for D5 PICKER ONE on the day. It is recorded as an annotation, and its id is cleaned up.
  - Any other extra card fails the test.
  - For reference, the tester's tenant wrote a "California Meal Penalty" as its second card.
- **Not asserted:**
  - The **"Transfer summary"** dialog ("1 Job Card written / 2 Time Cards marked transferred"). It unmounts when the app navigates to Job Cards in the same callback; the toast carries the same counts.
  - The confirm-dialog title "Transfer 2 Time Cards to Job Cards?" and the button label "Transfer to Job Cards 2". These are (POM): `runTransfer` confirms the dialog and waits for the enabled button, but does not assert either text.
  - The Time Out panel's "Transferred = No". This is asserted as `transferred: false` over the API; the panel field itself is not read (deferred).
  - The exact Time In / Time Out text on the Job Cards grid. The format is unconfirmed, so it is asserted loosely (`/0?7:00/`, `/15:00|3:00\s*PM/`); the API carries the minute-exact proof.

## Screens and page objects

| Screen | Path | Page object | Status |
|---|---|---|---|
| Setup ▸ Crew / Employee / Job | `/setup/…/new` | via `ensureOnScreen.ts` | exists |
| Transfer to Job Cards (+ Add dialogs, Time Out panel) | `/transfer-to-job-cards` | `TransferToJobCardsPage` | **extended** |
| View ▸ Job Cards | `/view/job-cards` | `src/pages/processing/ViewJobCardsPage.ts`, registered as `viewJobCards` | **new** |

`JobCardsPage` is **not** extended. It models `/input/job-cards`, a different screen: a From/To grid with `page-header-action-*` testids and no Reverse. The transfer navigates to `/view/job-cards`, which uses `view-job-cards-*` testids. Both screens were measured live.

### `TransferToJobCardsPage` additions (live 2026-10-15)

| Member | Locator / behaviour |
|---|---|
| `newRecordButton` | `getByTestId('v2-add-record-trigger')`: button "Add a Time Card record", text "New record" |
| `openAddRecord(kind: 'timeIn'\|'timeOut')` | Click the trigger → `getByTestId('v2-add-record-item-' + kind)` (menu items "Add Time-In" / "Add Time-Out") → wait for `addRecordDialog(kind)` |
| `addRecordDialog(kind)` | `page.getByRole('dialog', { name: 'Add Time-In' \| 'Add Time-Out' })` |
| `addTimeIn({ day, time, employee, crew, ranch, field, phase })` | See "Filling Add Time-In" below |
| `addTimeOut({ day, time, employee, crew })` | Requires **Date / Time \*** and **Employee \***; D5 also sets **Work Crew = `D5 CREW`** (`pickWorkCrew`, shared with Add Time-In) so the crew-scoped Transfer sees the card. Pieces, Run, Job, Ranch, Field, Work Order, Load, GPS and Memo are optional. The footer's Cancel becomes **"Discard changes"** once the form is dirty, alongside Save and Close |
| `recordToast(text)` | `page.getByText(text, { exact: true })`: "Time In record created" / "Time Out record created" / "Time Out record saved" |
| `pickOption(scope: Locator, label, name)` | The body of `pickPanelOption`, refactored to take a scope. `pickPanelOption` keeps its signature |
| `timeOutPanel` | Same shape as `timeInPanel`: a `div` filtered on heading `/^Time Out$/` + button `/^Save$/`, `.last()`. _Inferred from the shared form; verify on the first run_ |
| `openRow(counter, panel: 'Time In'\|'Time Out' = 'Time In')` | Same click (date cell 5); waits for the named panel |
| `setPanelDateTime(panel, day, hhmm)` | `panel.getByRole('textbox', { name: /^Date \/ Time/ }).fill(`${day}T${hhmm}`)`, the same `#dateTime` control. _Verify on the first run_ |
| `transferCompleteToast(jobCards, timeCards)` | `getByText(`Transfer complete — ${jobCards} job card${jobCards===1?'':'s'} written, ${timeCards} time cards transferred.`)` (i18n `execute.asyncCompleteToast`) |
| `reversedToast` | `getByText('Transfer run reversed', { exact: true })` |

**Filling Add Time-In** (`addTimeIn`):
1. **Date / Time:** `dialog.getByRole('textbox', { name: 'Date / Time *' })` (`#dateTime`, `type=datetime-local`) → `fill(`${day}T07:00`)`.
2. **Employee:** `combobox 'Employee *'` (an input with placeholder "Select Employee"). Click it, `keyboard.type(name)`, then click the option `{ name: new RegExp(': ' + name + '$') }`. Options are labelled `"<exportIdentifier> : NAME"` (measured as `": D3 PICKER ONE"`).
3. **Work Crew** (`combobox 'Work Crew'`, an input) **auto-fills from the home crew** (measured as `D3 CREW`). Assert `toHaveValue(crew)`, and pick a value only on a mismatch.
4. **Ranch \*** (a button combobox) → **Field \*** (disabled until a ranch is chosen, hint "Select a Ranch first") → **Phase \*** (placeholder "Select Job"). Set these through a dialog-scoped variant of `pickPanelOption`, typing with the keyboard rather than `fill()`.
5. **Save:** `dialog.getByRole('button', { name: 'Save' })`, disabled until the form is valid.

### `ViewJobCardsPage` (new)

| Member | Locator / behaviour |
|---|---|
| `heading`, `grid` | `getByRole('heading', { name: 'Job Cards', level: 1 })`, `getByRole('grid', { name: 'Job Cards' })` |
| `transferRunParam(): number` | `Number(new URL(page.url()).searchParams.get('transferRun'))` (NaN if absent) |
| `waitForTransferLanding()` | `waitForURL(/\/view\/job-cards\?.*transferRun=\d+/)` + heading visible |
| `reverseButton` | `getByTestId('view-job-cards-reverse-transfer')`: button "Reverse", destructive |
| `reverseDialog` | `getByTestId('view-job-cards-reverse-transfer-confirm')`: alertdialog **"Reverse this transfer?"** |
| `confirmReverseButton` / `cancelReverseButton` | `getByTestId('view-job-cards-reverse-transfer-confirm-action')` ("Reverse Transfer") / `reverseDialog.getByRole('button', { name: 'Cancel' })` |
| `openReverse()` | Click `reverseButton`, then wait for `reverseDialog` |
| `confirmReverse(): Promise<number>` | `waitForRequest(POST /\/transfer-to-job-cards\/runs\/(\d+)\/reverse$/)` + click, then return the id. After that, race `waitForURL(/\/transfer-to-job-cards/)` against `getByTestId('reverse-transfer-edited-confirm')`, and **throw** if the edited dialog wins (never click it) |
| `rowsForCrew(name)` / `cellByHeader(row, header)` | Data rows filtered by an exact `cell` name. The column index comes from the `columnheader` inner texts (`Work Crew`, `Time In`, `Time Out`, `Gross Time`, `Job`…). The layout is user-reorderable, so never hard-code an index |

No delete, recalculate, multi-edit or export member is added.

## Data

- **Fixture: a new `d5` block** in `src/data/journey-d/fixture.json`. Add an optional `D5Block` to `src/data/schemas/journeyDFixture.ts` and a `journeyD5Fixture()` accessor in `fixture.ts`. The names are protected by the `/^D\d{1,2} /` pattern.

  | Record | Name | Code | Free on dev 2026-10-15? | Notes |
  |---|---|---|---|---|
  | Crew | `D5 CREW` | `8020` | yes (the highest 80xx crew is 8018) | no lunch length → net = gross |
  | Employee | `D5 PICKER ONE` | `8021` | can't be proved read-only (the employees GET is unbounded); `ensureEmployeeOnScreen` surfaces a clash | active, home crew `D5 CREW` |
  | Job | `D5 JOB` | `4609` | yes | `paymentType: 'Time'`, **`hourlyRate: 1`** (without a rate the transfer writes 0 cards) |

  `B1 RANCH` (162) and `B1 FIELD` are reused read-only, as D3 does.

- **Fixture day `dayOffset: -16`.**
  - Decided with the tester on 2026-10-15: E2 already owns -14 and commits real transfers there.
  - Day ownership: B 0…-9, C -10, D6 -11, D9 -12, D10 -13, E2 -14, D3 -15 (E10 shares it on E2 CREW), **D5 -16**. Each committing spec owns a (day, crew) pair.
  - -16 is inside `maximumDaysForTransferExport` (21).
  - E10 moved from -16 to -15, so D5 no longer shares its day with E10. Foreign residue on the day is caught by the Time Card Crew scope and the roster guard in `openScopedCandidates`. `seedOnScreenDay` also fails by name if the saved Time Out's crew is not `D5 CREW`.
- **Scenario JSON:** `src/data/journey-d/d05-reverse-and-redo.json`, validated by `JourneyD5ReverseCaseSchema` (`.strict()`). Shape:

  ```text
  workflow: 'D5', label, dayOffset,
  timeIn {hour: 7, minute: 0}, wrongTimeOut {11:00}, correctedTimeOut {15:00},
  context {ranch: 'ranch', field: 'field', phase: 'job'},
  expected {
    timeCards: 2,
    firstTransfer {jobCards: 1, grossHours: 4},
    redo {workCards: 1, grossHours: 8, netHours: 8},
    toasts {timeInCreated, timeOutCreated, reversed, timeOutSaved}
  },
  annotations[], cleanup[]
  ```

  `superRefine` checks:
  - `workflow === 'D5'` and `dayOffset === -16`;
  - `timeIn < wrongTimeOut < correctedTimeOut`;
  - `grossHours` equals out − in for both transfers;
  - the cleanup has a `timeCards` step for `['8021']`, `cardTypes [0,1]`, on the day.

## Preconditions

- [ ] On screen, through `ensureOnScreen`: B1 RANCH / B1 FIELD → `D5 CREW` → `D5 PICKER ONE` (home crew `D5 CREW`) → `D5 JOB`.
- [ ] Read-only gate (`GET preferences`):
  - `viewJobCardsAfterTransfer === true`, otherwise the spec throws (the reverse path depends on that navigation);
  - `maximumDaysForTransferExport >= 16`;
  - record `mealPenaltyRule` / `paidBreakPenaltyRule` as an annotation.
- [ ] `GET session/me` → `sessionUserId`; `startedAt = new Date()`.
- [ ] Before-phase sweep of the day: own job cards (crew **or** employee) by id → `runCleanup(before)` → `sweepOwnTimeCards` (crew).
- [ ] Time budget: `test.slow()` + `testInfo.setTimeout(journeyD5TimeoutMs(testInfo))` = `420_000` (three Setup forms + two transfers + one reverse).

## API allowances

| Step / call | Endpoint | Allowance | Why |
|---|---|---|---|
| fixture existence / restore | `GET ranches/fields/crews/employees/jobs`; `POST <entity>/{id}/restore` | read / cleanup | inside `ensureOnScreen` |
| gate reads | `GET preferences`, `GET session/me` | read | navigation precondition; the run author's id |
| before-phase sweep | `GET job-cards?from&to` → `DELETE job-cards/{id}`; `GET time-cards?from&to` → `DELETE time-cards/{id}` | cleanup | scoped to the crew/employee; job cards first |
| seed read-back | `GET time-cards?from&to` | read | records both ids **before** any assertion |
| execute poll | `GET transfer-to-job-cards/execute/{jobId}` | read | inside `commitTransfer`; now also yields `transferRunCounter` |
| job-card reads | `GET job-cards?from&to`, `GET job-cards/{id}` | read | ids recorded on every poll |
| **runs safety read** | `GET transfer-to-job-cards/runs` → `{ runs: [...] }` | read | guard before Reverse; "no longer active" after it |
| after-reverse / after-edit reads | `GET time-cards?from&to`, `GET job-cards?from&to` | read | prove the unwind and the correction |
| teardown | `DELETE job-cards/{id}` then `DELETE time-cards/{id}` | cleanup | by recorded id |

**No user step has a row.** The Add Time-In/Time-Out saves, Analyze, both transfers, the **Reverse** (the browser's own `POST …/runs/N/reverse`) and the Time Out edit all happen on screen. The spec never calls `…/reverse`, `execute` or `analyze` itself.

## Cleanup

| Phase | Step | How |
|---|---|---|
| after, 1 | **[imperative]** job cards by id | `run.jobCardIds`: the redo card, plus any penalty card. The reversed id is **dropped** from the list once its absence has been asserted, so the teardown never warns on a 404 |
| after, 2 | **[declarative]** `{ kind:'timeCards', employeeCodes:['8021'], dayOffset:-16, cardTypes:[0,1] }` | `ctx.cards` = the two seeded cards, deletable once their job card is gone |
| after, 3 | **[imperative]** crew day sweep | `sweepOwnTimeCards` under `allowApiWrites('cleanup', …)` |
| after, 4 | **[nothing]** | `{ kind:'unremovable', entity:'transferRun', reason:'runs N (reversed) and M stay in the audit list; deleting M\'s card by id leaves it listed' }` |

Never reverse a run in teardown, and never bulk-delete.

## Flow helper — `src/utils/journeys/journeyDFlow.ts`

```ts
export interface JourneyD5Run {
    scenario: JourneyD5ReverseCase;
    ranch: EnsuredRecord; field: EnsuredRecord; crew: EnsuredRecord; picker: EnsuredRecord; job: EnsuredRecord;
    punchDate: Date; day: string; startedAt: Date; sessionUserId: number;
    jobCardIds: number[]; cleanup(): Promise<void>; readonly ctx: CleanupContext;
}
export interface D5Seed extends SeedResult { timeInId: number; timeOutId: number; timeInReference: string; timeOutReference: string; }
export function journeyD5TimeoutMs(testInfo: TestInfo): number;
export async function prepareJourneyD5(scenario: JourneyD5ReverseCase, opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects }): Promise<JourneyD5Run>;
export async function seedOnScreenDay(run: JourneyD5Run, opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects }): Promise<D5Seed>;
export async function transferOwnDay(run: JourneyD5Run, opts: { sessionApi: APIRequestContext; pages: PageObjects }, seed: D5Seed, expectedJobCards: number): Promise<ExecuteResult>;
export async function guardReversibleRun(run: JourneyD5Run, opts: { sessionApi: APIRequestContext; pages: PageObjects; testInfo: TestInfo }, transfer: ExecuteResult): Promise<TransferRunRecord>;
export async function readAfterReverse(run: JourneyD5Run, opts: { sessionApi: APIRequestContext }, seed: D5Seed, reversed: { runId: number; jobCardIds: number[] }): Promise<{ timeCards: OfficeTimeCard[]; dayJobCardIds: number[]; runStillActive: boolean }>;
export async function readRedo(run: JourneyD5Run, opts: { sessionApi: APIRequestContext; testInfo: TestInfo }, seed: D5Seed): Promise<{ work: JobCardRecord[]; penalty: JobCardRecord[]; other: JobCardRecord[]; timeCards: OfficeTimeCard[] }>;
```

- **`transferOwnDay`** = `openScopedCandidates(view, { pages }, seed)` + `commitTransfer`. Both pass `crew: run.crew.name`, so the analyze is scoped by Time Card Crew and `commitTransfer` rejects an execute with `crewIds []`. `view` is `run` with `scenario: { label, expected: { jobCards: expectedJobCards } }`.
- **Two backward-compatible changes to shared helpers:**
  - `commitTransfer` reads `readExecuteJob(jobId)` once after its poll and returns the real `transferRunCounter`. Today that field is hard-coded `0`.
  - A new `listTransferRuns(request): Promise<TransferRunRecord[]>` in `src/utils/api/transferToJobCardsApi.ts`. Fields: `transferRunCounter, auditGroupId, authorCounter, authorName, runAtUtc, jobCardCount, timeCardCount, jobCardsModified, status`. The body is `{ runs }`, newest first (measured).
- **`guardReversibleRun` throws (refuses)** unless all of these hold:
  1. `viewJobCards.transferRunParam()` === `transfer.transferRunCounter`, and it is > 0.
  2. That run is listed with `status 'active'`, `authorCounter === run.sessionUserId`, `runAtUtc >= startedAt − 60 s`, `jobCardCount 1`, `timeCardCount 2`, and `jobCardsModified 0`.
  3. The own-day job cards are exactly `transfer.jobCardCounters` (one id).

  "Newest run" is recorded as an **annotation, not a refusal**. The reverse targets an explicit id, so a later run by another worker is harmless, and refusing on it would only give a false red.
- **`readRedo`** lists the day's cards where crew = D5 CREW **or** employee = D5 PICKER ONE, and records every id into `run.jobCardIds` first. It then splits them into:
  - `work`: `jobCounter` = D5 JOB;
  - `penalty`: a non-labor `jobPaymentType`, or `/meal penalty/i` in the job name;
  - `other`: everything else.

## Test case

The `D5` row is flipped: `status` → `automated` and `enabled` → `1`. Keep `category=ui`, `testName=reverseAndRedo` and `tags=regression`. Then run `npm run runner:sync && npm run runner:check`.

```ts
test.describe('D5 · Reverse and redo', { tag: ['@JourneyD', '@D5'] }, () => {
    test('[Transfer] Reverse a wrong transfer, correct the Time Out and re-transfer one clean job card.', {
        tag: ['@Regression'], annotation: [{ type: 'testCaseId', description: 'D5' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* ... */ });
});
```

**Steps:**

1. `loadScenario(JourneyD5ReverseCaseSchema, testInfo)` → `prepareJourneyD5(...)`.
2. **Seed** with `seedOnScreenDay`:
   - goto, then `scopeToDay(day)`;
   - `openAddRecord('timeIn')` → `addTimeIn(07:00…)`, then `expect(recordToast('Time In record created'), 'the Time In must save').toBeVisible()`;
   - `addTimeOut(11:00)` → "Time Out record created";
   - record the ids, then `expect(seed.timeCardCounters, 'exactly the two on-screen cards exist').toHaveLength(2)`.
3. **First transfer:** `transferOwnDay(run, …, seed, 1)`, then:
   - `expect(transferCompleteToast(1, 2), 'first transfer writes one card').toBeVisible()`;
   - `viewJobCards.waitForTransferLanding()`;
   - `rowsForCrew('D5 CREW')` has count 1, and its Gross Time is `4`;
   - `readJobCards` returns `T07:00` / `T11:00` / `grossTime` 4 (`'the wrong card is 07:00–11:00, 4 h'`).
4. **Guard and open Reverse:** `guardReversibleRun(...)`, which refuses on any mismatch. Then `openReverse()`, and:
   - `expect(reverseDialog, 'reverse confirm').toContainText('Reverse this transfer?')`;
   - the dialog text includes "returns the source time cards to their un-transferred state".
5. **Catalog step 1:** `const reversedId = await viewJobCards.confirmReverse()`, then:
   - `expect(reversedId, 'the reverse targeted this run').toBe(N)`;
   - the URL is `/transfer-to-job-cards`;
   - `expect(reversedToast, 'reverse confirmed').toBeVisible()`;
   - `readAfterReverse`: the old id is gone, both cards read `transferred:false`, and `runStillActive === false`;
   - drop the old id from `run.jobCardIds`.
6. **Re-analyse:** `openScopedCandidates(view, { pages }, seed)`. `'both cards are eligible again'`: both rows read `Ready`.
7. **Catalog step 2:**
   - `openRow(timeOutId, 'Time Out')` → `setPanelDateTime(panel, day, '15:00')` → Save;
   - `recordToast('Time Out record saved')` is visible, then `waitForReanalyze()`;
   - `GET time-cards`: Time Out `T15:00:00` and Time In `T07:00:00` (`'the correction lives on the time card'`);
   - `openJobCardsTab()` → `previewSegments()` shows one `D5 JOB` row with gross 8, then `openTimeCardsTab()`.
8. **Catalog step 3:** `transferOwnDay(run, …, seed, 1)`, then:
   - `transferCompleteToast(1, 2)`, and the landing URL's `transferRun` ≠ N;
   - `readRedo`: `work` has length 1, `T07:00` / `T15:00`, `grossTime` 8, `netTime` 8, and an id ≠ the old id (`'one clean 8 h work card'`);
   - no card has an 11:00 out, `other` has length 0, and `penalty` is annotated only;
   - on screen, the `rowsForCrew` count equals `work.length` + any penalty rows for the crew, and the Gross Time cell reads 8.
9. **Finish:** `selectAllRowsCheckbox` was never checked. Then `await run.cleanup()`, and `remainingOwnTimeCards` → empty.

**Proof that the test is not vacuously green:**
- the 4 h card exists before the reverse, and its id is gone afterwards;
- the reverse POST carried this run's id;
- the time cards flip from transferred to `false`;
- the 15:00 value is read off the time card **before** the re-transfer;
- the final card is new and 8 h, and no 11:00 card remains.

## Open questions for the tester

None. The fixture day was resolved on 2026-10-15: E2 owns -14, so D5 uses -16. E10 moved to -15 on 2026-10-28 so that no other committing spec shares D5's day.
