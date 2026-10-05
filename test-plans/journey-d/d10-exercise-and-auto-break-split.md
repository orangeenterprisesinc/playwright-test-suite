# `D10` · Exercise and auto-break split

> **One worker, one day, four paid segments — and every boundary falls out of the setup.**
> A crew time-in at 07:00, a paid-break start at 10:00 with no return punch, and a crew time-out at
> 15:00 are three time cards. The transfer turns them into **four** job cards: a 30-minute exercise
> segment carved off the front of the first job, the work up to the break, a 15-minute break card
> conjured from a break start that has no end, and the work after the automatic return to the prior
> job. D10 reads the proposed split on screen *before anything commits*, commits it, and then proves
> on screen and over a read-only GET that the four segments are contiguous, that they add up to the
> day, and that the money adds up with them.
>
> **Binding safety constraints** (carried from D9, all still true):
> * The transfer is driven on screen and ticked **by Reference**. The header **"Select all rows" is
>   select-all-across-the-filter**, not the visible rows; nothing here ever touches it.
> * The grid is scoped to `D10 CREW` with the **Work Crew** filter before any row is ticked. A bare
>   date scope is not safe: day −13 slides, and dev carries foreign *untransferred* rows on most days
>   in the 21-day window.
> * The per-row **"Delete Time Card …"**, the per-row **"Delete Job Card …"**, the Job Card form's
>   **Delete** and `POST /job-cards/bulk-delete` are **forbidden** — a "delete all loaded" wiped
>   ~9.5 k dev job cards in Sept 2026 and there is no restore route. Cleanup deletes this run's own
>   job cards by explicit id, one at a time, each with its own rowversion.
> * The preview tab's **"Remove all (N)"** and **"Remove from transfer"** are never used — they
>   silently change what the commit would write.
> * **New for D10:** the spec writes one shared tenant preference (`paidBreakJob`). It must be set as
>   late as possible and restored with `0` in the after phase. See §API allowances.

Source: no recording; office surface and the whole split measured live **2026-10-05**
(app.ptdev.xyz, `su`). Sibling plan: `test-plans/journey-d/d09-group-piece-out-distribution.md`.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `D10` |
| Jira | `PET-12667` — [D10] Exercise and auto-break split |
| Recording | — none |
| This plan | `test-plans/journey-d/d10-exercise-and-auto-break-split.md` |
| Spec | `tests/web/journey-d-office/d10-exercise-and-auto-break-split.spec.ts` |
| Scenario | `src/data/journey-d/d10-exercise-and-auto-break-split.json` |
| Runner row | `src/data/runner/journey-d.csv` → `D10` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `D10` |
| Journey | `D` — Daily office processing (the engine) |
| Segments | `all` |
| Modules | `Windows` |
| Surface | `calc` — spec in `tests/web/journey-d-office/`; runner category `workflow` |
| Demo candidate | no |
| Catalog status | ticketed (PET-12667) |

**Summary** (from the catalog)
> The transfer auto-splits the first job card into a short exercise segment plus the remaining work,
> and supplies a break job card when only a break start was recorded, both per the crew record.

## Catalog steps

| # | Catalog step | Office surface (live 2026-10-05) | Automatable? |
|---|---|---|---|
| 1 | The transfer detects the crew's first-job exercise rule and splits the first time-in into an exercise job card plus the work job card. | Rule set on **Setup ▸ Crew ▸ Break & Automation**: `Exercise Job` = `D10 EXERCISE JOB`, `Exercise Job Length` = `30 min`. Then **Input ▸ Transfer to Job Cards** → scope day → **Analyze Transfer Candidates** → Work Crew = `D10 CREW` → **Job Cards tab**, the pre-commit preview. Measured: one 07:00 time-in on `D10 JOB` becomes **`D10 EXERCISE JOB` 07:00–07:30 (30 min, 0.50)** + **`D10 JOB` 07:30–…**. The split is carved from the **first** time-in only — the post-break return card gets no exercise segment. | **yes, on screen**, and the proof lands *before* the commit, which is what makes it a statement about the transfer rather than a restatement of the seed |
| 2 | Where only a break start exists, it creates a break job card of the configured length (typically 10 minutes) and returns the worker to the prior job. | The break start is a **Crew Time In onto the designated paid-break job with no return punch** (10:00 on `D10 BREAK JOB`) — *not* a half-filled Break Card: both `/input/breaks/new` and `/input/crew-break/new` validate `startDateTime` **and** `endDateTime` as required. The designation is the tenant preference **`paidBreakJob`**; the length and the return come from the crew (`Break Lengths` = `15`, `Create Break Card from Time In` = `Everyone`, `Auto Return from Break` = `From Paid Break`, `Auto Paid Break Type` = `All`). Measured: **`D10 BREAK JOB` 10:00–10:15 (15 min, 0.25)** then **`D10 JOB` 10:15–15:00 (285 min, 4.75)** — the automatic return. | **yes**, with one configuration write (see §API allowances). Measured by contrast: with `paidBreakJob` null the same day yields only 3 cards and no break at all |
| 3 | The resulting decimal-hour rounding is reconciled at close (see E6). | Payroll close; `timeDecimalRounding = 4` on dev. | **no — deferred: catalog E6 owns the decimal-hour reconciliation at close.** D10's own numbers are chosen so rounding cannot bite: 30 min = 0.50 h and 15 min = 0.25 h are exact in two decimals. Giving the rounding rule to two workflows would duplicate the coverage and the maintenance, exactly as D9 left reverse-and-redo to D5 |

