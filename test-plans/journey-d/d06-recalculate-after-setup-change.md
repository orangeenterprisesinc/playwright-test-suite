# `D6` · Recalculate after setup change

> **Journey D's first automated workflow — and a real transfer.** D6 cannot be arranged
> read-only: the only thing worth recalculating is a job card the transfer itself wrote. The spec
> therefore seeds a whole day of its own time cards on Input ▸ Batch, runs a **real** transfer on the Transfer screen
> scoped to its own crew *and* its own job, changes the job's piece rate, and recalculates exactly
> the two job card ids the execute envelope named. Every mutating call is id- or fixture-scoped;
> nothing pre-existing is ever selected, transferred, recalculated or deleted.
>
> **Binding safety constraints** (all verified live, see §Resolution):
> * The transfer is scoped `{ from, to, crewIds:[D6 crew], jobIds:[D6 job] }` — **never by date
>   alone**. Day −11 already carries other people's rows on dev (job card `JC00000615`, employee
>   `2345 : A Kishore`); a date-only execute would sweep them in.
> * The Recalculate confirm dialog must be driven through the **`bodyChecked`** variant, and the
>   count in its text asserted to equal the seeded card count *before* confirming. The `bodyVisible`
>   variant ("…shown in the grid?") would recalculate a stranger's card.
> * The Job Cards screen's per-row **"Delete Job Card …"** button and the `job-cards/bulk-delete`
>   endpoint are **forbidden to the spec's UI half**. A "delete all loaded" wiped ~9.5 k dev job
>   cards in Sept 2026 and there is no restore route. Cleanup deletes the two **own** job cards by
>   explicit id over the API, one at a time, each with its own rowversion.

Source: no recording; office surface confirmed live 2026-09-29 (app.ptdev.xyz, `su`).
Manual source WEBPET-2051 (Done).

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `D6` |
| Jira | `PET-12663` — [D6] Recalculate after setup change |
| Recording | — none |
| This plan | `test-plans/journey-d/d06-recalculate-after-setup-change.md` |
| Spec | `tests/web/journey-d-office/d06-recalculate-after-setup-change.spec.ts` |
| Scenario | `src/data/journey-d/d06-recalculate-after-setup-change.json` |
| Runner row | `src/data/runner/journey-d.csv` → `D6` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `D6` |
| Journey | `D` — Daily office processing (the engine) |
| Segments | `all` |
| Modules | `Windows` |
| Surface | `ui` — spec in `tests/web/journey-d-office/`; runner category `ui` |
| Demo candidate | no |
| Catalog status | ticketed (PET-12663) |

**Summary** (from the catalog)
> Recalculate existing job cards to pick up a rate or setup change made after they were created,
> without deleting them. This differs from reverse, which throws the job cards away.

## Catalog steps

| # | Catalog step | Office surface (live 2026-09-29) | Automatable? |
|---|---|---|---|
| 1 | Change the pay rate or setup record (for example a piece rate from one dollar to two). | Setup ▸ Job → the **Piece Rate** field (`#pieceRate`, required for a Piece job). Validation runs on blur, Save stays disabled until it has, and saving navigates away — so the new rate is read back from a fresh load of the record. | **yes, on screen** — this is the workflow's own step 1, so it is driven like a user would, not written through `PUT /jobs/{id}`. Two form behaviours the API path could never see: writing the value the field already holds leaves Save disabled (correctly), and the form is left on save. |
| 2 | Run Recalculate; the program revisits the records that feed the calculation and updates the existing job cards. | **View ▸ Job Cards** `/input/job-cards`. From/To (`#filter-from`/`#filter-to`) → **Apply** (`list-date-range-apply`) → **Multi Update** (`page-header-action-multi-update`) reveals the row checkboxes → check the two own rows → **Recalculate** (`page-header-action-recalculate`) → `role="alertdialog"` **"Recalculate job cards?"** → button **"Recalculate"**. Server: `POST /job-cards/recalculate {recordIds:[…]}` → 202 `{jobId}` → poll `GET /job-cards/recalculate/{jobId}`. | **yes** — this is the workflow, driven on screen. |
| 3 | Confirm the new totals. | Result toast **"Recalculate complete: 2 updated, 0 skipped, 0 failed."** The grid's **Amount** column, however, reads **0.00** after the recalculate (see Expected outcomes — product defect). The trustworthy read-back is `GET /job-cards/{id}` → `pieceRate` / `pieceAmount`. | **partly** — toast and surviving rows on screen; the numeric total asserted over the API, because the grid's own Amount column is wrong on dev today. |

