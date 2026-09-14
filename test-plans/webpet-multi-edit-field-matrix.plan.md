# Multi-Edit field matrix — Transfer to Job Cards + Input Multi Update bar

## Application Overview

## Premise correction (read first)

The 4 → 19 field expansion is **not** on the Input grids. Two different multi-edit surfaces ship today, both verified live on dev (bundle `assets/index-CXmaSBvG.js`, 2026-09-14):

| Surface | Where | Fields | Our coverage |
|---|---|---|---|
| **Multi Update bar** (Field / Value / "Update Records (N)") | `/input/time-in` and siblings | **6**: Work Crew, Ranch, Field, Phase, Work Order, Run | WP-0378 drives Ranch only |
| **Multi-Edit dialog** (More actions → Multi-Edit) | `/transfer-to-job-cards`, Time Cards tab | **19 declared, 18 rendered on dev** | none |

The bundle still carries the old 4-field list (`["jobCounter","crewCounter","ranchCounter","fieldCounter"]`) next to the new 19-field list — that is the 4 → 19 expansion, and it belongs to the Transfer screen, whose "crew piece-out header" and "Transferred" concepts match the task description. `multiUpdateValueTrigger` on the Input bar is irrelevant to it: the Transfer dialog uses its own controls with `data-testid`s.

## Finding 1 — exact Field option labels (Transfer Multi-Edit, native `<select data-testid="multi-edit-field-select">`, in render order)

| # | Label | option value | # | Label | option value |
|---|---|---|---|---|---|
| 1 | Job | `jobCounter` | 10 | Date, Time | `dateTime` |
| 2 | Crew | `crewCounter` | 11 | Date | `dateOnly` |
| 3 | Ranch | `ranchCounter` | 12 | Time | `timeOnly` |
| 4 | Field | `fieldCounter` | 13 | Traceability | `traceabilityCode` |
| 5 | Work Order | `workOrderCounter` | 14 | Memo | `memo` |
| 6 | Variety | `varietyCounter` | 15 | Type | `cardType` |
| 7 | Run | `runCounter` | 16 | Transferred | `transferred` |
| 8 | Row | `agRowCounter` | 17 | Number of Pieces | `numOfPieces` |
| 9 | Employee | `employeeCounter` | 18 | Meal Length | `breakTime` |

Labels are **not** the names in the request: it is "Crew" (not Work Crew), "Date, Time"/"Date"/"Time" (three separate options, not one), "Number of Pieces" (not Pieces), "Meal Length" = `breakTime`, "Row"/"Variety" exist and were not in the request, and there is no "numeric operator composite" — the numeric operator UI is the column *filter*, not the editor.

Input-bar labels (`/input/time-in`, base-ui Select): Work Crew `crewCounter` · Ranch `ranchCounter` · Field `fieldCounter` · **Phase** `jobCounter` · Work Order `workOrderCounter` · Run `runCounter`.

## Finding 2 — Value control per field (Transfer dialog). `multi-edit-value*` test ids exist for every one

| Field(s) | Kind | Control | Locator | Continue enabled when blank? |
|---|---|---|---|---|
| Job, Crew, Ranch, Field, Work Order, Variety, Run, Row | `fk` | base-ui **Combobox** (`input[role=combobox]`), popup = `combobox-popup`/`combobox-item` | `multi-edit-value-{job,crew,ranch,field,workorder,variety,run,row}-combobox` | **yes → clearing allowed** |
| Employee | `fk` | same | `multi-edit-value-employee-combobox` | **no → cannot be cleared** |
| Date, Time | `dateTime` | native `<select>` Exact Value / Interval **+** `input[type=datetime-local]` (exact) or two `datetime-local` (interval) | `multi-edit-value-mode-select`, `-datetime`, `-interval-from`, `-interval-to` | no |
| Date | `dateOnly` | `input[type=date]` | `multi-edit-value-date` | no |
| Time | `timeOnly` | `input[type=time]` | `multi-edit-value-time` | no |
| Traceability | `text` | `input`, maxlength 100 | `multi-edit-value-text` | yes |
| Memo | `text` | **`textarea`**, maxlength 4000 | `multi-edit-value-text` | yes |
| Type | `enum` | native `<select>`: Time Out(0) / Time In(1) / Signature(2) / Non Labor(3) | `multi-edit-value-choice-select` | no |
| Transferred | `bool` | native `<select>`: Yes(true) / No(false) | `multi-edit-value-choice-select` | no |
| Number of Pieces, Meal Length | `number` | `input[type=number] min=0 step=any` | `multi-edit-value-number` | yes (blank → null) |