## Expected outcomes

- When `D10 CREW` carries the first-job exercise rule (`Exercise Job` = `D10 EXERCISE JOB`,
  `Exercise Job Length` = `30`) and the break rule (`Create Break Card from Time In` = `Everyone`,
  `Break Lengths` = `15`, `Auto Paid Break Type` = `All`, `Auto Return from Break` = `From Paid
  Break`), and the day carries exactly three time cards — a crew time-in at **07:00** on `D10 JOB`,
  a crew time-in at **10:00** on `D10 BREAK JOB` with no return punch, and a crew time-out at
  **15:00** — then the Transfer screen scoped to that day and that crew shall offer exactly **3**
  candidate rows.
- When the **Job Cards tab** is opened on that analysis, PET Tiger shall preview exactly **4** job
  cards, in chronological order, with Job cells reading
  `D10 EXERCISE JOB`, `D10 JOB`, `D10 BREAK JOB`, `D10 JOB`, and Amount cells reading
  `0.50`, `2.50`, `0.25`, `4.75`. The preview totals bar shall read **`Job Cards 4`**,
  **`Employees 1`**, **`Pieces 0`**. **None of this has committed anything.**
- The non-committing `job-cards-preview` read shall place the four segments at
  **07:00–07:30 (30 min)**, **07:30–10:00 (150)**, **10:00–10:15 (15)**, **10:15–15:00 (285)** —
  contiguous, no gap and no overlap, first boundary = the time-in, last = the time-out.
- **Conservation.** `30 + 150 + 15 + 285 = 480` = the day's gross
  (`15:00 − 07:00`), and `0.50 + 2.50 + 0.25 + 4.75 = 8.00` = `480 / 60 × hourlyRate(1)`.
  The split redistributes the day; it neither creates nor loses a minute or a cent.
- The exercise segment's length shall equal the crew's `Exercise Job Length` exactly, and the break
  segment's length the crew's first `Break Lengths` entry exactly — these are the two numbers the
  workflow exists to apply.
- The exercise segment shall appear **once**, against the **first** job of the day. The card that
  follows the automatic return shall carry no exercise segment.
- When the three ticked rows are transferred, PET Tiger shall write exactly **4** job cards for the
  crew on that day; `GET /job-cards?from=day&to=day` scoped to the crew shall return four records
  whose `jobCounter` multiset is `{D10 EXERCISE JOB ×1, D10 JOB ×2, D10 BREAK JOB ×1}`, each with
  `exported` falsy and `locked` falsy.
- When `/input/job-cards` is loaded for the fixture day, the rows **whose Crew is `D10 CREW`** shall
  number exactly **4**, their Job cells shall be the four above, and their Amount cells shall sum to
  **8.00**. The count is **crew-scoped, not day-scoped**: the grid filters by date only and the day
  carries other tenants' cards (D9 learned this the hard way).
- The day's three time cards shall all read `transferred === true` after the commit — the transfer
  splits the day into segments, it does not rewrite the capture.
- `paidBreakJob` shall be back to `null` when the test ends, whether it passed or failed.
- The `No` and `Time Only` variants of `Create Break Card from Time In`, and the `Never` / `From
  Meal` / `From Paid Break and Meal` variants of `Auto Return from Break`.
  _— **deferred: one happy path per workflow.** The contrast was measured during planning
  (with `paidBreakJob` unset the same day yields 3 cards and no break card), and it is recorded here
  as evidence rather than as a second test._
- A break start that **does** have a matching return punch, and a meal rather than a paid break.
  _— **deferred: a separate ticket.** D10's sentence is "where **only** a break start exists"._
