# `C6` · Sub-crew ("tables") capture

> **Office half only.** Kiosk capture is device-only. `C6` clocks the crew in on Input ▸ Batch ▸
> Crew Time In, then clocks it out on Input ▸ Batch ▸ Crew Time Out: the table of three with the
> table selected, then the supervisor with none. It verifies the Table, Crew and employee of each
> time-out on the Crew Time Out edit page and View ▸ Time Cards. Reports are not on the web yet (PET-12682).

> **Changed 2026-10-29.** web-pet #1526 (WEBPET-3734, merged 2026-10-28, confirmed by product)
> removed the Table picker from Crew Time In. Legacy Crew In has none either. Crew Time Out, Crew
> Piece Out and Multi New Cards keep it, and the API is unchanged (`crewTableCounter` is optional on
> crew time-in). C6 used to pick the table on Crew Time In and failed every run after the merge. The
> table is now captured on **Crew Time Out**. Crew Time In clocks all four members in with no table.

Source: no recording. Crew Time In surface confirmed live 2026-09-25 (app.ptdev.xyz, `su`); Crew Time
Out Table block read from web-pet source `CrewTimeOutFormPage.tsx` (WEBPET-1085), live check pending (O9-O13).
Manual source WEBPET-2035 (passed QA 2026-09-03).

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `C6` |
| Jira | `PET-12656` — [C6] Sub-crew ("tables") capture |
| Recording | — none |
| This plan | `test-plans/journey-c/c06-sub-crew-tables-capture.md` |
| Spec | `tests/web/journey-c-packhouse/c06-sub-crew-tables-capture.spec.ts` |
| Runner row | `src/data/runner/journey-c.csv` → `C6` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `C6` |
| Journey | `C` — Pack-house day (fixed-site kiosk capture) |
| Segments | `pack-house` |
| Modules | `Windows` |
| Surface | `device` — spec in `tests/web/journey-c-packhouse/`; category `workflow` (API + UI) |
| Demo candidate | no |
| Catalog status | draft |

**Summary** (from the catalog)
> Workers in a large crew are grouped into tables of three to five under a shared supervisor, and
> output can be reported per table or rolled to the crew. A table is a reporting grouping, not a
> separate data structure.

## Catalog steps

| # | Catalog step | Office surface | Automatable? |
|---|---|---|---|
| 1 | Assign workers to a table under a supervisor | Setup ▸ Table `/setup/crew-tables`: grid **"Tables"** (Name / Crew / Supervisor / Active). New form: `Name *`, `Crew *`, `Supervisor` (active employees, not crew-scoped), Active switch. | precondition — the fixed `C6 TABLE A` is ensured on Setup ▸ Table when missing |
| 2 | Capture time and pieces by table | **Crew Time In** `/input/crew-time-in/new` has **no Table field** since WEBPET-3734 / web-pet #1526. **Crew Time Out** `/input/crew-time-out/new`: `Date / Time *`, `Crew *`, `Table` (after Crew; lists only the chosen crew's active tables; changing Crew clears it), `Number of Pieces`, `Phase`, `Memo`, then the `Employees` grid (crew members with an open Crew Time In within 24 h, all ticked by default). Blank Pieces = one time-out per ticked employee, each carrying the table. Edit form `/input/crew-time-out/{timeCardCounter}` is read-only and shows `Table` and `Crew`. | time: **yes** — the table is entered on the Crew Time Out form. Pieces: — deferred (Crew Piece Out also carries Table; not explored). Kiosk capture: — not automatable: device capture |
| 3 | Report by table or roll up to the crew | No web surface | — not automatable: reports not migrated to web (PET-12682); roll-up asserted on screen (edit pages + View ▸ Time Cards crew count) |

## Expected outcomes