Flow ids: `multi-edit-dialog` → `multi-edit-submit` ("Continue", fires a **dryRun** POST) → review stage `multi-edit-review` (`multi-edit-review-change`, `multi-edit-review-row-<counter>`, `multi-edit-review-current` / `-new`, `multi-edit-review-include-all`, `multi-edit-review-not-in-scope`, `v2-bulkfix-preview`) → `multi-edit-review-apply`. Cancel = `multi-edit-cancel`. API: `POST /api/time-cards/bulk-fix` with `{...scope, recordIds, field, <value payload>, dryRun}`. **There is no `bulk-fix-undo` endpoint** — the selection bar's Undo covers inline edit / bulk delete, not this.

Input-bar controls (unchanged): all 6 fields are base-ui Selects, so the existing `multiUpdateValueTrigger` still works for the whole Input matrix — no new control types needed there.

## Finding 3 — row cell index maps

Transfer → Time Cards grid (all 17 columns visible by default; the "Columns" chooser offers **exactly** these and nothing more):
`0 select · 1 add-record · 2 delete · 3 Crew · 4 Employee · 5 date · 6 time · 7 Field · 8 Job · 9 Pieces · 10 Traceability · 11 Ranch · 12 Reference · 13 Type · 14 Pay by Piece · 15 Transferred · 16 Export Identifier · 17 Run · 18 Employee Selection · 19 Status`

Time In grid (extends the existing `RANCH_CELL_INDEX = 5`):
`0 select · 1 delete · 2 Reference · 3 Date/Time · 4 Employee · 5 Ranch · 6 Field · 7 Job/Phase · 8 Crew · 9 Status · 10 edit-link`

Consequence: **Memo, GPS Reading, Work Order, Variety, Row and Meal Length have no column on either grid.** Their persistence cannot be asserted from a cell — assert them in the review table (`multi-edit-review-new`) and then via `GET /api/time-cards/time-in|time-out`.

## Finding 4 — GPS Reading

Absent from the Field select on dev. It is gated by `useModule('GPS')` (alongside Work Order ← `WorkOrder`, Run + Traceability ← `LabelTraceability`, both of which ARE on). Per the existing GPS note, dev reads `PT_MODULES` and the admin panel cannot turn it on. **Record as an environment gate; do not attempt to enable it.** Guard the matrix test with an explicit skip that names the module, so it self-enables if GPS is ever licensed.

## Finding 5 — crew piece-out header and the relaxed guard

Crew piece-outs exist on dev: `GET /api/time-cards/time-out` → 7 rows with `crewCounter` set and `employeeCounter: null`; days 2026-08-30 (2), 2026-09-02 (2), 08-29, 08-28, 08-11. Verified on 2026-08-30: two rows `0000004-260830-PO-*-ui`, crew 231, Type "Piece Out", Status Blocking ("Job does not pay by piece"), rendering Crew **and** Employee as "—" because `crewName` is null for crew 231.

The relaxed guard is observable client-side and was confirmed: with Field = Crew and the Value combobox left empty, **Continue is enabled** (`V1()` returns true for every fk except `employeeCounter`), i.e. clearing Crew is permitted. The remaining question — whether the server keeps a crew piece-out header in `reviewRecords` rather than dropping it into `failures`/out-of-scope — is exactly what the new test must assert; I stopped at the dialog and did not fire the dry run (the action was blocked, and nothing was applied).

**Data caution:** crew 231 has no name, so "current value → (blank)" reads "(blank) → (blank)". Do not assert on these shared rows — seed the test's own crew piece-out (`POST /api/time-cards/crew-piece-out`) bound to a named crew on a run-unique date.

## Finding 6 — FK lookup inventory on dev (`GET /api/transfer-to-job-cards/lookups/{source}`)