## Expected outcomes

- When a piece-paid day is transferred, PET Tiger shall write one job card per employee and answer
  the execute poll with `{status:'complete', jobCardsWritten, timeCardsTransferred, transferRunCounter,
  days:[{employeeCounter, jobCardCounters, sourceTimeCards}]}`, and each job card shall carry
  `pieces` equal to the crew piece-out total split across the crew and
  `pieceAmount === pieces × the job's piece rate before the change`.
  _This is the arrange, and it is **pinned as an assertion** so a minimum-wage make-up or a stale
  rate fails loudly here rather than silently swallowing the later delta._
- When the job's piece rate is raised and Recalculate is run over exactly those job card ids,
  PET Tiger shall report **"Recalculate complete: 2 updated, 0 skipped, 0 failed."** and the
  recalculate poll shall answer `summary.updatedCount === 2`, `failedCount === 0`,
  `warningCount === 0`.
- **The same job cards shall survive** — this is the D6-vs-D5 distinction, and one assertion is not
  enough to prove it, so all four hold after the recalculate:
  1. the same `jobCardCounter` values are returned by `GET /job-cards/{id}` (not 404);
  2. each card's `reference` is unchanged (a delete-and-recreate would mint a new `…-JC-…` sequence
     number, so the reference is this row's creation stamp — the API exposes no `createdAt`);
  3. each card's `timeCardInCounter` / `timeCardOutCounter` still point at the same source time
     cards;
  4. each card's `version` (rowversion) **has changed** — an in-place update, which a no-op would
     not produce and a delete-and-recreate could not preserve ids through.
- When the recalculate completes, each job card's `pieceRate` shall equal the new rate and its
  `pieceAmount` shall equal `pieces × the new rate`, while `pieces`, `netTime` and `grossTime` are
  unchanged — the rate changed, the underlying work did not.
- When the recalculate completes, the day's source time cards shall still be present, still
  `transferred === true`, and still the same count and ids — a reverse (D5) would flip that back;
  a recalculate must not.
- When the recalculate completes, `GET /job-cards/recalc-runs` shall contain exactly one run whose
  `recalcRunCounter` is greater than the counter captured before the test, with
  `jobCardCount === 2`, `authorName === 'Su'` and `status === 'active'`.
- When the two job cards are reloaded on `/input/job-cards` for the fixture day, both rows shall
  still be listed by their original **Reference** — the on-screen proof that Recalculate did not
  throw the cards away.
- Where the confirm dialog is opened from checked rows, PET Tiger shall show
  **"Recalculate the 2 checked job card(s)? Exported and date-locked rows will be skipped."**
  The spec asserts the **2** before confirming; a different number means the selection leaked
  outside this run's rows and the test must fail rather than confirm.
- The grid's **Amount** column shall show the card's new total.
  _— **deferred: product defect on dev.** Measured 2026-09-29: right after the transfer
  `amount === 2` (= `pieceAmount`); after the first recalculate `amount === 0` and stays 0 through
  every later recalculate, while `pieceAmount` tracks the rate correctly (1 → 2 → 4, 5 → 10). The
  grid renders `0.00` for a card that earned `10.00`, and `pieceGrid[0].baseRate` / `pieceGrid[0].amount`
  stay frozen at the pre-change rate. File a WEBPET bug (label `qa-beta-test` + `journey-d`) and link
  it from the runner row; assert `pieceAmount`, never `amount`, until it is fixed. Do **not** weaken
  this to "amount is 0" — that would bake the bug into the suite._
- The `su` user's permission `view-job-cards-recalculate` and the preference
  `allowRecalculateFromJobCard` gate the toolbar action, and with no rows loaded the button is
  disabled with "There are no job cards to recalculate. Apply a filter that returns job cards first."
  _— not asserted: `allowRecalculateFromJobCard` is already `true` on dev (read live), so the spec
  reads it and asserts it is on rather than flipping a shared preference; the disabled/no-rows state
  is a negative case and belongs to a separate ticket, not this plan._
- The skip reasons (`exported`, `dateLocked`, `noTimeRange`, `rateLookupFailed`, `notFound`,
  `updateFailed`, `other`) and the `bodyVisible` / `bodyExportScope` confirm variants.
  _— not automatable here: every one of them needs data this spec is forbidden to create (an
  exported or date-locked row) or a scope it is forbidden to use (all visible rows). Separate
  tickets._
