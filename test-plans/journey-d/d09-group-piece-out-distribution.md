# `D9` · Group piece-out distribution

> **The split, proved before and after it commits.** A crew piece-out is captured as *one* row
> with no employee on it; the transfer is what turns it into per-person job cards. D9 seeds a day
> where **three** crew members are home-crewed but only **two** punch in, reads the crew total and
> the proposed per-person split on the Transfer screen *before anything commits*, runs the transfer,
> and then proves on screen and over a read-only GET that the two participants each got 2 pieces,
> that the third got nothing, and that `sum(per-card pieces) == the crew piece-out total`.
>
> **Binding safety constraints** (all verified live 2026-10-01):
> * The transfer is driven on screen and ticked **by Reference**. The header **"Select all rows"
>   is select-all-across-the-filter**, not the visible rows; nothing here ever touches it.
> * The grid is additionally **scoped to `D9 CREW` with the Work Crew filter** before any row is
>   ticked. A bare date scope is not safe: day -12 slides, and dev carries foreign *untransferred*
>   rows on most days in the 21-day window (measured: 2026-09-15, -16, -17, -20, -21, -22, -23, -25).
> * The per-row **"Delete Time Card ..."** button on the Transfer grid, the per-row **"Delete Job
>   Card ..."** button and the **Delete** button on the Job Card edit form are **forbidden**, as is
>   `POST /job-cards/bulk-delete`. A "delete all loaded" wiped ~9.5 k dev job cards in Sept 2026 and
>   there is no restore route. Cleanup deletes this run's **own** job cards by explicit id over the
>   API, one at a time, each with its own rowversion.
> * The Job Cards preview tab's **"Remove all (N)"** and per-row **"Remove from transfer"** controls
>   are never used — they silently change what the commit would write.

Source: no recording; office surface confirmed live 2026-10-01 (app.ptdev.xyz, `su`).
Manual source WEBPET-2054 (passed QA 2026-09-10).

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `D9` |
| Jira | `PET-12666` — [D9] Group piece-out distribution |
| Recording | — none |
| This plan | `test-plans/journey-d/d09-group-piece-out-distribution.md` |
| Spec | `tests/web/journey-d-office/d09-group-piece-out-distribution.spec.ts` |
| Scenario | `src/data/journey-d/d09-group-piece-out-distribution.json` |
| Runner row | `src/data/runner/journey-d.csv` → `D9` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `D9` |
| Journey | `D` — Daily office processing (the engine) |
| Segments | `grower` · `perennial-grower` · `pack-house` |
| Modules | `Piece Payment` |
| Surface | `calc` — spec in `tests/web/journey-d-office/`; runner category `workflow` |
| Demo candidate | no |
| Catalog status | ticketed (PET-12666) |

**Summary** (from the catalog)
> A crew piece-out captured as one total is distributed to individual members during the transfer.
> If the split is wrong, reverse and redistribute.

## Catalog steps

| # | Catalog step | Office surface (live 2026-10-01) | Automatable? |
|---|---|---|---|
| 1 | The transfer reads the crew piece-out total (from B8). | **Input ▸ Transfer to Job Cards** `/transfer-to-job-cards`. Scope the day on `#transfer-date-scope` → **Analyze Transfer Candidates** (`v2-grid-refresh`) → filter **Work Crew** = `D9 CREW` (`transfer-grid-filter-crews`). The crew piece-out appears as one row, Type **"Piece Out"**, **Employee `—`**, **Pieces `4`**, and the grid's totals strip (`timecards-totals-strip-issues`) reads `... Pieces 4 ...`. Nothing is committed by any of this. | **yes, on screen** — and it runs *before* the transfer, which is what makes it a proof that the transfer *read* the total rather than a restatement of what was seeded. |
| 2 | It distributes the pieces across the participating crew members. | Same screen, **Job Cards tab** (`ttjc-tab-jobcards`) — the pre-commit preview of exactly the cards this transfer would write: one row per participant, **Employee** (col 1) and **Number of Pieces** (col 12), with a totals bar (`jobcards-totals-bar`) carrying `Pieces`, `Job Cards` and `Employees`. Then the real commit: tick each own Reference, **"Transfer to Job Cards N"**. Afterwards **Input ▸ Job Card** `/input/job-cards` lists one row per participant (Type **Piece**), and each row's **Edit Job Card** form shows the committed `#pieces`. | **yes** — this is the workflow, driven and read on screen. The `/input/job-cards` *grid* proves **who** got a card; the **edit form** proves **how many pieces**, because the grid has no Pieces column. |
| 3 | If the distribution is wrong (wrong count or a missing member), reverse, correct the pieces, and re-transfer. | Transfer screen toolbar **Reverse** → `/transfer-to-job-cards/reverse`; `POST /transfer-to-job-cards/runs/{runId}/reverse`. | **no — deferred: catalog D5 "Reverse and redo" owns reverse-and-re-transfer.** It is a conditional branch, not the happy path, and giving it to two workflows would duplicate the coverage and the maintenance. No reverse helper is built for D9. |