jobs 119 · crews 43 · ranches 18 · fields 29 · varieties 266 · employees 71 · **work-orders 0 · runs 0 · ag-rows 0**.
So Work Order, Run and Row can be exercised for *clearing* and for control identity, but cannot be *set* unless the test seeds one first (Input ▸ Work Order and Input ▸ Run screens exist; no Row create path was found).

## Files to change

* `src/components/webpet/WebpetMultiEditDialogComponent.ts` (**new**) — the Transfer dialog, driven entirely by the `multi-edit-*` test ids above: `fieldSelect`, `valueControlFor(field)`, `continueButton`, review-stage locators, `applyButton`. No base-ui Select portal dance needed for Field/Type/Transferred/mode (native `<select>` → `selectOption`); the fk Combobox popup does need `combobox-popup`/`combobox-item` scoping.
* `src/pages/processing/TransferToJobCardsPage.ts` — **additive only**: `selectRowByReference()`, `moreActionsButton`, `multiEditMenuItem`, `setCrewMenuItem`, a `cellAt(row, index)` using the map above, and `readonly multiEdit: WebpetMultiEditDialogComponent`. Reuse its existing `applyDateRange()`, `analyze()`, `waitForCandidates()` — do not rewrite them. It is consumed by journey specs, so this is a shared page object: run both suites' gates.
* `src/pages/webpet/input/TimeInListPage.ts` — add `FIELD_CELL_INDEX = 6`, `JOB_CELL_INDEX = 7`, `CREW_CELL_INDEX = 8` beside `RANCH_CELL_INDEX`, and a generic `cellEditorFor(row, field)`.
* `src/components/webpet/WebpetDataGridComponent.ts` — no new control types needed; only correct the `multiUpdateValueTrigger` doc comment to say it covers the Input bar's six Select-only fields and is not the Transfer dialog.
* `tests/webpet/transfer-multi-edit.spec.ts` (**new**) — the Transfer matrix, below.
* `tests/webpet/time-in.spec.ts` — extend beyond Ranch to the other four assertable Input-bar fields.
* `tests/webpet/support/provision.ts` / `tests/webpet/data-factory.ts` — add `createCrewPieceOut()` / `createTimeIn()` / `deleteTimeCard()` helpers (API only; the `ensureRanch`/`deleteRanch` pair is the pattern).
* `src/data/webpet/webpetRunnerManager.csv` + `npm run webpet:runner:sync` for the new `WP-nnnn` ids (two-pass allocation).

## Implementation approach

**Grouping: three specs, not nineteen.**

1. *Contract matrix, one test, zero mutations.* Open the dialog once on a seeded two-row day and walk all 18 `<option>`s, asserting for each: the label, and that the expected Value control is the one that renders. This is the cheap regression that catches "someone changed the control for Memo". Because it never applies anything it is safe on shared data and fast — but bound it with `test.setTimeout` since the parity project caps tests at 30s and the date-range + Analyze dance costs several seconds.
2. *Guard behaviour, one test, zero mutations.* Same dialog: assert Continue is **enabled** with a blank value for each of the 8 non-Employee fk fields plus Traceability/Memo/Pieces/Meal Length (the relaxed guard), and **disabled** for Employee, Date/Time, Date, Time, Type, Transferred (the guard that remains).
3. *Round-trip persistence, per field, on test-owned rows.* Seed rows via the API on a run-unique date, then apply and verify. Split into per-field tests inside one `describe`, sharing a `beforeAll` seed and an `afterAll` API delete, so one red field does not mask the others.

Restoration is by **re-seeding, not Undo** — `bulk-fix` has no undo endpoint. Never mutate a row the test did not create.

Three fields get bespoke handling:
* **Transferred** — never transfer anything. Exercise it in the opposite direction: seed a row, set Transferred = No, and assert; or assert review-stage only (`multi-edit-review-new` = "Yes") and cancel without applying. Do not run the screen's Transfer to Job Cards button, and never touch the Job Cards tab's delete.
* **Type (`cardType`)** — changes a time card's kind; only ever on a seeded row.
* **Work Order / Run / Row** — cover clear-to-blank and control identity now; add set-to-value only if the spec seeds a work order/run first. Row has no create path found → clear-only, with a comment saying why.

## Validation required