- Decimal-hour rounding at close.
  _— **deferred: catalog E6 owns it** (catalog step 3). D10's values are exact in two decimals so the
  two workflows cannot be confused for one another._
- The Transfer grid's per-row "Delete Time Card", the preview tab's "Remove from transfer" /
  "Remove all", the Job Card form's "Delete", and `job-cards/bulk-delete`.
  _— **not automatable here: forbidden by the safety constraints above.** The page objects expose
  none of them._
- On-blur validation, Save-stays-disabled and the "Unsaved changes" bar on the Setup and Batch forms.
  _`(POM)` — relied on throughout `SetupScreenPage` / `CrewPunchPage` / `ensureOnScreen`; exercised by
  every fixture row and every punch, not asserted separately._

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Setup ▸ Crew / Employee / Job / Ranch / Field | `/setup/…/new`, `/{id}` | `src/pages/setup/CrewPage.ts`, `EmployeePage.ts`, `JobPage.ts`, `RanchPage.ts`, `FieldPage.ts` | **exists** — driven through `src/utils/fixtureRows/ensureOnScreen.ts` |
| Setup ▸ Crew ▸ **Break & Automation** | `/setup/crews/{id}` | `src/pages/setup/CrewPage.ts` | **extended** — the eight rule fields below; nothing in the repo has ever touched this section |
| Input ▸ Batch ▸ Crew Time In / Crew Time Out | `/input/crew-time-in\|crew-time-out/new` | `CrewTimeInPage.ts`, `CrewTimeOutPage.ts` | **exists, unchanged** — `punchIn` already takes `job` (labelled **Phase**) and `employees` |
| Transfer to Job Cards — Time Cards tab | `/transfer-to-job-cards` | `src/pages/processing/TransferToJobCardsPage.ts` | **exists** — `scopeToDay`, `analyzeCandidates`, `filterByCrew`, `candidateReferences`, `selectCandidate`, `runTransfer` all reused as-is |
| Transfer to Job Cards — **Job Cards tab** | same screen, `ttjc-tab-jobcards` | same page object | **extended** — `previewSegments()` (new); `previewTotals()` reused |
| View ▸ Job Card (list) | `View ▸ Job Card` / `/input/job-cards` | `src/pages/processing/JobCardsPage.ts` | **extended** — `rowJob`, `rowAmount`, `amountsForCrew` |
| Job Card edit form | `/input/job-cards/{id}` | — | **not used.** D9 needed it only because the grid has no Pieces column; every number D10 asserts is in the Job and Amount columns |

### Setup ▸ Crew ▸ Break & Automation (measured live 2026-10-05, crew 2178)

| Field | Locator | Control | Values |
|---|---|---|---|
| Include in Transfer *(Time Card Defaults section)* | `getByRole('checkbox', { name: 'Include in Transfer' })` | checkbox | `true` |
| Time Employees Included | `getByRole('switch', { name: 'Time Employees Included' })` | switch | `true` |
| Exercise Job | `input#exerciseJobCounter` | autocomplete (`PickerComponent.pickCombobox`) | `D10 EXERCISE JOB`; gains a `button "Clear"` once set |
| Exercise Job Length | `input#exerciseJobLengthMinutes` | spinbutton, suffix `min` | `30` |
| Create Break Card from Time In | `button#createBreakCardFromTimeIn` | select (`PickerComponent.pickSelect`) | **No** `0` / **Time Only** `1` / **Everyone** `2` → `Everyone`; has `Clear selection` |
| Auto Paid Break Type | `button#autoPaidBreakType` | select | **None** `0` / **All** `1` / **Time Employees Only** `2` / **Piece Employees Only** `3` → `All`; **no** Clear |
| Auto Return from Break | `button#autoReturnFromBreak` | select | **Never** `0` / **From Paid Break** `1` / **From Meal** `2` / **From Paid Break and Meal** `3` → `From Paid Break`; has `Clear selection` |
| Break Lengths (min, comma-separated) | `input#breakLengthMinutesCommaSeparated` | textbox | `15` |

Each select is paired with a sibling hidden `textbox` holding the stored number. Read back the
**combobox's visible label**, never that textbox — the Exercise Job's sibling holds the whole job
record as JSON.

> **`setBreakAutomation` must be a no-op when nothing changes.** On the second and every later run
> the crew already holds these values, re-picking them leaves the form clean, **Save never enables**,
> and `saveEdit()` fails with the misleading *"Save stayed disabled on Crew {id} — the form is
> rejecting a value"*. That is exactly how the planning probe died. Read first, return early when all
> eight already match, and call `saveEdit()` only on a real change — the pattern `setNotifyUser`
> already uses in this class.