## Expected outcomes

- When a day carries one crew time-in for two of a three-member crew, one crew piece-out of **4**
  pieces for the whole crew, and one crew time-out, the Transfer screen scoped to that day and that
  crew shall list **5** candidate rows and the crew piece-out shall render with **Employee `—`**,
  **Type "Piece Out"**, **Pay by Piece "Yes"** and **Pieces `4`** — the crew piece-out carries no
  employee by design, which is the whole reason D9 exists.
- When that grid is loaded, its totals strip shall report **`Pieces 4`** — the transfer has read the
  crew piece-out total, and it has read it *before anything commits*.
- When the Job Cards tab is opened on the same analysis, PET Tiger shall preview exactly **2** job
  cards, one per participant, each with **Number of Pieces `2`**, and the preview's totals bar shall
  read **`Job Cards 2`**, **`Employees 2`** and **`Pieces 4`**. `D9 PICKER THREE` shall appear in no
  preview row.
- When the ticked rows are transferred, PET Tiger shall write exactly **2** job cards for the crew on
  that day, and `GET /job-cards?from=day&to=day` shall return, for each participant exactly once,
  `pieces === 2`, `pieceRate === 1`, `pieceAmount === 2`, `exported` falsy and `locked` falsy.
- **Conservation.** The sum of `pieces` across the written job cards shall equal the crew piece-out's
  own `numOfPieces` — `2 + 2 === 4`. Nothing is created and nothing is lost by the distribution.
- When `/input/job-cards` is loaded for the fixture day, the rows **whose Crew is `D9 CREW`** shall
  number exactly **2**, both written References shall each be listed once, each with **Type
  "Piece"** and an **Employee** cell naming one participant, and **no row shall name
  `D9 PICKER THREE`** — the on-screen proof that a crew member who did not work receives no card.
  The count is **crew-scoped, not day-scoped**: the grid filters by date only, and the day carries
  other tenants' cards (see Resolution 6).
- When each written card's **Edit Job Card** form is opened, its **Pieces** field shall read `2` and
  its **Piece Rate** field `1` — the committed per-card split, read on screen rather than only over
  the API.
- The day's five time cards shall all be `transferred === true` after the commit, and the crew
  piece-out among them shall still carry `employeeCounter: null` — the transfer distributes the
  total, it does not rewrite the capture.
- The Job Cards grid's **Amount** column and each card's `amount` field.
  _— **deferred: known product defect** (D6, measured 2026-09-29: `amount` is left at 0 while
  `pieceAmount` tracks the rate correctly). D9 records `amount` as a test annotation and asserts
  `pieceAmount`. Do not weaken this to "amount is 0"._
- Reverse → correct the pieces → re-transfer.
  _— **deferred: catalog D5 "Reverse and redo" owns reverse and redo.** No reverse/runs helper is
  built here, and the Transfer screen's **Reverse** toolbar button is never clicked._
- Filtering the Transfer grid by **Employee** to see one person's share of a crew piece-out.
  _— **not automatable: WEBPET-3397 (In Progress)** — the employee filter reports 0 pieces for crew
  piece-out rows. Avoided by design: D9 filters by **Work Crew**, which was measured live and does
  recompute the piece total correctly (8 rows / 250 pieces → 7 rows / 125 pieces on the probe day)._
- A split that is *not* even — e.g. two members with different hours under
  `distributeCrewPiecesByHours = "ByTimeWorked"`.
  _— **deferred: a second ticket.** D9 gives both participants one shared crew time-in and one shared
  crew time-out so their hours are identical by construction; that is what makes 2/2 deterministic
  while WEBPET-3406 / 3450 / 3453 rework the whole/half-vs-fractional rule. An uneven split is a
  different workflow assertion, not this happy path._
- The Transfer grid's per-row "Delete Time Card", the Job Cards tab's "Remove from transfer" /
  "Remove all", the Job Card edit form's "Delete", and `job-cards/bulk-delete`.
  _— **not automatable here: forbidden by the safety constraints above.** The page objects expose
  none of them._