`npm run typecheck` · `npm run lint` · `npm run webpet:runner:sync` then `npm run webpet:runner:check` · run the affected specs only, dev-targeted (`npm run test:dev`, webpet project) — `tests/webpet/transfer-multi-edit.spec.ts` and `tests/webpet/time-in.spec.ts`. Because `src/pages/processing/TransferToJobCardsPage.ts` is shared, also re-run the journey specs that import it (`tests/web/journey-b-field/b05`, `b06`, `b10`) and `npm run runner:check`.

## Important constraints

Input grids: cell clicks are inert, edits go through the bar — but the Transfer screen is a *dialog*, not the bar, so do not reuse the bar locators there. base-ui Select/Combobox portals close behind an inert backdrop: keep using `waitForSelectPortalClosed()` before touching anything behind them, and expect fk combobox options to populate asynchronously (an option can read `''` immediately after opening). Narrow to a single seeded day before Analyze so the grid stays under the 100-row virtualization threshold. Never execute a transfer and never delete job cards. No seed/fixture files in the repo — the `webpet` project's `testDir` is `tests/webpet`, and dropping a scratch spec there breaks `webpet:runner:check`. All setup and cleanup through the API; there is no DB access.

## Cannot be covered on dev

| Field | Why |
|---|---|
| **GPS Reading** | `useModule('GPS')` is off; dev reads `PT_MODULES` and the admin panel cannot enable it. Not rendered at all — skip with the module named. |
| Work Order (set) | `lookups/work-orders` returns 0 rows — clear-only unless the spec seeds one. |
| Run (set) | `lookups/runs` returns 0 rows — same. |
| Row (set) | `lookups/ag-rows` returns 0 rows and no create path was found — clear-only. |
| Memo, Variety, Meal Length, Work Order, Row (grid assertion) | no grid column and none offered by the column chooser — assert via the review table plus the API, not a cell. |


## Test Scenarios

### 1. Transfer to Job Cards — Multi-Edit field matrix

**Seed:** `tests/webpet/transfer-multi-edit.spec.ts`

#### 1.1. [Transfer] Verify that the Multi-Edit Field select offers every licensed field with its exact label.

**File:** `tests/webpet/transfer-multi-edit.spec.ts`

**Steps:**
  1. Seed two time cards on a run-unique date via the API, open /transfer-to-job-cards, apply that single day as the date range and click Analyze Transfer Candidates.
    - expect: The grid caption reports the seeded rows
    - expect: No virtualization is involved — the day carries far fewer than 100 rows
  2. Select both rows, open More actions and choose Multi-Edit.
    - expect: The dialog multi-edit-dialog is visible
    - expect: Its description names 2 selected rows
  3. Read every option of multi-edit-field-select.
    - expect: The labels are exactly Job, Crew, Ranch, Field, Work Order, Variety, Run, Row, Employee, Date, Time, Date, Time, Traceability, Memo, Type, Transferred, Number of Pieces, Meal Length
    - expect: GPS Reading is absent and the test records the GPS module gate rather than failing
  4. Close the dialog with Cancel.
    - expect: Nothing was applied — no non-dry-run POST to /time-cards/bulk-fix was issued

#### 1.2. [Transfer] Verify that each Multi-Edit field renders its correct Value control.

**File:** `tests/webpet/transfer-multi-edit.spec.ts`

**Steps:**
  1. With the Multi-Edit dialog open on the seeded rows, select each field in turn and inspect the Value area.
    - expect: The eight foreign-key fields and Employee render a combobox named multi-edit-value-<suffix>-combobox
    - expect: Date, Time renders multi-edit-value-mode-select plus a datetime-local input, and switching the mode to Interval swaps it for multi-edit-value-interval-from and -interval-to
    - expect: Date renders an input[type=date] and Time an input[type=time]
    - expect: Traceability renders an input with maxlength 100 and Memo a textarea with maxlength 4000, both multi-edit-value-text
    - expect: Type and Transferred render the native multi-edit-value-choice-select, with Time Out/Time In/Signature/Non Labor and Yes/No respectively
    - expect: Number of Pieces and Meal Length render input[type=number] with min 0
  2. Cancel the dialog.
    - expect: No change was applied

#### 1.3. [Transfer] Verify that the relaxed guard lets a blank value through for every clearable field.