### Transfer screen — Job Cards tab (pre-commit preview)

Rows are labelled only `Row 1`, `Row 2`, … and come back in chronological order. **Resolve the column
indices from the header row by accessible name** (`Job`, `Employee`, `Date Time In`, `Date Time Out`,
`Gross Time`, `Net Time`, `Amount`) rather than hard-coding D9's measured map
(`0 remove · 1 Employee · 2 Job · 3 Crew · 4 Date Time In · 5 Date Time Out · 6 Gross Time · 7 Meal ·
8 Net Time · 9 Regular · 10 OT · 11 DT · 12 Pieces · 13 Amount`) — D10 reads seven columns and a
silent shift would turn into a wrong green. Totals bar: `getByTestId('jobcards-totals-bar')`,
parsed by `previewTotals()`.

### `/input/job-cards` column map (D9, still current)

`0 select · 1 Delete (forbidden) · 2 Reference · 3 Date · 4 Type · 5 Employee · 6 **Job** ·
7 Crew · 8 Ranch · 9 **Amount** · 10 Exp · 11 CA Exp · 12 Status · 13 Edit link`

### Employee cell text — a trap (unchanged from D9)

The Employee cell renders from `exportIdentifier`, which is `null` for `D10 PICKER ONE`
(`" : D10 PICKER ONE"` in the preview payload). **Never assert an Employee cell by exact text** —
use `toContainText(<name>)`.

## Data

- **Journey D fixture, D10 block** — fixed names, never deleted, never minted per run; built through
  `ensureOnScreen` (existence is a GET, the create and any repair are UI). All five rows already
  exist on dev and were verified today.

  | Record | Name | Code | Dev id | Notes |
  |---|---|---|---|---|
  | Crew | `D10 CREW` | `8014` | 2178 | carries the exercise + break rule |
  | Employee | `D10 PICKER ONE` | `8015` | 1902 | active, home crew `D10 CREW`, the only member |
  | Job | `D10 JOB` | `4604` | 2274 | `paymentType: 'Time'`, **`hourlyRate: 1`** |
  | Job | `D10 EXERCISE JOB` | `4605` | 2275 | `paymentType: 'Time'`, **`hourlyRate: 1`** |
  | Job | `D10 BREAK JOB` | `4606` | 2276 | `paymentType: 'Time'`, **`hourlyRate: 1`**; designated `paidBreakJob` for the duration of the transfer |

  Ranch `B1 RANCH` (162) and field `B1 FIELD` (99) are reused read-only. `4602` is burnt by a
  soft-deleted `D6 JOB RATE PROBE` (WEBPET-2368) and must not be used; `4604`–`4606` are clear.

  **`hourlyRate` is mandatory on all three jobs.** The Transfer screen blocks records whose *job* has
  no hourly rate with an Issues group "No hourly rate available", the commit still claims success,
  and the spec then sees zero job cards. It also makes the Amount column a direct decimal-hour
  readout, which is what D10's on-screen assertions rest on.

- **Protect the names.** `PROTECTED_NAME_PATTERNS` in `src/data/static/shared/cleanupTargets.ts`
  already carries `/^D\d{1,2} /`, which shields every `D10 …` row from the residue sweep and
  `fixtureReconcile`. **Do NOT add a `jobCard` entry to `cleanupTargets.ts`** — that table drives a
  name-prefix sweep across the whole tenant, job cards have no name and no restore route.

- **Fixture day: `dayOffset: -13`** (B owns 0…−9, C −10, D6 −11, D9 −12), well inside
  `maximumDaysForTransferExport = 21`. Fixed punch times, never `now`: **07:00 / 10:00 / 15:00**.