- On-blur validation, Save-stays-disabled and the "Unsaved changes" bar on the Setup and Batch forms.
  _`(POM)` — relied on throughout `SetupScreenPage` / `CrewPunchPage` and the `ensureOnScreen`
  helpers; exercised by every fixture row and every punch, not asserted separately._

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Setup ▸ Crew / Employee / Job | `/setup/crews\|employees\|jobs/new`, `/{id}` | `src/pages/setup/CrewPage.ts`, `EmployeePage.ts`, `JobPage.ts` | **exists** — driven only through `src/utils/fixtureRows/ensureOnScreen.ts`; D9 is its first consumer |
| Input ▸ Batch ▸ Crew Time In / Crew Piece Out / Crew Time Out | `/input/crew-*/new` | `src/pages/input/CrewTimeInPage.ts`, `CrewPieceOutPage.ts`, `CrewTimeOutPage.ts` on `CrewPunchPage` | **exists** — `CrewTimeInPage.selectOnlyEmployees()` already does the deselect-then-tick that D9's two-of-three punch needs |
| Transfer to Job Cards — Time Cards tab | `/transfer-to-job-cards` | `src/pages/processing/TransferToJobCardsPage.ts` | **extended** — readers only (`piecesTotal`, `rowPieces`, `rowEmployee`, `crewPieceOutRows`) plus the Work Crew filter and the Job Cards tab; `scopeToDay` switched to the calendar-cell path. No new action, no delete, never `Select all rows` |
| Transfer to Job Cards — **Job Cards tab** (pre-commit preview) | same screen, `ttjc-tab-jobcards` | same page object | **new behaviour** — nothing in the repo has ever clicked this tab |
| View ▸ Job Cards (list) | `Input ▸ Job Card` / `/input/job-cards` | `src/pages/processing/JobCardsPage.ts` | **extended** — `cellAt` + `rowEmployee` + `rowsForDay`; it has `rowByReference` but no cell accessor today |
| Job Card edit form | `/input/job-cards/{id}` | `src/pages/processing/JobCardsPage.ts` (or a thin `JobCardFormPage`) | **new** — read-only openers for `#pieces` / `#pieceRate` / `#employeeCounter`. **Exposes no Delete and no Save.** |

### Transfer screen — Time Cards tab (measured live 2026-10-01)

| Element | Locator | Note |
|---|---|---|
| Date scope | `page.getByTestId('transfer-date-scope').getByRole('button', { name: 'Dates' })` | opens a dialog with **six** `input[type=text]` (Month/Day/YYYY × 2), two calendars, presets and `Apply`; chip then reads `MM/DD/YYYY – MM/DD/YYYY`. Future days are disabled. **Use the calendar day cell, not the segment inputs** — see Resolution 5 |
| Analyze | `getByTestId('v2-grid-refresh')`, accessible name `Analyze Transfer Candidates`; label flips to `Analyzing...` | the grid stays on *"Ready to analyze."* until this is pressed |
| **Work Crew filter** | `getByTestId('transfer-grid-filter-crews')` → popover `searchbox "Search work crew..."` → `button "<crew name>"`; clear with `button "Clear (N)"` | **populated from the loaded rows, so it is empty before the analyze** ("No results."). Applying it re-filters the grid, the checkboxes, the issue counts **and the totals strip** |
| Grid caption | grid `aria-label` = `Includes N Time Cards of M initial selection` | also rendered as the first span of the totals strip |
| **Totals strip** | `getByTestId('timecards-totals-strip-issues')` | `textContent` = `Includes 8 Time Cards of 8 initial selectionGross4.0000Net4.0000Meals0.0000Pieces250Employees3`. Parse the piece total with `/Pieces([\d.,]+)/` — the value span is a bare `<span>` with no role or testid, so the strip's text is the stable read. Integer-formatted here |
| Row | `getByRole('row', { name: '<reference>' })`; row checkbox `getByRole('checkbox', { name: 'Select <reference>' })` | |
| **`cellAt(row, i)` column map — CONFIRMED unchanged** | 0 select · 1 add-record · 2 **delete (forbidden)** · 3 Crew · **4 Employee** · 5 date · 6 time · 7 Field · 8 Job · **9 Pieces** · 10 Traceability · 11 Ranch · 12 Reference · 13 Type · 14 Pay by Piece · 15 Transferred · 16 Export Identifier · 17 Run · 18 Employee Selection · 19 Status | verified against a real crew piece-out row (`0000004-260915-PO-S75-ui`): cell 4 = `—`, cell 9 = `125`, cell 13 = `Piece Out`, cell 14 = `Yes` |
| Status badge | `row.getByRole('status')` | reading the *cell* yields `"ReadyManually edited"` on a flagged row |
| Commit | `pageRoot.getByRole('button', { name: /^Transfer to Job Cards(\s|$)/ })` — label gains the ready count, e.g. `Transfer to Job Cards 4` | disabled while a banner reads `N blocking issues to resolve before transfer` |
| **Never touch** | header `checkbox "Select all rows"`, per-row `button "Delete Time Card <ref>"`, toolbar `button "Reverse"`, `checkbox "Hide piece-outs"` (it hides exactly the row D9 asserts on) | |