- When the crew's four members are clocked in on Crew Time In (no table), and the three table workers are then clocked out on Crew Time Out with `C6 TABLE A` selected, PET Tiger saves one Time Out card per worker. The Crew Time Out edit page of each card shows `Table` = `C6 TABLE A` and `Crew` = `C6 CREW`.
- When the supervisor is clocked out on Crew Time Out with no table, the edit page of that card shows an empty `Table` and `Crew` = `C6 CREW`.
- The employees on the on-table time-outs, read from the View ▸ Time Cards record sheet, are exactly C6 TABLE ONE/TWO/THREE. The employee on the off-table time-out is exactly C6 SUPERVISOR.
- The table partitions the crew's time-outs without loss or duplication: 3 on-table + 1 off-table = 4 time-outs, one per clocked-in member. View ▸ Time Cards for day −10 filtered to `C6 CREW` shows 8 rows (4 Time In + 4 Time Out).
- Where a report parameter selects "by table" or "roll up to crew", PET Tiger reports output per table or for the whole crew. _not automatable: reports not migrated to web (PET-12682)_
- When a worker punches at the kiosk with a table selected, the kiosk captures the punch against that table. _not automatable: device capture; the office receives the punches_
- Crew Time In shows no Table picker (WEBPET-3734). _not asserted: product change, not this workflow's outcome_
- Pieces by table (Crew Piece Out's Table). _deferred: no Crew Piece Out table helper; form not explored live_
- When a saved table's edit link is opened, PET Tiger shows the Edit Table form. _not automatable: `GET /crew-tables/{id}` answers 500 on dev (`Invalid object name 'ct.TimeStamp'`) — product defect_
- Crew Time Out Save stays disabled until a crew and at least one employee are set. Changing Crew clears Table. _(POM) — page object behaviour, not asserted_

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Sidebar | — | `src/pages/shell/LeftNavigationPage.ts` | exists |
| Setup ▸ Table | `Setup ▸ Table` | `src/pages/setup/CrewTablePage.ts` (via `ensureCrewTableOnScreen`) | exists |
| Input ▸ Crew Time In (new) | `Input ▸ Crew Time In` → New | `src/pages/input/CrewTimeInPage.ts` | exists — Table support **removed** |
| Input ▸ Crew Time Out (new + edit) | `Input ▸ Crew Time Out` → New / list row | `src/pages/input/CrewTimeOutPage.ts` | exists — **extend**: Table picker, roster narrowing, edit read-back |
| View ▸ Time Cards | `View ▸ Time Cards` | `src/pages/processing/ViewTimeCardsPage.ts` | exists (sheet title matches `Edit Time (In\|Out)`) |

## Data

- Journey C fixture (exists, `src/data/journey-c/fixture.json`): crew `7001` "C6 CREW" (counter 2075 on dev), table workers `7002`/`7003`/`7004` "C6 TABLE ONE/TWO/THREE", supervisor `7005` "C6 SUPERVISOR", table **`C6 TABLE A`** (crew C6 CREW, supervisor 7005). The crew also owns `C6 TABLE B` and 11 undeletable `E2ECrewTable_*` leftovers. Fixture rows are ensured by `prepareJourneyC`, never deleted, and protected by `/^C\d{1,2} /`. Ranch `4001` / field `4101` / job `4201` are reused read-only from Journey B (the Crew Time In context).
- Day: `dayOffset -10`, Journey C's own day (Journey B owns 0…−9). Fixed times, never `now`: time-in **07:15**, time-out **11:30**.
- Scenario `src/data/journey-c/c06-sub-crew-tables-capture.json`, validated by `CrewTableCaseSchema`: `table { source: 'fixture', withSupervisor: true }`, `capture.workerCodes ["7002","7003","7004"]` (clocked out with the table), `capture.offTableCodes ["7005"]` (clocked out with no table), `expected { cardType: 0, cardsOnTable: 3, cardsOffTable: 1, crewDayRows: 8 }`.
- The spec imports only `@utils/journeys/journeyCFlow`.

## Preconditions

- [ ] `prepareJourneyC` ensures on screen: ranch, field, job, crew, the four employees (home crew C6 CREW, active) and `C6 TABLE A`. It then runs the before-phase sweep for 7002–7005 on day −10, card types 0 and 1. A leftover open time-in would otherwise show on the Crew Time Out roster.
- [ ] The dev bundle includes web-pet #1526 and Crew Time Out still renders `Table` (O9).
- [ ] Session API authenticated (`sessionApi`).

## API allowances

Every call outside the browser. The Crew Time In and both Crew Time Out saves are UI and have no row here.

| Step / call | Endpoint | Allowance | Why |
|---|---|---|---|
| fixture-row existence lookup | `GET crews` · `GET employees` · `GET jobs` · `GET ranches` · `GET fields` · `GET crew-tables` (+ `GET <entity>/{id}` repair check) | read | `ensureOnScreen`: existence is a GET; create and repair are UI |
| binned fixture row restore | `POST <entity>/{id}/restore` | cleanup | inside `ensureOnScreen`; not available for tables (`GET crew-tables/deleted` 500) |
| time-in card ids | `GET time-cards?from&to` | plumbing read | after the Crew Time In save: day −10, the 4 fixture employees, card type 1, untransferred. Polls to 4 and records the ids into the cleanup context **before** the time-outs, so a failed time-out still cleans the time-ins |
| time-out card ids | `GET time-cards?from&to` | plumbing read | after both Crew Time Out saves: same scope, card type 0. Polls to 4 and appends the ids. The screens prove Table / Crew / employee |
| card sweep before/after | `DELETE time-cards/{id}` | cleanup | `timeCards` step, card types [0, 1] |

No write to a setup record outside a screen. No `api-only-evidence`.

## Cleanup

- Cards: `{ kind: 'timeCards', employeeCodes: ['7002','7003','7004','7005'], dayOffset: -10, cardTypes: [0, 1] }`, before (sweep by employee/day/type) and after (by the recorded ids: 4 time-ins + 4 time-outs).
- The table is the fixed fixture row and is never deleted. No `crewTable` step.
- No SQL, no UI delete.

## Test case

| id | Title | Tags | Category | enabled |
|---|---|---|---|---|
| `C6` | Clock a table of three out against its table and roll the day up to the crew | `regression` | workflow | 1 |

**Steps:**
1. `prepareJourneyC`: ensure the crew, its four members and `C6 TABLE A` on screen; sweep time-in and time-out cards for 7002–7005 on day −10.
2. Input ▸ Crew Time In ▸ New: Date/Time = day −10 07:15, tick Use Employee Crew, Crew = C6 CREW, Ranch/Field/Phase = Journey B's 4001/4101/4201, roster narrowed to the four fixture members, Save, OK on the status dialog. Plumbing poll: 4 time-in cards; ids recorded for cleanup.
3. Input ▸ Crew Time Out ▸ New: Date/Time = day −10 11:30, Crew = C6 CREW, **then** Table = C6 TABLE A. Narrow the roster to C6 TABLE ONE/TWO/THREE. No Pieces, no Phase. Save, then OK.
4. Input ▸ Crew Time Out ▸ New: Date/Time = day −10 11:30, Crew = C6 CREW, Table left empty, roster narrowed to C6 SUPERVISOR (the only member still open), Save, OK. Plumbing poll: 4 time-out cards; ids appended for cleanup.
5. For each time-out card: Input ▸ Crew Time Out list → day −10 → "Edit Crew Time Out: <reference>". Read `Table` and `Crew`. Then on View ▸ Time Cards (day −10, Apply), open each reference's record sheet and read Employee. Expect:
 - 3 cards with Table = `C6 TABLE A`, whose employees are exactly {C6 TABLE ONE, TWO, THREE};
 - 1 card with an empty Table, whose employee is C6 SUPERVISOR;
 - Crew = `C6 CREW` on all 4.
6. View ▸ Time Cards, day −10, Reference filter cleared, Work Crew = C6 CREW. Expect Total = 8 (4 Time In + 4 Time Out): the table groups the day, it never loses or duplicates.
7. Cleanup: delete the 8 recorded cards.

## Resolution history

- 2026-09-25: O1 `GET /crew-tables/{id}` / `GET /crew-tables/deleted` 500 (`Invalid object name 'ct.TimeStamp'`): tables cannot be deleted, so C6 uses the fixed `C6 TABLE A`. O2 `POST /crew-tables` returns only the counter; list rows carry no `version`. O5 uniqueness is per crew (409 "A table with this name already exists for this crew."). O6 pieces deferred. O7 off-table member, so the partition is 3 + 1. O8 employee rows untouched; table membership is the punch's Table selection.
- 2026-09-28: green on dev (Crew Time In variant, 17.7 s).
- 2026-10-29: WEBPET-3734 / web-pet #1526 removed Table from Crew Time In. Capture moved to Crew Time Out (this revision). Open: O9–O13 below.

## Open questions (live check before generating)

- O9 Does app.ptdev.xyz serve a bundle with #1526? On it, Crew Time In must show no Table and Crew Time Out must show `Table` (`#crewTableCounter`, a fillable input) listing `C6 TABLE A` once C6 CREW is picked.
- O10 Does the Crew Time Out roster use the same `Select All`/`Deselect All` toggle and checkbox labels (`<code>: <name>` or `: <name>`) as Crew Time In, all ticked by default?
- O11 Does each fanned-out time-out persist `crewTableCounter` and `crewCounter`? Does `/input/crew-time-out/{id}` show Table (no placeholder text as its value when empty) and Crew?
- O12 Does the Crew Time Out list use the same date-range control as Crew Time In? Is its row link named `Edit Crew Time Out: <reference>`, with each fanned-out card having its own reference?
- O13 Do time-out rows show under the C6 CREW Work Crew chip on View ▸ Time Cards (so the total is 8), and does the Edit Time Out sheet fill `#employeeCounter`?