- Save-stays-disabled, on-blur validation and the "Unsaved changes" bar on the Job form.
  _Exercised — the rate change is driven on Setup ▸ Job. The form's on-blur validation, Save-stays-disabled and the navigate-away-on-save are all handled in `src/pages/setup/JobPage.ts`; the "Unsaved changes" bar itself is not asserted._

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| View ▸ Job Cards (list) | `Input ▸ Job Card` / `/input/job-cards` | `src/pages/processing/JobCardsPage.ts` extends `BasePage` | **new** |
| Transfer to Job Cards | `/transfer-to-job-cards` | `src/pages/processing/TransferToJobCardsPage.ts` | **extended** — date scope (six segmented Month/Day/Year inputs), Analyze, per-row selection by Reference, `Transfer to Job Cards N` scoped to `transfer-v2-page` (the left nav carries an item of the same name). Never `Select all rows`. |
| Input ▸ Batch ▸ Crew Time In / Crew Piece Out / Crew Time Out | `/input/crew-*/new` | `src/pages/input/CrewTimeInPage.ts`, `CrewPieceOutPage.ts`, `CrewTimeOutPage.ts` on a shared `CrewPunchPage` | **new** — the crew day is seeded here, not through `POST time-cards/*`. The job field is labelled **Phase**. Ranch is a button-style combobox. Crew Time Out sets no Phase (a piece job there makes Number of Pieces required) and only offers employees with an open time-in. |

`JobCardsPage` — locators confirmed live 2026-09-29, all role- or testid-based:

| Element | Locator |
|---|---|
| Page | `page.goto('/input/job-cards')`, `getByRole('heading', { name: 'Job Cards', level: 1 })` |
| Date scope | `getByRole('textbox', { name: 'From' })` / `{ name: 'To' })` — native `type="date"`, ids `#filter-from` / `#filter-to`, value format `YYYY-MM-DD`, plain `fill()` (no segmented picker, unlike the Transfer screen) |
| Apply | `getByTestId('list-date-range-apply')` — disables itself once applied; the URL becomes `?from=…&to=…` |
| Empty state | text `Choose a date range and click Apply to load records.` |
| Grid | `getByRole('grid', { name: 'Job Cards' })`; footer `status` reads `Total N rows` |
| Row | `getByRole('row', { name: '<reference>' })` (`aria-label` = the reference) |
| Selection toggle | `getByTestId('page-header-action-multi-update')` — **the row checkboxes do not exist until this is pressed**: the select column is 0 px wide and the inputs are `aria-hidden`, `pointer-events:none`, `opacity:0`. Hovering does not reveal them. |
| Row checkbox | `getByRole('checkbox', { name: 'Select <reference>' })` (after Multi Update) |
| Selection bar | `region "Selected rows actions"` → `button "Clear selection"` whose text is `N selected` |
| Recalculate | `getByTestId('page-header-action-recalculate')` |
| Confirm dialog | `getByRole('alertdialog', { name: 'Recalculate job cards?' })`, body paragraph `Recalculate the {n} checked job card(s)? Exported and date-locked rows will be skipped.`, buttons `Cancel` / `Recalculate` |
| Result toast | text `Recalculate complete: 2 updated, 0 skipped, 0 failed.` (progress toasts `Starting recalculate…` / `Recalculating… …` may flash first) |
| Edit link | `link "Edit Job Card: <reference>"` → `/input/job-cards/{id}` |
| **Never touch** | `button "Delete Job Card <reference>"` / `getByTestId('job-card-delete-{id}')`, the header `checkbox "Select all rows"`, and `POST /job-cards/bulk-delete` |

The page object exposes `applyDateRange(day)`, `enableSelection()`, `selectByReference(ref)`,
`selectedCount()`, `recalculate()`, `confirmDialogText()`, `confirmRecalculate()`,
`resultToast()`, `rowByReference(ref)` — and deliberately exposes **no delete of any kind**.

## Data

- **Journey D fixture (fixed names, never deleted, never minted per run)** — the isolation unit is
  (own day) × (own fixed crew/job/employees) × (id-scoped execute), not per-run naming. Minting
  per-run setup rows would strand a crew plus N employees forever: `setupEntitiesApi.ts` never
  deletes setup rows, and `cleanupTargets.ts` records that employees 409 on delete while job cards
  still reference them.

  | Record | Name | Code | Created live 2026-09-29 | Notes |
  |---|---|---|---|---|
  | Crew | `D6 CREW` | `8001` | `crewCounter 2140` | |
  | Employee | `D6 PICKER ONE` | `8002` | `employeeCounter 1870` | `rate` null |
  | Employee | `D6 PICKER TWO` | `8003` | `employeeCounter 1871` | `rate` null |
  | Job | `D6 JOB` | `4601` | `jobCounter 2237` | `paymentType 1` (Piece), `overtimeRulesCounter 2`, `considerEmployeeRate false`, `pieceRate` reset to `1` |

  Ranch `B1 RANCH` (162) and field `B1 FIELD` (99) are **reused read-only** from `seedOfficeFixture`.
  `office.job` is then **overwritten** with `ensureJob({ code:'4601', name:'D6 JOB', paymentType:1 })` —
  exactly as `journeyCFlow` overwrites `office.crew`. D6 mutates the job's rate, and
  `seedOfficeFixture`'s `B1 HARVEST` is shared by every Journey B spec; mutating it would corrupt
  Journey B.