### Transfer screen — Job Cards tab (pre-commit preview, measured live)

| Element | Locator | Note |
|---|---|---|
| Tab | `getByTestId('ttjc-tab-jobcards')` | empty until the Time Cards tab has analysed: *"Set a date range on the Time Cards tab to preview the job cards this transfer would produce."* |
| Grid | `getByTestId('data-grid')`, `aria-label` = `Includes N of M Job Cards` | |
| Row | `aria-label` is only **`Row 1`, `Row 2`, ...** — there is no reference and no testid | locate a participant's row by filtering rows on the employee's **name** |
| Column map | 0 remove-from-transfer · **1 Employee** · 2 Job · 3 Crew · 4 Date Time In · 5 Date Time Out · 6 Gross Time · 7 Meal · 8 Net Time · 9 Regular Hours · 10 Overtime · 11 Double Time · **12 Number of Pieces** · 13 Amount | |
| Totals bar | `getByTestId('jobcards-totals-bar')` (count alone: `getByTestId('jobcards-totals-count')`) | `...Pieces0.000000Job Cards3Employees2...` — **six decimal places here**, unlike the Time Cards strip. Parse with `Number()` |
| **Never touch** | `button "Remove all (N)"`, per-row `button "Remove from transfer"` | they change what the commit would write |

### `/input/job-cards` (measured live)

Toolbar: Report · Map · Export Contract Labor · Multi Update · Recalculate · New Job Card. **There is
no column chooser.**

| Element | Locator |
|---|---|
| Page / heading | `page.goto('/input/job-cards')`, `getByRole('heading', { name: 'Job Cards', level: 1 })` |
| Date scope | `#filter-from` / `#filter-to` (`getByRole('textbox', { name: 'From'/'To' })`), value `YYYY-MM-DD`, plain `fill()`; **Apply** = `getByTestId('list-date-range-apply')` (disables itself; URL becomes `?from=...&to=...`) |
| Grid / row | `getByRole('grid', { name: 'Job Cards' })`; `getByRole('row', { name: '<reference>' })`; footer `status` reads `Total N rows` |
| **Column map** | 0 select · 1 **Delete Job Card (forbidden)** · 2 Reference · 3 Date · 4 Type · **5 Employee** · 6 Job · 7 Crew · 8 Ranch · 9 Amount · 10 Exp · 11 CA Exp · 12 Status · 13 Edit link |
| Edit link | `link "Edit Job Card: <reference>"` → `/input/job-cards/{id}` |
| **No Pieces column exists** | — hence the edit-form read below |

### Job Card edit form `/input/job-cards/{id}` (measured live — answers D6's open question #2)

`h1` = `Edit Job Card: <reference>`. Sub-nav General / Shift Breakdown / Comment / Piece Grid.
Trustworthy reads: **`#pieces`** (`spinbutton "Pieces *"`), **`#pieceRate`** (readonly),
`#employeeCounter` (`combobox "Employee *"`), `#amount` (readonly — the defective one), plus
readonly `Piece Amount` and `Paid Pieces`. Footer carries **Delete** / Cancel / Recalculate / Save —
the page object exposes **none** of them; D9 opens the form, reads, and leaves it pristine.

### Employee cell text — a trap

The Employee cell is rendered from the employee's **`exportIdentifier`**, not its code:
`"2345 : A Kishore"` for employee 767 (`code "1767"`, `exportIdentifier "2345"`), and
`": Chandra Annavarapu"` when `exportIdentifier` is null — and the `/input/job-cards` grid renders
some rows as the bare name (`"B5 STICKER SIX"`). The Setup ▸ Employee form does **not** auto-populate
Export Identifier, so the D9 pickers will have `exportIdentifier: null`.
**Never assert an Employee cell by exact text.** Assert `toContainText(<employee name>)`, and prove
`D9 PICKER THREE`'s absence with `not.toContainText` over the whole grid.

## Data