- **Scenario JSON** `src/data/journey-d/d10-exercise-and-auto-break-split.json`, loaded with
  `loadScenario(schema, testInfo)` and validated by a new **`JourneyD10SegmentCaseSchema`** in
  `src/data/schemas/journeyDScenario.ts` (D6's is pinned to `D6`/−11 and D9's to `D9`/−12).
  `.strict()`, with `superRefine` encoding the plan's arithmetic so the data cannot drift out of
  agreement with itself:

  - `workflow === 'D10'` · `dayOffset === -13`
  - `capture.timeIn < capture.breakStart < capture.timeOut`
  - `expected.timeCards === 3` · `expected.jobCards === expected.segments.length === 4`
  - `segments[0].kind === 'exercise'` and `segments[0].minutes === crewRule.exerciseJobLengthMinutes`
  - exactly one `kind === 'break'`, and its `minutes === crewRule.breakLengthMinutes`
  - **contiguity**: `segments[0].start === capture.timeIn`, `segments[i].end === segments[i+1].start`,
    `last.end === capture.timeOut`
  - **conservation**: `Σ segments.minutes === expected.totalMinutes === minutes(timeOut) − minutes(timeIn)`
  - **money**: `segment.amount === round(minutes/60 × expected.hourlyRate, 4)` for every segment, and
    `Σ segments.amount === expected.totalAmount`
  - a `timeCards` cleanup step with `cardTypes: [0, 1]` is required
  - a declared preference-restore entry naming `paidBreakJob` is required

  Shape:

  ```jsonc
  {
    "workflow": "D10",
    "label": "d10-exercise-and-auto-break-split",
    "dayOffset": -13,
    "crewRule": {
      "exerciseJobLengthMinutes": 30,
      "breakLengthMinutes": 15,
      "createBreakCardFromTimeIn": "Everyone",
      "autoPaidBreakType": "All",
      "autoReturnFromBreak": "From Paid Break"
    },
    "capture": {
      "timeIn":     { "hour": 7,  "minute": 0 },
      "breakStart": { "hour": 10, "minute": 0 },
      "timeOut":    { "hour": 15, "minute": 0 }
    },
    "expected": {
      "timeCards": 3,
      "jobCards": 4,
      "hourlyRate": 1,
      "totalMinutes": 480,
      "totalAmount": 8,
      "employees": 1,
      "pieces": 0,
      "segments": [
        { "kind": "exercise", "job": "exerciseJob", "start": { "hour": 7,  "minute": 0 },  "end": { "hour": 7,  "minute": 30 }, "minutes": 30,  "amount": 0.5 },
        { "kind": "work",     "job": "workJob",     "start": { "hour": 7,  "minute": 30 }, "end": { "hour": 10, "minute": 0 },  "minutes": 150, "amount": 2.5 },
        { "kind": "break",    "job": "breakJob",    "start": { "hour": 10, "minute": 0 },  "end": { "hour": 10, "minute": 15 }, "minutes": 15,  "amount": 0.25 },
        { "kind": "work",     "job": "workJob",     "start": { "hour": 10, "minute": 15 }, "end": { "hour": 15, "minute": 0 },  "minutes": 285, "amount": 4.75 }
      ]
    }
  }
  ```

  The spec imports only `@utils/journeys/journeyDFlow`; the only inline literals in it are
  `testCaseId`, `tag:`, the title and `expect()` messages.

- **Fixture file.** Add a `d10` block to `src/data/journey-d/fixture.json` (`crew`, `picker`,
  `workJob`, `exerciseJob`, `breakJob` — codes above, each job with `paymentType: "Time"` and
  `hourlyRate: 1`), a `JourneyD10Fixture` type + optional block in
  `src/data/schemas/journeyDFixture.ts`, and a `journeyD10Fixture()` accessor in
  `src/data/journey-d/fixture.ts` — mirroring the existing `journeyD9Fixture()` so D6 and D9 cannot
  be affected.

- **Uniqueness rules the app enforces:** crew / employee / job `code` is unique database-wide **and
  across the recycle bin**. Nothing in D10 needs a generated name: the fixture rows are fixed and the
  time/job cards have no name at all.

## Preconditions

- [ ] `PROTECTED_NAME_PATTERNS` contains `/^D\d{1,2} /`. Already true.
- [ ] Session API authenticated (`sessionApi`); CSRF double-submit as in `apiLogin.ts`.
- [ ] Ranch `B1 RANCH` / field `B1 FIELD` present; then **on screen** via `ensureOnScreen`, in this
      order (the New Employee form's Crew combobox arrives pre-filled with another crew and must be
      overwritten): `D10 CREW` → `D10 PICKER ONE` → `D10 JOB`, `D10 EXERCISE JOB`, `D10 BREAK JOB`.
      Idempotent; never deletes.
- [ ] **The crew rule applied on screen** through `CrewPage.setBreakAutomation(...)`, then read back
      over `GET /crews/{id}` and asserted field-by-field. This is catalog step 1's own setup —
      a `PUT /crews/{id}` would hide the step from the run and from any recording of it, and would be
      a live `UiFirstViolation`.
- [ ] Preference gate **read, not written**: `maximumDaysForTransferExport >= 13`. If the window has
      moved below the fixture day the test must **fail loudly, not skip**.