**File:** `tests/webpet/transfer-multi-edit.spec.ts`

**Steps:**
  1. With the dialog open and the Value left empty, step through Job, Crew, Ranch, Field, Work Order, Variety, Run, Row, Traceability, Memo, Number of Pieces and Meal Length.
    - expect: The Continue button is enabled for every one of them — a blank value is an allowed edit, not a blocked one
  2. Step through Employee, Date, Time, Date, Time, Type and Transferred with the Value left empty.
    - expect: The Continue button stays disabled for each — the remaining guard is intact
    - expect: Employee in particular cannot be cleared
  3. Cancel the dialog.
    - expect: No change was applied

#### 1.4. [Transfer] Verify that Crew can be cleared on a crew piece-out header.

**File:** `tests/webpet/transfer-multi-edit.spec.ts`

**Steps:**
  1. Seed a crew piece-out via the API on a run-unique date: a piece-out bound to a named crew with no employee, so the Crew cell shows the crew name and the Employee cell shows an em dash.
    - expect: The seeded row loads as a Piece Out on the Transfer grid
    - expect: Its Crew cell shows the seeded crew's name
  2. Select that row, open Multi-Edit, choose Field = Crew, leave the Value combobox empty and click Continue.
    - expect: Continue was enabled with a blank value
    - expect: The review stage appears rather than an error
    - expect: The seeded row is listed in the review table — it is NOT reported as out of scope and not counted in multi-edit-review-not-in-scope
    - expect: Its current value is the crew name and its new value reads (blank)
  3. Include the row and click Apply.
    - expect: The grid reloads with the row's Crew cell showing an em dash
    - expect: GET /api/time-cards/time-out for that record returns crewCounter null — the clear actually persisted
  4. Delete the seeded records through the API in afterAll.
    - expect: No shared dev data was modified, and the dry-run-only tests above left nothing behind

#### 1.5. [Transfer] Verify that a text, numeric, enum and boolean edit each persist on a seeded row.

**File:** `tests/webpet/transfer-multi-edit.spec.ts`

**Steps:**
  1. On seeded rows, apply Traceability = a run-unique code, then re-read the grid and the API.
    - expect: The Traceability cell (index 10) shows the new code
    - expect: The API record carries the same traceabilityCode
  2. Apply Memo = a run-unique string.
    - expect: The review's new value shows the string
    - expect: The API record carries it — there is no Memo column on the grid and the column chooser does not offer one, so the API is the only persistence proof
  3. Apply Number of Pieces = a distinct number, then clear it by applying a blank.
    - expect: The Pieces cell (index 9) shows the number and then empties
    - expect: The API record's numOfPieces follows, ending null
  4. Apply Type = Signature and Transferred = No on seeded rows only.
    - expect: The Type cell (index 13) and Transferred cell (index 15) both change
    - expect: No transfer was ever executed and no job card was deleted

### 2. Time In — Multi Update bar, remaining fields

**Seed:** `tests/webpet/time-in.spec.ts`

#### 2.1. [Time In] Verify that the Multi Update bar offers exactly its six fields.

**File:** `tests/webpet/time-in.spec.ts`

**Steps:**
  1. Open /input/time-in, narrow to a populated day, toggle Multi Update, select two rows and open the Field select.
    - expect: The options are exactly Work Crew, Ranch, Field, Phase, Work Order and Run
    - expect: The bar has not silently grown to the Transfer dialog's 19 — if it ever does, this test is the tripwire

#### 2.2. [Time In] Verify that a Field, Phase and Work Crew multi-edit persists to every selected row.

**File:** `tests/webpet/time-in.spec.ts`

**Steps:**
  1. With two rows selected, pick Field = Field, choose a value different from row A's current one, wait for the Select portal to close and click Update Records.
    - expect: Both rows' Field cells (index 6) show the chosen value
  2. Undo, then repeat for Phase (cell index 7) and Work Crew (cell index 8).
    - expect: Each edit lands on both rows and each Undo restores both original values
    - expect: The Ranch case (WP-0378, cell index 5) still passes unchanged
  3. Attempt Work Order and Run.
    - expect: Both are skipped with a recorded reason: dev's work-order and run lookups are empty and neither has a grid column, so persistence would have to be read from the API