- **Protect the names.** Add `/^D\d{1,2} /` to `PROTECTED_NAME_PATTERNS` in
  `src/data/static/shared/cleanupTargets.ts` (one line, beside the existing `B` and `C` patterns),
  so the residue sweep and `fixtureReconcile` can never eat them.
  **Do NOT add a `jobCard` entry to `cleanupTargets.ts`** — that table feeds a name-prefix sweep
  across the whole tenant, job cards have no name column and no restore route, and adding one would
  recreate the shape of the Sept 2026 mass-delete exactly.

- **Fixture day:** `dayOffset -11` (B owns 0…−9, C took −10). Within the
  `maximumDaysForTransferExport = 21` window. Fixed punch times, never `now`:
  time-in `07:00:00`, crew piece-out `15:00:00`, crew time-out `15:30:00`.

- **The minimum transferable day (measured — a lone time-in yields nothing).** Three API writes,
  all on `D6 CREW` + `D6 JOB` + `B1 RANCH`/`B1 FIELD`:
  1. **Input ▸ Batch ▸ Crew Time In** — Date/Time, Crew (loads its active members, pre-selected), Ranch, Field, **Phase = the job**. A time-in with no Phase analyses as *eligible* but `plannable 0` and silently writes no job card;
  2. **Input ▸ Batch ▸ Crew Piece Out** — Date/Time, Crew, Num of Pieces, Ranch (required here), Field, Job. One row for the whole crew;
  3. **Input ▸ Batch ▸ Crew Time Out** — Date/Time, Crew. No Phase (a piece job makes Number of Pieces required, and the pieces belong to the piece-out). Only offered once the time-in is readable — the flow waits for it over the API first, or the form intermittently says "No employees with open time in found for this crew".

  These forms are stricter than the API they sit on: the API takes an explicit `employeeIds` list and any `jobCounter`, and happily punched inactive employees with no home crew against an inactive job. The forms refuse all three, which is how the fixture was found to be invalid — `prepareJourneyD` now repairs it (active + home crew + active job) before seeding.

  `numOfPieces` must respect the preference `maximumNumberOfPieces` (**5** on dev) and
  `minimumNumberOfPieces` (1) — `4` is the scenario value, giving 2 pieces per employee.