- [ ] **Before-phase recovery sweep on the fixture day**, run before anything is seeded:
      1. `GET /job-cards?from=day&to=day`, filter to `crewCounter === D10 CREW`, `DELETE` each —
         this resets the source time cards to `transferred:false`, the only thing that makes them
         deletable;
      2. then sweep the day's time cards **by crew**.
- [ ] The Work Crew filter is applied before any row is ticked (§Test case step 5).

Implement all of this in the spec's own arrange phase — the fixture rows and the crew rule **on
screen**, the punches **on screen** through the Batch page objects — never by chaining onto another
spec and never by POSTing a record into existence.

## API allowances

Every call this spec makes outside the browser. **A step a user performs on screen has no row here**
— the Crew form, the two Crew Time In forms, the Crew Time Out form, the date scope, the analyze, the
Work Crew filter, the Job Cards preview tab, the ticking of rows, the commit and the
`/input/job-cards` load are all UI and appear nowhere below.

| Step / call | Endpoint | Allowance | Why |
|---|---|---|---|
| gate read | `GET preferences` | read | `maximumDaysForTransferExport` gates the fixture day; `paidBreakJob` / `lockTCsAfterTransferToJCs` / `singleJobCardOnBreakReturn` are captured as evidence. Never asserted into a skip |
| fixture-row existence | `GET crews` · `employees` · `jobs` · `ranches` · `fields` (+ `GET <entity>/{id}`) | read | `ensureOnScreen`: existence is a GET, create/repair is UI |
| binned fixture restore | `POST <entity>/{id}/restore` | cleanup | undoes a deletion rather than creating; already wrapped inside `ensureOnScreen` |
| crew rule read-back | `GET crews/{id}` | read | proves the eight fields the screen just saved actually persisted, before the day is seeded |
| **designate the paid-break job** | `PUT preferences {paidBreakJob: <D10 BREAK JOB id>}` | **configuration** | the crew record has no paid-break job field — the designation exists only as a tenant preference (the deployed bundle builds its break-job set from `paidBreakJob` / `zeroTimeBreakJob` / `paidBreakOffClockJob`, all `null` on dev). Wrapped in `allowApiWrites('preference', …)`. Written **after** the day is seeded and **immediately before** the transfer, so the shared-state window is as short as the transfer itself |
| **restore it** | `PUT preferences {paidBreakJob: 0}` | **configuration** | `0` clears an FK preference back to `null`; `null` is ignored by the partial-PUT guard (measured 2026-10-05 — do **not** rely on `restorePreferences`, whose snapshot of `null` is a silent no-op). Imperative, and the **first** step of the after phase so a later failure cannot strand it |
| before-phase sweep — job cards | `GET job-cards?from&to` → `DELETE job-cards/{id}` | cleanup | a crashed previous run's cards must go before the day can be re-seeded |
| before-phase sweep — time cards | `GET time-cards?from&to` → `DELETE time-cards/{id}` | cleanup | crew-scoped |
| punch sync point | `GET time-cards?from&to` | read | the Crew Time Out form only offers employees with an **open** time-in, so the flow waits until the saved time-ins are readable |
| record this run's time-card ids + References | `GET time-cards?from&to` | read | the roster guard and cleanup both key on them, recorded **before** any assertion runs |
| **segment boundary read** | `POST transfer-to-job-cards/job-cards-preview {from,to,crewIds}` | read | explicitly named non-committing in the UI-first rule. Supplies `dateTimeIn`/`dateTimeOut`/`grossMinutes`/`netMinutes` per segment — minute-exact boundaries, without depending on how the grid formats a date cell |
| analyze corroboration | `POST transfer-to-job-cards/analyze {from,to,crewIds}` | read | non-committing; `plannableTotal === 3`, no blocking exception |
| read back the written cards | `GET job-cards?from&to` · `GET job-cards/{id}` | read | records the ids on **every** poll, before the count is asserted |
| after-phase teardown — job cards | `DELETE job-cards/{id}` (with `rowversion`) | cleanup | by explicit id, one at a time |
| after-phase teardown — time cards | `DELETE time-cards/{id}` | cleanup | by id, from the ids recorded above |

No DB. No UI delete. No `bulk-delete`. No reverse. No write to any setup record other than D10's own
crew, which is a workflow step performed on screen.

## Cleanup

**The order is not hygiene — it is the only escape hatch.** `lockTCsAfterTransferToJCs = true`, so
`DELETE /time-cards/{id}` on a transferred row returns **409 `record.transferred_delete`**. Deleting
the **job card** by id returns `200 {sourcesReset, linkageMissing:false}`, after which every source
time card is `transferred:false` and deletes with `204`.