- **Journey D fixture, D9 block (fixed names, never deleted, never minted per run).** The isolation
  unit is (own day) × (own crew/job/employees) × (crew-scoped screen) × (id-scoped cleanup).
  Built through `src/utils/fixtureRows/ensureOnScreen.ts` — **existence is a GET, the create and any
  repair are UI**. Do **not** clone D6's `ensureCrew` / `ensureEmployee` / `ensureJob` /
  `ensureFixtureUsable` path: those are API POSTs and a raw `request.put`, i.e. live
  `UiFirstViolation`s under the write guard.

  | Record | Name | Code | Free on dev 2026-10-01? | Notes |
  |---|---|---|---|---|
  | Crew | `D9 CREW` | `8010` | yes (live **and** recycle bin) | |
  | Employee | `D9 PICKER ONE` | `8011` | yes | participates; home crew `D9 CREW` |
  | Employee | `D9 PICKER TWO` | `8012` | yes | participates; home crew `D9 CREW` |
  | Employee | `D9 PICKER THREE` | `8013` | yes | active, home crew `D9 CREW`, **does not punch in** |
  | Job | `D9 JOB` | **`4603`** | yes | `paymentType: 'Piece'`, `pieceRate: 1` |

  **`4602` must NOT be used.** It is held by a soft-deleted `D6 JOB RATE PROBE`
  (`GET /jobs/deleted`). A binned setup row keeps owning its code on an unfiltered unique index
  (WEBPET-2368), and `restoreFromRecycleBin` matches code **and** name — so it will not restore, the
  New Job form 409s, and `ensureJobOnScreen` throws. `4603` is clear in both lists.

  Ranch `B1 RANCH` (162) and field `B1 FIELD` (99) are **reused read-only**; `office.crew` and
  `office.job` are then overwritten with the D9 rows, exactly as `journeyCFlow` does. D6's `entities`
  block is left untouched so the one green Journey D spec cannot regress.

- **Protect the names.** `PROTECTED_NAME_PATTERNS` in
  `src/data/static/shared/cleanupTargets.ts` already carries `/^D\d{1,2} /`, which shields every
  `D9 ...` row from the residue sweep and `fixtureReconcile`. **Do NOT add a `jobCard` entry to
  `cleanupTargets.ts`** — that table drives a name-prefix sweep across the whole tenant, job cards
  have no name column and no restore route, and adding one would recreate the September 2026
  mass-delete exactly.

- **Fixture day: `dayOffset: -12`** (B owns 0...-9, C -10, D6 -11), inside
  `maximumDaysForTransferExport = 21`. Fixed punch times, never `now`: crew time-in `07:00:00`,
  crew piece-out `15:00:00`, crew time-out `15:30:00` (8.5 h, the shape D6 proved transferable).

- **The minimum transferable day** (D6, measured): crew time-in **with a Phase (job)** → crew
  piece-out → crew time-out, all on the same crew and job. A time-in with no Phase analyses as
  eligible but `plannable 0`; a day with no crew time-out yields `plannableTotal 0` +
  `warn.incomplete_time_in`. D9 adds one thing: the time-in is restricted to **two of the three**
  members via `CrewTimeInPage.selectOnlyEmployees([pickerOne, pickerTwo])` (members arrive
  pre-checked, so this deselects all then re-ticks). `GET /time-cards/crew-time-in/employees?crewCounter=...`
  returns exactly the crew's active home-crewed members, so all three will be offered.

- **Pieces: 4, split 2 / 2.** `maximumNumberOfPieces = 5` and `minimumNumberOfPieces = 1` on dev
  (re-read live 2026-10-01) — 4 is deliberate headroom. The split rule read live:
  `distributeCrewPiecesByHours = "ByTimeWorked"`, `distributeIndividualWholePiece = true`,
  `roundPaidPiecesUp = false`, `pieceOutIncludesOnlyTimeInEmployees = true`. Both participants share
  **one** crew time-in and **one** crew time-out, so their hours are identical by construction and
  every candidate rule — by time worked, by head count, whole or fractional — yields 2 / 2.

- **Scenario JSON** `src/data/journey-d/d09-group-piece-out-distribution.json`, loaded with
  `loadScenario(schema, testInfo)` and validated by a new **`JourneyD9DistributionCaseSchema`** in
  `src/data/schemas/journeyDScenario.ts` (D6's schema is hard-pinned to `workflow: z.literal('D6')`
  and `dayOffset === -11`, so it cannot be reused). `.strict()`, with `superRefine` encoding the
  plan's invariants:
  `workflow === 'D9'` · `dayOffset === -12` · `capture.numOfPieces <= 5` ·
  `participants.length >= 2` · `nonParticipants.length >= 1` ·
  **conservation: `expected.piecesPerCard * expected.jobCards === capture.numOfPieces`** ·
  `expected.jobCards === participants.length` · `punch < pieceOut < timeOut` ·
  a `timeCards` cleanup step with `cardTypes: [0, 1]` is required.
  The spec imports only `@utils/journeys/journeyDFlow`; the only inline literals in it are
  `testCaseId`, `tag:`, the title and `expect()` messages.

- **Uniqueness rules the app enforces:** crew / employee / job `code` is unique database-wide **and
  across the recycle bin**; nothing in D9 needs a generated name, because the fixture rows are fixed
  and the time/job cards have no name at all.

## Preconditions

- [ ] `PROTECTED_NAME_PATTERNS` contains `/^D\d{1,2} /` (module-load assertion in
      `cleanupTargets.ts` runs first). Already true.