- **Rates:** `rate.before = 1.00`, `rate.after = 2.00` (the catalog's "one dollar to two").
  `pieceRateDecimalAccuracy = 3`. Written twice through a new
  `setJobRate(request, jobCounter, pieceRate)` in `src/utils/api/setupEntitiesApi.ts`
  (GET → merge → PUT, modelled on `setCrewNotifyUser` in `crewsApi.ts`): **v1 before the transfer**
  so the piece job has a rate at all, **v2 before the recalculate**.

- **Scenario JSON:** `src/data/journey-d/d06-recalculate-after-setup-change.json`, loaded with
  `loadScenario(schema, testInfo)` and validated by a new `JourneyDRecalculateCaseSchema` in
  `src/data/schemas/`. Shape: `{ shared, cases: [{ fixture, capture:{ dayOffset:-11, punch, pieceOut, timeOut, numOfPieces }, rate:{ before, after }, expected:{ jobCards:2, piecesPerCard:2, amountBefore:2, amountAfter:4, updated:2, skipped:0, failed:0 }, cleanup:[…] }] }`.
  The spec imports only `@utils/journeys/journeyDFlow` (new) — the ESLint import ban keeps
  `@utils/api/*` out of specs. The only inline literals in the spec are `testCaseId`, `tag:`,
  the title and `expect()` messages.

- **Uniqueness rules the app enforces:** job/crew/employee `code` is unique (hence the fixed 8001–8003 /
  4601 block, chosen clear of dev's 5000–7400 job codes); nothing in D6 needs a generated name.

## Preconditions

- [ ] `prepareJourneyD` ensures ranch/field from `seedOfficeFixture`, then `D6 CREW`, the two
      `D6 …` employees and `D6 JOB` (piece, `overtimeRulesCounter` = lowest id) — idempotent, never deletes.
- [ ] Session API authenticated (`sessionApi`); CSRF double-submit as in `apiLogin.ts`.
- [ ] `allowRecalculateFromJobCard` read and asserted `true` (it already is on dev — do **not** flip it).
- [ ] **Before-phase recovery sweep on the fixture day**, run before anything is seeded, so a crashed
      previous run cannot poison this one:
      1. `GET /job-cards?from=day&to=day`, filter to `jobCounter === D6 JOB` **and**
         `crewCounter === D6 CREW`, and `DELETE /job-cards/{id}` each (this resets the source time
         cards — `{sourcesReset, linkageMissing}`);
      2. then sweep the day's time cards. **`sweepFixtureCards` alone is not enough**: a crew
         piece-out row carries `employeeCounter: null`, so an employee-scoped sweep never sees it.
         The sweep must also match `crewCounter === D6 CREW && jobCounter === D6 JOB` on that day.
- [ ] `PROTECTED_NAME_PATTERNS` already contains `/^D\d{1,2} /` (module-load assertion in
      `cleanupTargets.ts` runs first).

## Cleanup

What the workflow creates and how it is removed. **The order is not hygiene — it is the only escape
hatch, and getting it wrong leaves permanently undeletable rows on dev.**

Two constraints, both measured live 2026-09-29:
* `DELETE /time-cards/{id}` on a transferred row → **409 `record.transferred_delete`**
  ("This record has been transferred and cannot be deleted.") — `lockTCsAfterTransferToJCs = true`.
* `POST /transfer-to-job-cards/runs/{runId}/reverse` → **409 `reverse_blocked`** with
  `blockers:[{jobCardCounter, reason:'job_card_edited'}]` **as soon as the card has been
  recalculated**, and reversing the recalc run first does **not** restore it (the reversal is itself
  an edit). **So the transfer reverse is unusable as D6's unwind, by design.**

The unwind that works: **`DELETE /job-cards/{id}`, by explicit id, one at a time** → `200
{sourcesReset:3, linkageMissing:false}`, after which every source time card is `transferred: false`
and deletes with `204`.

| Phase | Step | How |
|---|---|---|
| after, 1 | **[imperative]** delete D6's own job cards | for each id in the execute envelope's `days[].jobCardCounters`: `GET /job-cards/{id}` → `DELETE /job-cards/{id} {rowversion: version}`. Best-effort, logged, never fails the test. **Must run first.** |
| after, 2 | **[declarative]** `{ kind:'timeCards', employeeCodes:['8002','8003'], dayOffset:-11, cardTypes:[0,1] }` | the crew piece-out is `cardType 0` with `employeeCounter: null`, so the flow hands `runCleanup` the five card ids it created rather than relying on the employee filter |
| after, 3 | **[declarative]** `{ kind:'restore', target:'d6JobPieceRate' }` | new restorer in `runCleanup.ts`'s `RESTORERS`: snapshot `GET /jobs/{id}.pieceRate` before, `setJobRate` back after |
| after, 4 | **[nothing]** setup rows | `D6 CREW` / `D6 PICKER ONE` / `D6 PICKER TWO` / `D6 JOB` are permanent fixture, never deleted, protected by `/^D\d{1,2} /` |
| after, 5 | **[declarative]** `{ kind:'unremovable', entity:'recalcRun', … }` and `{ kind:'unremovable', entity:'transferRun', … }` | audit rows in `GET /job-cards/recalc-runs` and `GET /transfer-to-job-cards/runs`. They are **read as assertion evidence, never reversed**: an extra mutating call can fail and mask the one that matters, and reversing the transfer is blocked anyway |

No SQL. No UI delete. No `bulk-delete`. No `cleanupTargets` entry for job cards.

**Budget.** The default 120 s test timeout and the 60 s cleanup budget are both too tight for a spec
that drives two asynchronous server jobs plus a UI grid with per-action screenshots — and here a
`skipped-budget` outcome means *permanent residue*, not just an untidy report. The spec must call
`test.slow()` (or `test.setTimeout(240_000)`) and the cleanup budget for this file must be raised to
at least 120 s. Measured serial API cost of the whole arrange→recalculate→unwind chain: ~25 s; the
UI half adds the grid load, Multi Update, two checkbox clicks and the confirm round-trip.

## Test case

**One workflow, one happy-path test, one runner row, and the id is the workflow id.**

Update the existing `D6` row in `src/data/runner/journey-d.csv` (it is already there as
`status=draft, enabled=0`), then `npm run runner:sync && npm run runner:check`.

| id | Title | Tags | Category | enabled |
|---|---|---|---|---|
| `D6` | Recalculate transferred job cards onto a new piece rate without deleting them | `regression` | `ui` | 1 |

`jira` → `PET-12663`, `status` → `automated`, `testName` → `recalculateAfterSetupChange`.

```ts
test.describe('D6 · Recalculate after setup change', { tag: ['@JourneyD', '@D6'] }, () => {
    test('[Recalculate] Recalculate transferred job cards onto a new piece rate without deleting them.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'D6' }],
    }, async ({ page, sessionApi }, testInfo) => { … });
});
```

**Steps:**

1. `prepareJourneyD(scenario, { sessionApi, testInfo })` — ensure the fixture, assert
   `allowRecalculateFromJobCard === true`, run the before-phase recovery sweep (job cards first,
   then time cards), capture the current max `recalcRunCounter` from `GET /job-cards/recalc-runs`.
2. `setJobRate(job, rate.before)` (annotate `precondition: rate v1`), then seed the day:
   crew time-in → crew piece-out (`numOfPieces`) → crew time-out. Keep the five `timeCardCounter`s.
3. `analyzeTransfer({ from: day, to: day, crewIds:[crew], jobIds:[job], loadAll:true })` (poll the
   202). **Guard:** the returned `candidates` must be exactly this run's five time-card ids —
   if not, fail before executing anything. Expect `plannableTotal === 4`, `totalPieces === 4`,
   and no `severity:'block'` exception (`warn.zero_rate` is expected and harmless: the piece job has
   no hourly rate).
4. `executeTransfer(same filter)` → poll `execute/{jobId}` to `status:'complete'`. Expect
   `jobCardsWritten === 2`, `timeCardsTransferred === 5`; keep `transferRunCounter` and the two
   `jobCardCounters`.
5. Read both job cards. **Pin the arrange:** `pieces === 2`, `pieceRate === rate.before`,
   `pieceAmount === pieces × rate.before`, `exported === false`, `locked === false`. Record
   `reference`, `version`, `timeCardInCounter`, `timeCardOutCounter` per card.
6. `setJobRate(job, rate.after)` and read the job back — `pieceRate === rate.after`
   (annotate `precondition: rate v2 — the setup change`).
7. **On screen:** `/input/job-cards` → From/To = the fixture day → Apply → assert both references are
   listed → Multi Update → check exactly the two own rows → assert the selection bar reads
   `2 selected` → Recalculate → assert the dialog body contains the seeded count `2` → confirm.
8. Assert the result toast `Recalculate complete: 2 updated, 0 skipped, 0 failed.`
9. Read both job cards back by id and assert the D6-vs-D5 outcome:
   same ids, same `reference`, same `timeCardInCounter`/`timeCardOutCounter`, same `pieces`/`netTime`,
   **`version` changed**, `pieceRate === rate.after`, `pieceAmount === pieces × rate.after`.
10. Assert the day's five time cards are all still present and still `transferred === true`.
11. Assert `GET /job-cards/recalc-runs` has exactly one run newer than the captured baseline, with
    `jobCardCount === 2`, `status === 'active'`.
12. Assert both rows are still on `/input/job-cards` for the day, by Reference — the on-screen proof
    the cards were updated, not thrown away.
13. `run.cleanup()` — job cards by id, then time cards, then the rate restore.

## Open questions for the tester

- [ ] **`amount` is left at 0 by Recalculate (likely product defect).** Measured: after the transfer
      `amount = 2` (= `pieceAmount`); after the first recalculate `amount = 0` and it never comes back,
      while `pieceAmount` follows the rate exactly. The Job Cards grid's **Amount** column therefore
      shows `0.00` for a card worth `10.00`, and `pieceGrid[0].baseRate`/`amount` stay frozen at the
      old rate. Confirm this is not intended for `paymentType 1` (Piece), then file it against
      board 357 (`qa-beta-test` + `journey-d`) and link it from the runner row. Until then the spec
      asserts `pieceAmount` and records `amount` as an annotation only.
- [ ] **Which field the Job Card *edit* form shows for the new total.** The grid's Amount column is
      unusable (above); `/input/job-cards/{id}` was not opened during this exploration. If it renders
      a trustworthy Piece Rate / Piece Amount, step 12's on-screen check should read that instead of
      only the Reference.
- [ ] **Recalc-run reversibility is LIFO and one-shot.** `POST /job-cards/recalc-runs/{runId}/reverse`
      answered 200 `{recalcRunCounter, jobCardsReversed}` for the newest run, then 409
      `reverse_blocked / job_card_edited` for every earlier one — and the reversal itself then blocked
      the transfer reverse. Worth confirming with the product team that "reverse a recalculate" is
      meant to be a single-step undo only; it shapes whether D6's sibling (reverse-recalculate) is
      automatable at all.
- [ ] **`includeInTransfer` appears not to gate anything.** `B1 CREW`, `C6 CREW` and the new
      `D6 CREW` all carry `includeInTransfer: false`, yet the transfer analysed and executed their
      rows. Confirm what the flag actually does before a later spec relies on it.
- [ ] **`jobRateHistory`.** `GET /jobs/{id}` returns `jobRateHistory: []`. If dated rate rows are a
      real feature, a recalculate may pick the rate effective on the *card's* date rather than the
      job's flat `pieceRate` — which would change how D6's rate v2 must be written. Empty on dev, so
      untested.

## Resolution (orchestrator, 2026-09-29 — live probes on app.ptdev.xyz as `su`)

Every item below was measured, not inferred. The probe seeded the `D6 …` fixture (kept — it is the
plan's fixture), created 5 time cards and 2 job cards on 2026-09-18, ran a real transfer, three
recalculates and a full unwind; the day was left exactly as found (only the foreign rows `8351`,
`8352`, job card `615` remain) and the job rate was reset to `1`.

- **Q1 — what makes a transferable day.** Answered by three successive analyses:
  1. crew time-in only → `plannableTotal 0`, `warn.incomplete_time_in` *"No corresponding
     Time-Out/Piece-Out(without Job)/Crew-Piece-Out was found"*;
  2. + crew piece-out (100 pieces) → `block.piece_above_maximum` *"Pieces 100 can not be more than
     maximum 5"*; re-seeded at 4 → still `plannableTotal 0`, new warning
     `warn.crew_piece_leftover_skipped` *"Crew piece-out … has no same-job time-pair cards"*;
  3. + crew time-out → **`plannableTotal 4`, `eligibleTotal 5`, `totalPieces 4`, no blocking
     exception**. `job-cards-preview` then returned 2 rows, each
     `{sourceRecordIds:[12178,12182], pieces:2, amount:2, grossMinutes:510, netMinutes:510, jobPaymentType:1}`.
     **Minimum shape = crew time-in + crew time-out + crew piece-out, all on the same crew and job.**
- **Q2 — the rate is settable over the API (the brief's assumption was wrong).** `POST /jobs`
  **accepts** `pieceRate` on create (created a probe job with `pieceRate:1`, GET returned 1), and
  `PUT /jobs/{id}` with the GET body merged answered **204** with the value persisted and `version`
  bumped. The probe job was then removed with `DELETE /jobs/{id} {rowversion}` → 204. **No Job page
  object is needed; the Generator implements `setJobRate` (GET → merge → PUT).**
- **`allowRecalculateFromJobCard` is already `true`** on dev. The spec asserts it, never writes it.
  Related preferences read live: `lockTCsAfterTransferToJCs=true`, `maximumNumberOfPieces=5`,
  `minimumNumberOfPieces=1`, `maximumDaysForTransferExport=21`, `pieceRateDecimalAccuracy=3`,
  `handleTransferJcException="TransferWithConfirmationWhenExceptions"`, `houlyMinimumWageCounter=null`
  (so no minimum-wage make-up can mask the delta), `lockJobCardsAfterExport="No"`.
- **`/execute` body.** Requires `from`; **`recordIds` is ignored** by the transfer filter (an analyze
  restricted to 2 ids returned the same 5 candidates). `crewIds` and `jobIds` **do** scope it —
  `crewIds:[231]` (B1 CREW) returned 0 candidates against the same day. So the spec scopes by
  crew + job **and** still asserts the analyze candidate set equals exactly its own rows before
  executing. `POST` answers 202 `{jobId}`; `GET execute/{jobId}` polls to
  `{status:'complete', jobCardsWritten:2, timeCardsTransferred:5, transferRunCounter:39,
  days:[{employeeCounter, date, jobCardCounters:[741], sourceTimeCards:[12178,12182,12181]}, …]}`.
- **`/reverse` body.** The real route is `POST /transfer-to-job-cards/runs/{runId}/reverse`, **no
  body** (`POST /transfer-to-job-cards/reverse` is a 404; `/transfer-to-job-cards/reverse` is a UI
  route and `GET /transfer-to-job-cards/runs` is the reversible-runs list). It answered **409
  `reverse_blocked`** with `blockers:[{741,'job_card_edited'},{742,'job_card_edited'}]` — i.e.
  **a recalculated card permanently blocks the transfer reverse**, and reversing the recalc run first
  does not help. This overturns the brief's corrections 4/5/7: the unwind is
  `DELETE /job-cards/{id}` (200 `{sourcesReset:3}`), which flips every source time card back to
  `transferred:false` and makes them deletable (204 each). Verified end to end.
- **`GET /job-cards` row shape.** Params `from`/`to` (inclusive, `YYYY-MM-DD`), returns a bare array.
  Id key `jobCardCounter`; concurrency token `version`; relevant fields `reference`, `pieces`,
  `pieceRate`, `pieceAmount`, `amount`, `timeAmount`, `hourlyRate`, `paidPieces`, `netTime`,
  `grossTime`, `calculationDesc`, `pieceGrid`, `shiftBreakdown`, `exported`, `locked`, `lockStatus`,
  `modifiedAfterExport`, `programCreated`, `jobPaymentType`, `rateSource`, `pieceRateSource`,
  `amountSource`, `timeCardInCounter`, `timeCardOutCounter`. **There is no creation timestamp** —
  `reference` is the stable creation stamp, so it carries assertion (b).
- **Employee rate override.** `GET /employees/{id}` exposes `rate` and `effectiveRate` (both `null`
  on the D6 employees); the job carries `considerEmployeeRate: false`. With that flag off the job's
  `pieceRate` is the sole source, so the fixture is deterministic. The job also returns
  `jobRateHistory: []` — see Open questions.
- **`/job-cards/recalculate` returns no runId.** It requires **`recordIds`** (400 `recordIds is
  required` on an empty body), answers 202 `{jobId}`, and the poll returns
  `{status:'complete', result:{summary:{matchedCount, updatedCount, modifiedAfterExportCount,
  failedCount, warningCount}, failures:[], warnings:[], truncated:false}}`. The run row is found via
  `GET /job-cards/recalc-runs` → `{runs:[{recalcRunCounter, authorCounter, authorName, runAtUtc,
  jobCardCount, status}]}` — capture the max counter before, assert exactly one newer row after.
  A per-card variant `POST /job-cards/{id}/recalculate` exists and answers **200 synchronously** with
  the recalculated card; D6 uses the screen's bulk action, not this.
- **UI locators** — captured live, listed in §Screens. The two non-obvious ones: **Multi Update is
  what reveals the row checkboxes** (they are `aria-hidden`/`opacity-0`/`pointer-events:none` until
  it is pressed, and hovering does nothing), and the confirm is an `alertdialog` whose body read
  verbatim **"Recalculate the 2 checked job card(s)? Exported and date-locked rows will be skipped."**
  with the toast **"Recalculate complete: 2 updated, 0 skipped, 0 failed."**
- **Rate delta proven twice.** 1.00 → 2.00: `pieceRate 1→2`, `pieceAmount 2→4`, `version
  AAAAAAAD6fk= → AAAAAAAD6hY=`, ids/references/source links unchanged. Then 2.00 → 5.00 through the
  **UI** on two checked rows: both cards `pieceRate 5`, `pieceAmount 10`, versions changed, recalc run
  `7` with `jobCardCount 2`. `amount` stayed `0` throughout — see the defect line in Expected outcomes.
- **Exception catalogue observed** (useful for later Journey D plans): `warn.zero_rate`,
  `warn.incomplete_time_in`, `warn.crew_piece_leftover_skipped`, `block.piece_above_maximum`,
  `block.crew_piece_partial_selection` ("User filter does not select all Time-Ins for the Crew…"),
  `block.piece_job_payment_type`; `rejectedCounts` reason codes `deferred.held_for_review`,
  `deferred.piece_out`, `deferred.crew_grouping`, `deferred.crew_piece_with_job`,
  `deferred.crew_piece_with_supervisor`, `deferred.crew_piece_pieces_as_time`,
  `deferred.salaried_employee`, `deferred.irrigator`.
- **Tooling note.** `planner_setup_page` cannot use `tests/seed.spec.ts`: the `chromium` project
  `testIgnore`s it (playwright.config.ts line 277), so the MCP server collects zero tests and reports
  `seed test not found`. This exploration borrowed `tests/web/journey-c-packhouse/c06-…spec.ts` as the
  seed. Either drop `**/tests/seed.spec.ts` from the `testIgnore` list and give it a tier tag, or move
  the agents' scratch page under a collected path — otherwise every future Planner hits the same wall.