| Phase | Step | How |
|---|---|---|
| after, 1 | **[imperative]** restore the preference | `PUT preferences {paidBreakJob: 0}`, then `GET preferences` to confirm it reads `null`. **First**, because it is the only tenant-wide state this spec touches |
| after, 2 | **[imperative]** delete D10's own job cards | for each id recorded from the scoped `GET /job-cards`: `GET /job-cards/{id}` → `DELETE /job-cards/{id} {rowversion: version}`. Best-effort, logged, never fails the test |
| after, 3 | **[declarative]** `{ kind:'timeCards', employeeCodes:['8015'], dayOffset:-13, cardTypes:[0,1] }` | the flow hands `runCleanup` the exact three card ids it created |
| after, 4 | **[imperative]** crew-scoped day sweep | `GET /time-cards?from=day&to=day` filtered to `crewCounter === D10 CREW`, `DELETE` each survivor — the belt to step 3's braces |
| after, 5 | **[nothing]** setup rows | `D10 CREW`, `D10 PICKER ONE` and the three jobs are permanent fixture, never deleted, protected by `/^D\d{1,2} /`. The crew rule is left applied — it is D10's own crew and the next run re-asserts it |
| after, 6 | **[nothing]** the transfer run | `GET /transfer-to-job-cards/runs` keeps an audit row. Read as evidence at most, **never reversed** |

No entity in this spec has a name, so nothing is swept by prefix. Every delete is by id, from an id
recorded **before** the assertions ran, so teardown still knows the cards when an assertion fails.

**Budget.** Up to six Setup forms on a cold fixture, a Crew form with eight fields, three Batch
forms, two Transfer tabs and a grid, all with per-action screenshots — and here a `skipped-budget`
outcome means *permanent residue plus a tenant preference left set*. The spec calls `test.slow()`
**and** `test.setTimeout(360_000)`.

## Test case

**One workflow, one happy-path test, one runner row, and the id is the workflow id.**

The `D10` row already exists in `src/data/runner/journey-d.csv` as a reservation, so this is a flip,
not an insert. Set `status` → `automated` and `enabled` → `1`; leave `category=workflow`,
`testName=exerciseAndAutoBreakSplit`, `jira=PET-12667` and `tags=regression` as they are. Then
`npm run runner:sync && npm run runner:check`.

| id | Title | Tags | Category | enabled |
|---|---|---|---|---|
| `D10` | Split one worker's day into exercise, work, break and the return to work | `regression` | `workflow` | 1 |