- [ ] Session API authenticated (`sessionApi`); CSRF double-submit as in `apiLogin.ts`.
- [ ] Ranch `B1 RANCH` / field `B1 FIELD` present; then **on screen** via `ensureOnScreen`:
      `D9 CREW`, the three `D9 PICKER ...` employees (active, home crew `D9 CREW`) and `D9 JOB`
      (Piece, `pieceRate 1`). Idempotent; never deletes. Order matters — the crew must exist before
      the employees, because the New Employee form's Crew combobox arrives pre-filled with `B1 CREW`
      and must be overwritten.
- [ ] Preferences read and asserted (never written): `maximumNumberOfPieces >= capture.numOfPieces`
      and `minimumNumberOfPieces <= capture.numOfPieces`. If `maximumNumberOfPieces` has moved below
      the scenario value the test must fail loudly, not skip.
- [ ] **Before-phase recovery sweep on the fixture day**, run before anything is seeded, so a crashed
      previous run cannot poison this one:
      1. `GET /job-cards?from=day&to=day`, filter to `crewCounter === D9 CREW` **and**
         `jobCounter === D9 JOB`, then `DELETE /job-cards/{id}` each (this resets the source time
         cards to `transferred:false`, which is the only thing that makes them deletable);
      2. then sweep the day's time cards by **crew**. The generic employee-scoped sweep is not
         enough: a crew piece-out carries `employeeCounter: null`, and the crew time-in/time-out
         carry no job.
- [ ] The Transfer screen's **Work Crew filter must be applied before any row is ticked** (see
      §Test case step 4). Without it the candidate roster is date-scoped and will include foreign
      untransferred rows on most calendar days.

Implement all of this in the spec's own arrange phase — the fixture rows **on screen** through
`ensureOnScreen`, the punches **on screen** through the Batch page objects — never by chaining onto
another spec and never by POSTing a record into existence.

## API allowances

Every call this spec makes outside the browser. **A step a user performs on screen has no row here**
— the three punch forms, the date scope, the analyze, the Work Crew filter, the Job Cards preview
tab, the ticking of rows, the commit, the `/input/job-cards` load and the Job Card edit-form reads
are all UI and appear nowhere below.

| Step / call | Endpoint | Allowance | Why |
|---|---|---|---|
| preference gate read | `GET preferences` | read | `maximumNumberOfPieces` / `minimumNumberOfPieces` gate the scenario; never written |
| fixture-row existence lookup | `GET crews` · `GET employees` · `GET jobs` · `GET ranches` · `GET fields` (+ `GET <entity>/{id}` for the repair check) | read | `ensureOnScreen`: existence is a GET, the create and the repair are UI |
| binned fixture row restore | `POST <entity>/{id}/restore` | cleanup | undoes someone else's deletion rather than creating anything; already wrapped in `allowApiWrites('cleanup', ...)` inside `ensureOnScreen`. A `RecycleBinPage` would retire it |
| before-phase sweep — own job cards | `GET job-cards?from&to` → `DELETE job-cards/{id}` | cleanup | a crashed previous run's cards must go before the day can be re-seeded; deleting the card resets its sources |
| before-phase sweep — own time cards | `GET time-cards?from&to` → `DELETE time-cards/{id}` | cleanup | crew-scoped, because the piece-out has no employee and the punches have no job |
| sync point between the punch forms | `GET time-cards?from&to` | read | the Crew Time Out form only offers employees with an **open** time-in, so the flow waits until the saved time-ins are readable |
| record this run's time-card ids + References | `GET time-cards?from&to` | read | the roster guard and cleanup both key on them, and they are recorded **before** any assertion runs |
| read back the written job cards | `GET job-cards?from&to` · `GET job-cards/{id}` | read | records the ids for cleanup on every poll, before the count is asserted; corroborates the on-screen numbers (`pieces`, `pieceRate`, `pieceAmount`, `exported`, `locked`) |
| after-phase teardown — job cards | `DELETE job-cards/{id}` (with `{rowversion}`) | cleanup | by explicit id, one at a time; registered by the flow |
| after-phase teardown — time cards | `DELETE time-cards/{id}` | cleanup | by id, from the ids recorded above |

No DB. No UI delete. No `bulk-delete`. No reverse. No write to any preference or setup record.

## Cleanup

What the workflow creates, and how it is removed. **The order is not hygiene — it is the only escape
hatch, and getting it wrong leaves permanently undeletable rows on dev.**

Two constraints carried over from D6, both measured live:
* `DELETE /time-cards/{id}` on a transferred row → **409 `record.transferred_delete`**
  (`lockTCsAfterTransferToJCs = true`, re-read `true` on 2026-10-01).
* `POST /transfer-to-job-cards/runs/{runId}/reverse` is not D9's unwind — D9 never reverses.

The unwind that works: **`DELETE /job-cards/{id}`, by explicit id, one at a time** → `200
{sourcesReset, linkageMissing:false}`, after which every source time card is `transferred: false`
and deletes with `204`.

| Phase | Step | How |
|---|---|---|
| after, 1 | **[imperative]** delete D9's own job cards | for each id recorded from the scoped `GET /job-cards`: `GET /job-cards/{id}` → `DELETE /job-cards/{id} {rowversion: version}`. Best-effort, logged, never fails the test. **Must run first.** |
| after, 2 | **[declarative]** `{ kind:'timeCards', employeeCodes:['8011','8012','8013'], dayOffset:-12, cardTypes:[0,1] }` | the flow hands `runCleanup` the five card ids it actually created, because the crew piece-out is `cardType 0` with `employeeCounter: null` and an employee filter would never see it |
| after, 3 | **[imperative]** crew-scoped day sweep | `GET /time-cards?from=day&to=day` filtered to `crewCounter === D9 CREW`, `DELETE` each survivor — the belt to step 2's braces |
| after, 4 | **[nothing]** setup rows | `D9 CREW` / the three `D9 PICKER ...` / `D9 JOB` are permanent fixture, never deleted, protected by `/^D\d{1,2} /` |
| after, 5 | **[nothing]** the transfer run | `GET /transfer-to-job-cards/runs` keeps an audit row. It is **read as evidence at most, never reversed** — an extra mutating call can fail and mask the one that matters |

No entity in this spec has a name, so nothing here is swept by prefix. Every delete is by id, from
an id recorded **before** the assertions ran, so teardown still knows the cards when an assertion
fails.

**Budget.** The default 120 s test timeout and the 60 s cleanup budget are both too tight for a spec
that drives three Batch forms, three Setup forms on a cold fixture, two Transfer tabs, a grid and two
edit forms with per-action screenshots — and here a `skipped-budget` outcome means *permanent
residue*, not an untidy report. The spec calls `test.slow()` **and** `test.setTimeout(360_000)`.

## Test case

**One workflow, one happy-path test, one runner row, and the id is the workflow id.** No negative,
edge, boundary or additional-positive cases — if the app needs those, they belong in a separate
ticket, not this plan.

The `D9` row already exists in `src/data/runner/journey-d.csv` as a reservation, so this is a flip,
not an insert. Set `jira` → `PET-12666`, `status` → `automated`, `enabled` → `1`; leave
`category=workflow`, `testName=groupPieceOutDistribution` and `tags=regression` as they are. Then
`npm run runner:sync && npm run runner:check`.

| id | Title | Tags | Category | enabled |
|---|---|---|---|---|
| `D9` | Distribute one crew piece-out across the two members who worked, and no one else | `regression` | `workflow` | 1 |

```ts
test.describe('D9 · Group piece-out distribution', { tag: ['@JourneyD', '@D9'] }, () => {
    test('[Transfer] Distribute one crew piece-out across the two members who worked, and no one else.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'D9' }],
    }, async ({ page, sessionApi, pages }, testInfo) => { /* ... */ });
});
```

> `runner:check` enforces that a `describe` carries only `@Journey<X>` / `@<WF>` / `@System` and a
> `test` only the tier chain plus `@Demo`. **Do not add `@Workflow`** — the `calc → workflow tagged
> @Workflow` line in the JOURNEY profile predates that rule and would fail the gate. Category
> `workflow` still maps to `tests/web/`.

**Steps:**

1. `loadScenario(JourneyD9DistributionCaseSchema, testInfo)` → `prepareJourneyD9(...)`: ensure the
   ranch/field, then `D9 CREW`, the three pickers and `D9 JOB` **on screen** through
   `ensureOnScreen`; read and assert the piece preferences; run the before-phase recovery sweep
   (job cards first, then the crew-scoped time cards).
2. `seedCrewPieceOutDay(...)` — **on screen**: Crew Time In at `punch` with Phase = `D9 JOB` and
   `selectOnlyEmployees([pickerOne, pickerTwo])`; wait (over the read GET) until exactly **2**
   time-ins are readable; Crew Piece Out at `pieceOut` with `numOfPieces = 4`; Crew Time Out at
   `timeOut`. Record the five time-card ids and References from the scoped GET.
3. **Catalog step 1 — on screen, before anything commits.** Transfer screen → scope to the fixture
   day → **Analyze Transfer Candidates**.
4. **Scope the grid to the crew.** Work Crew filter → `D9 CREW`. Then assert the roster guard:
   the References the screen now offers are **exactly** this run's five, no more and no fewer —
   refuse to transfer otherwise, naming both sets.
5. Assert on the crew piece-out row (located by its Reference): `cellAt(row, 4)` reads **`—`**,
   `cellAt(row, 9)` reads **`4`**, Type reads `Piece Out`. Assert the totals strip's
   **`Pieces` = 4**. Assert `selectAllRowsCheckbox` is **not** checked.