```ts
test.describe('D10 · Exercise and auto-break split', { tag: ['@JourneyD', '@D10'] }, () => {
    test('[Transfer] Split one worker\'s day into exercise, work, break and the return to work.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'D10' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

> `runner:check` enforces that a `describe` carries only `@Journey<X>` / `@<WF>` / `@System` and a
> `test` only the tier chain plus `@Demo`. **Do not add `@Workflow`** — the `calc → workflow tagged
> @Workflow` line in the JOURNEY profile predates that rule and would fail the gate.

**Steps:**

1. `loadScenario(JourneyD10SegmentCaseSchema, testInfo)` → `prepareJourneyD10(...)`: ensure the
   ranch/field, then `D10 CREW`, `D10 PICKER ONE` and the three jobs **on screen**; apply the crew
   rule **on screen** and read it back; assert the day-window preference gate; run the before-phase
   recovery sweep (job cards first, then crew-scoped time cards).
2. `seedExerciseAndBreakDay(...)` — **on screen**: Crew Time In at `capture.timeIn` with Phase =
   `D10 JOB` and `selectOnlyEmployees([picker])`; wait over the read GET until the time-in is
   readable; Crew Time In at `capture.breakStart` with Phase = `D10 BREAK JOB` — **the break start,
   with no return punch**; Crew Time Out at `capture.timeOut`. Record the three time-card ids and
   References from the scoped GET.
3. **Designate the paid-break job**: `allowApiWrites('preference', …, () => putPreferences({ paidBreakJob: breakJob.id }))`,
   and register the `0` restore with the cleanup scope in the same breath, so the restore is owned
   before anything can fail.
4. **Catalog step 1 begins — on screen, before anything commits.** Transfer screen → scope to the
   fixture day → **Analyze Transfer Candidates**.
5. **Scope the grid to the crew.** Work Crew filter → `D10 CREW`. Then the roster guard: the
   References on screen must be **exactly** this run's three — refuse to transfer otherwise, naming
   both sets (`openScopedCandidates` already does this; pass `crew`).
   Assert `selectAllRowsCheckbox` is **not** checked.
6. **Catalog steps 1 + 2 — the preview, still before commit.** Open the **Job Cards** tab:
   - exactly `expected.jobCards` (4) rows;
   - the ordered Job cells equal `[D10 EXERCISE JOB, D10 JOB, D10 BREAK JOB, D10 JOB]`;
   - the ordered Amount cells equal `[0.50, 2.50, 0.25, 4.75]` — with `hourlyRate 1` these *are* the
     segment lengths in decimal hours, which is why this assertion does not depend on how the grid
     formats a time cell;
   - `previewTotals()` equals `{ pieces: 0, jobCards: 4, employees: 1 }`.
   Then corroborate the exact boundaries over the non-committing `job-cards-preview` read: each
   segment's `dateTimeIn`/`dateTimeOut` equal the scenario's `start`/`end` on the fixture day,
   `grossMinutes === netMinutes === segment.minutes`, the segments are contiguous from
   `capture.timeIn` to `capture.timeOut`, and `Σ minutes === expected.totalMinutes`.
   Return to the Time Cards tab.
7. **Commit.** Tick each own Reference (never the header checkbox) → `Transfer to Job Cards 3` →
   confirm. Then poll the scoped `GET /job-cards`, **recording every id on every poll before the
   count is asserted**, until 4 cards exist for the crew on that day (`commitTransfer`).
8. **The committed cards on screen.** `/input/job-cards` → From/To = the fixture day → Apply →
   `rowsForCrew('D10 CREW')` has exactly **4** rows; the Job cells are the four above; the Amount
   cells sum to **8.00**.
9. **Read-back over the GET.** Four cards; the `jobCounter` multiset is
   `{exercise ×1, work ×2, break ×1}`; every card has `exported` falsy and `locked` falsy. Record
   each card's `netTime` / `grossTime` / `amount` as a **test annotation**, not an assertion — the
   unit of those API fields is unverified and the on-screen Amount column already carries the proof.
10. **The capture is not rewritten.** The day's three time cards all read `transferred === true`.
11. `await run.cleanup()` — preference first, then job cards by id, then the time cards, then the
    crew-scoped sweep.

**Proof the test is real and not vacuously green:** the trace shows the Crew form carrying the
exercise and break rule; the day is seeded with **three** cards and the screen proposes **four**; the
`D10 EXERCISE JOB` row, the `D10 BREAK JOB` row and the ordered Amounts all fire **before** the
commit; `30 + 150 + 15 + 285 = 480` and `0.50 + 2.50 + 0.25 + 4.75 = 8.00` are asserted, not
narrated; and after `run.cleanup()` the scoped `GET /job-cards` and `GET /time-cards` for the fixture
day are empty and `GET preferences` reads `paidBreakJob: null`.

## Open questions for the tester

None outstanding. Everything the split depends on was observed live on 2026-10-05 rather than
assumed, including the two items the handoff flagged as unconfirmed guesses — the three enum option
lists (the earlier probe had concatenated all three listboxes into one 13-item array) and the
break-start hypothesis, which was right in shape but silently inert without `paidBreakJob`.

## Evidence (live pass, 2026-10-05, app.ptdev.xyz, `su`)

1. **Exercise only** — time-in 07:00 on `D10 JOB` + time-out 15:00, crew rule applied,
   `paidBreakJob` null: preview = 2 cards — `D10 EXERCISE JOB` 07:00–07:30 (30 min, 0.50) and
   `D10 JOB` 07:30–15:00 (450 min, 7.50). Totals `jobCardCount 2`, `netMinutes 480`, `amount 8`.
2. **Break start, not yet designated** — plus a time-in 10:00 on `D10 BREAK JOB`, `paidBreakJob`
   still null: preview = **3** cards; the 10:00 punch is an ordinary job change
   (`D10 BREAK JOB` 10:00–15:00, 300 min, 5.00). **No break card, no auto-return.**
3. **Designated** — `PUT preferences {paidBreakJob: 2276}`, same three time cards: preview = **4**
   cards, the split in §Expected outcomes. `jobCardCount 4`, `employeeCount 1`, `grossMinutes 480`,
   `netMinutes 480`, `amount 8`. `sourceRecordIds` show all three time cards consumed.
   `singleJobCardOnBreakReturn = true` did **not** merge the two `D10 JOB` cards.
4. **Restored** — `PUT preferences {paidBreakJob: 0}` → `GET` reads `null`. The three probe time
   cards were deleted (204 each) and the fixture day is empty. Nothing was committed at any point.