6. **Catalog step 2a — the preview, still before commit.** Open the **Job Cards** tab: exactly
   **2** rows; each participant's row has **Number of Pieces = 2**; `D9 PICKER THREE` appears in no
   row; the totals bar reads `Job Cards 2`, `Employees 2`, `Pieces 4`. Return to the Time Cards tab.
7. **Commit.** Tick each own Reference (never the header checkbox) → `Transfer to Job Cards 4` →
   confirm. Then poll the scoped `GET /job-cards`, **recording every id on every poll before the
   count is asserted**, until 2 cards exist for the crew on that day.
8. **Catalog step 2b — the committed cards on screen.** `/input/job-cards` → From/To = the fixture
   day → Apply → exactly the two written References are listed, each Type `Piece`, each row's
   Employee cell containing one participant's name, and **no row containing `D9 PICKER THREE`**.
9. Open each row's **Edit Job Card** form and assert `#pieces` = **2** and `#pieceRate` = **1**;
   leave the form pristine (Cancel / navigate away, never Save, never Delete).
10. **Conservation + exact values over the read GET.** For the two cards: `pieces === 2`,
    `pieceRate === 1`, `pieceAmount === 2`, `exported` falsy, `locked` falsy; and
    `sum(card.pieces) === capture.numOfPieces`. Record each card's `amount` as an annotation only —
    never asserted (the known D6 defect).
11. Assert the day's five time cards are all `transferred === true` and the crew piece-out among
    them still has `employeeCounter === null`.
12. `await run.cleanup()` — job cards by id first, then the time cards, then the crew-scoped sweep.

**Proof the test is real and not vacuously green:** the trace shows the Crew Time In form with
exactly two of three members ticked; the `—` Employee assertion and the `Pieces 4` total both fire
**before** the commit; the preview tab shows 2 rows of 2 before the commit; `D9 PICKER THREE` appears
in no job-card row; `sum(pieces) === 4`; and after `run.cleanup()` the scoped `GET /job-cards` and
`GET /time-cards` for the fixture day are empty.

## Open questions for the tester

None outstanding — all five raised by the live pass were resolved below before generation.

## Resolution (orchestrator, 2026-10-01)

1. **Job code.** `4602` is held by a soft-deleted `D6 JOB RATE PROBE`; the binned row is **left in
   place** (no destructive action on a record this suite did not create). `D9 JOB` takes **`4603`**,
   free in both `GET /jobs` and `GET /jobs/deleted`. The stray probe is reported, not purged.
2. **Sliding fixture day / roster guard.** Accepted: `guardedTransfer` gains an **optional `crew`
   option, default off**, which applies the Transfer screen's Work Crew filter after the analyze and
   before the roster guard. D9 passes its crew. **D6 is fixed in the same change** — its day -11 is
   2026-09-20 today and it would otherwise hit "refusing to transfer" on its next run — so D6 passes
   its crew too, and both specs are re-run as part of verification.
3. **Pieces read.** Accepted: `/input/job-cards` has no Pieces column, so the per-card pieces are
   read from the Transfer screen's **Job Cards preview tab** (pre-commit) and the **Job Card edit
   form `#pieces`** (post-commit). The `/input/job-cards` grid still proves *who* got a card.
4. **Two piece-total formats.** Informational: the Time Cards totals strip is integer-formatted, the
   Job Cards preview bar six-decimal. Both are parsed with `Number()`; no assertion is made on the
   formatted string.
5. **`scopeToDay`.** Accepted: switched from the six segment inputs to the calendar-cell path that
   `applyDateRange` already uses, and the committed chip is asserted as `MM/DD/YYYY – MM/DD/YYYY` for
   **both** ends. Shared with D6, which is re-run to prove it.
6. **`/input/job-cards` count is crew-scoped, not day-scoped** (first run, 2026-10-01). The spec
   originally asserted the whole day held exactly 2 rows and went red at `Expected: 2, Received: 3`.
   The third row was foreign: reference `JC00000616`, **Type Time**, employee `2345 : A Kishore`
   (767 — the same employee WEBPET-3397 uses), job `1031-BED PREP`, Crew `—`, status "Manually
   edited". D9's own two cards were correct in the same snapshot — `D9 PICKER ONE` / `D9 JOB` /
   `D9 CREW`, Type `Piece`, Amount `2.00` = 2 pieces × rate 1. The assertion, not the product, was
   wrong: a day-wide count asserts other tenants' data on a shared environment. It is now
   `rowsForCrew(D9 CREW)`, plus a per-Reference presence check — the same date-only-scoping trap the
   live pass already caught on the Transfer grid, and the reason that grid gets the Work Crew filter.
