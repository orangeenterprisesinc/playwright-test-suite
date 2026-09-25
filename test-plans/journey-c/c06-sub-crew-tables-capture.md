# `C6` · Sub-crew ("tables") capture

> **Transport substitute, office half only.** Kiosk capture is device-only. C6-001 sets a table up
> on Setup ▸ Table. C6-002 clocks a table of three in through `POST time-cards/crew-time-in` with
> `crewTableCounter` — the same write `/scan/crew-time-in` performs, standing in for the kiosk
> sync (wording as in `crewTimeInApi.ts`: a substitute for the transport, not for the assertions).
> It then verifies the cards by id, the table→crew roll-up at data level, and the Table on the
> Crew Time In edit form. Reports are not on the web yet (PET-12682).

Source: no recording; office surface confirmed live 2026-09-25 (app.ptdev.xyz, `su`).
Manual source WEBPET-2035 (passed QA 2026-09-03).

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `C6` |
| Jira | `PET-12656` — [C6] Sub-crew ("tables") capture |
| Recording | — none |
| This plan | `test-plans/journey-c/c06-sub-crew-tables-capture.md` |
| Spec | `tests/web/journey-c-packhouse/c06-sub-crew-tables-capture.spec.ts` |
| Runner rows | `src/data/runner/journey-c.csv` → `C6-001`, `C6-002` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `C6` |
| Journey | `C` — Pack-house day (fixed-site kiosk capture) |
| Segments | `pack-house` |
| Modules | `Windows` |
| Surface | `device` — spec in `tests/web/journey-c-packhouse/`; C6-001 `ui`, C6-002 `workflow` (API + UI) |
| Demo candidate | no |
| Catalog status | draft |

**Summary** (from the catalog)
> Workers in a large crew are grouped into tables of three to five under a shared supervisor, and
> output can be reported per table or rolled to the crew. A table is a reporting grouping, not a
> separate data structure.

## Catalog steps

| # | Catalog step | Office surface (live 2026-09-25) | Automatable? |
|---|---|---|---|
| 1 | Assign workers to a table under a supervisor | Setup ▸ Table `/setup/crew-tables`: grid **"Tables"** (Name / Crew / Supervisor / Active). New form: `Name *`, `Crew *` (required combobox), `Supervisor` (combobox of **active employees**, `GET employees/lookup?limit=101&search=`, not crew-scoped), Active switch in the header. Save enables once Name + Crew are set. | **yes** — C6-001 |
| 2 | Capture time and pieces by table | Input ▸ Crew Time In (Batch group) `/input/crew-time-in/new`: `Table` combobox under `Crew *`. With no crew it lists **all** tables; with a crew it lists only that crew's; changing crew clears it. After a crew is picked an `Employees *` checklist appears. Crew Time In edit form `/input/crew-time-in/{timeCardCounter}` shows `Table`. **Time In New/Edit forms have no Table field.** | time: **yes** — C6-002 via the transport substitute. Pieces: deferred (O6). Kiosk capture: — not automatable: device capture; office receives the punches |
| 3 | Report by table or roll up to the crew | No web surface | — not automatable: reports not migrated to web (PET-12682); roll-up asserted at data level (C6-R3) |

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `C6-R1` | When a table is saved on Setup ▸ Table with a name, crew and supervisor, PET Tiger shall confirm "Table created", open `/setup/crew-tables/{id}`, list the table in grid "Tables" under that crew with Active "Yes", and return it from `GET /crew-tables` with `name`, `crewCounter`, `supervisorCounter` equal to the chosen records and `active` true. | `C6-001` |
| `C6-R2` | When workers of a crew are clocked in with a table selected, PET Tiger shall create one Time In card per worker, each carrying the table's `crewTableCounter` (and `crewTableName`) and the crew's `crewCounter`, readable from `GET time-cards/crew-time-in?from&to`. | `C6-002` |
| `C6-R3` | When the crew's day is grouped by `crewTableCounter`, the groups shall partition the crew's Time In total exactly (table count + no-table count = crew count), and the Crew Time In edit form shall show the table in `Table`. | `C6-002` |
| `C6-R4` | Where a report parameter selects "by table" or "roll up to crew", PET Tiger shall report output per table or for the whole crew. | — not automatable: reports not migrated to web (PET-12682) |
| `C6-R5` | When a worker punches at the kiosk with a table selected, PET Pocket/kiosk shall capture the punch against that table. | — not automatable: device capture; office receives the punches |
| `C6-R6` | When a saved table's edit link is opened, PET Tiger shall show the record in the Edit Table form. | `C6-001` — **red on dev today** (GET `/crew-tables/{id}` 500 → "Table not found."), see O1 |
| (POM) | Save stays disabled until Name and Crew are set; leaving a dirty form asks "Save changes before leaving?" (Don't Save / Cancel / Save). | page object behaviour, not asserted |

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Sidebar | — | `src/pages/shell/LeftNavigationPage.ts` | exists |
| Setup ▸ Table | `Setup ▸ Table` (between Ranch and Variety) | `src/pages/setup/CrewTablePage.ts` extends `SetupScreenPage` — `listUrl '/setup/crew-tables'`, `gridName 'Tables'`, `entity 'Table'` (buttons "New Table", links "Edit Table: <name>") | **new** |
| Input ▸ Crew Time In (edit) | `Input ▸ Crew Time In` → row | read-only check of the `Table` combobox; direct URL `/input/crew-time-in/{timeCardCounter}` | none — two locators inline in the flow, or a small POM (Generator's call) |

Picker labels: supervisor options read `"<exportIdentifier> : <name>"` when the employee has an
export identifier, otherwise the bare name. The grid renders the supervisor surname-first
("Annavarapu Chandra"), so assert the supervisor by counter on the API, not by grid text.

## Data

- Journey C fixture (exists): crew `7001` "C6 CREW", table workers `7002`/`7003`/`7004`
  "C6 TABLE ONE/TWO/THREE" (a table of three), supervisor `7005` "C6 SUPERVISOR" —
  `src/data/journey-c/fixture.json`. Ensured by `journeyCFlow.prepareJourneyC`, never deleted,
  guarded by `/^C\d{1,2} /`. Ranch `4001` / field `4101` / job `4201` reused read-only from Journey B.
- Table name: `makeCrewTableName()` (prefix `E2ECrewTable_`), substituted as `{tableName}`.
- Punch day: `dayOffset -10` (distinct from Journey B's 0…-9); fixed `punch` time, never `now`.
- Scenario: `src/data/journey-c/c06-sub-crew-tables-capture.json` (`{ shared, cases }`), validated
  by `CrewTableCaseSchema`. C6-001 has no `capture`; C6-002 has `capture.workerCodes`
  `["7002","7003","7004"]` and `expected { cardType: 1, cardsOnTable: 3, cardsOffTable: 0 }`.
- Specs import only `@utils/journeys/journeyCFlow` (no `@utils/api/*`). C6-002 creates its table
  through a flow helper wrapping `crewTablesApi.createCrewTable`.

## Preconditions

- [ ] `prepareJourneyC` ensures the fixture and runs the before-phase sweep for 7002–7004 on day −10.
- [ ] Session API authenticated (`sessionApi`); CSRF double-submit as in `apiLogin.ts`.
- [ ] GET `/crew-tables/{id}` answering 200 on dev (O1) — without it no table can be cleaned up.

## Cleanup

- Table: `{ kind: 'delete', entity: 'crewTable', name: '{tableName}' }`. The `crewTable` target
  already exists in `cleanupTargets.ts` (listPath `crew-tables`, idKey `crewTableCounter`, order 38,
  prefix `E2ECrewTable_`). DELETE `/crew-tables/{id}` needs `{ rowversion }`, and list rows carry
  **no** `version`, so `deleteCrewTable` re-reads the detail — which 500s today (O1).
- Cards: `{ kind: 'timeCards', employeeCodes: ['7002','7003','7004'], dayOffset: -10, cardTypes: [1] }`,
  before and after. Delete cards **before** the table so no card references a deleted table.
- No SQL, no UI delete (the Table screen has no list-level delete; More actions = Edit Widgets only).

## Test cases

| id | Title | Req | Tags | Category | enabled |
|---|---|---|---|---|---|
| `C6-001` | [Setup ▸ Table] Create a table under a crew with a supervisor | `C6-R1`, `C6-R6` | `regression` | ui | 0 → 1 when green |
| `C6-002` | [Capture by table] Clock a table of three in and roll the day up to the crew | `C6-R2`, `C6-R3` | `regression` | workflow | 0 → 1 when green |

**C6-001 steps:**
1. `prepareJourneyC`.
2. `CrewTablePage.gotoList()`, then `openNewForm()`.
3. Fill Name, pick Crew "C6 CREW", pick Supervisor "C6 SUPERVISOR", save.
4. Expect the "Table created" toast and an edit URL of the form `/setup/crew-tables/{id}`.
5. Expect the Edit form to show the record (C6-R6).
6. Reload the list: the row shows Crew "C6 CREW" and Active "Yes".
7. `GET /crew-tables`: the row's name, crewCounter, supervisorCounter and active match.
8. Cleanup.

**C6-002 steps:**
1. `prepareJourneyC`, then create the table via the API.
2. `captureByTable` (annotation `transport-substitute`). Expect created = 3.
3. Read `GET time-cards/crew-time-in?from=day&to=day` and filter to the returned references. Expect:
   - 3 rows;
   - each row's `crewTableCounter` = the table id and `crewTableName` = tableName;
   - `crewCounter` = the C6 crew id;
   - `employeeCounter` = the seeded worker ids.
4. Roll-up over the same endpoint, filtered to the C6 crew: on-table = 3, off-table = 0, and on + off = crew total.
5. Open `/input/crew-time-in/{timeCardCounter}` for one card. Expect `Table` = tableName and `Crew *` = "C6 CREW".
6. Cleanup.

**Generator must change `journeyCFlow.rollUpByTable`** (and any id assertion) to read
`time-cards/crew-time-in`: `GET time-cards` (list and `/{id}`) omits `crewTableCounter`, so the
current code would put every card in "no table" (key 0).

## Resolution (orchestrator, 2026-09-25 — API probe + dev API logs)

- **O1 confirmed, root cause found.** `GET /crew-tables/{id}` and `GET /crew-tables/deleted` fail
  in the API with `mssql: Invalid object name 'ct.TimeStamp'` (Datadog, service tigerden env dev,
  "crew-tables: get failed"). The query selects a rowversion column the CrewTable table lacks.
  Product defect to file against web-pet; until fixed no table is deletable.
- **O2: no.** `POST /crew-tables` answers `201 {"crewTableCounter": n}` only. List rows carry no
  `version`. So the suite must not create disposable tables per run.
- **O3: yes.** `GET time-cards/crew-time-in?from&to` lists the crew time-in punches with
  `crewTableCounter`, `crewTableName`, `crewCounter`, `employeeCounter`, `reference`, `version`.
  `journeyCFlow` reads that endpoint (`listCrewTimeIns`); the generic `time-cards` list is used
  only to find the cards for cleanup.
- **O4:** the Crew Time In edit form (`/input/crew-time-in/{timeCardCounter}`) is the UI check.
- **O5:** uniqueness is **per crew**, server-side: 409 `A table with this name already exists for
  this crew.` The page object's `rejectionMessage` matches that text or the generic toast.
- **Design consequence of O1/O2:** C6-002 captures against a **fixed fixture table**
  `C6 TABLE A` under crew 7001 (ensured through the API, protected name, never deleted). C6-001
  still creates a run-unique table on screen — that is the workflow step — and declares it
  `unremovable` (one leaked row per run until the defect is fixed; then switch the step to
  `delete`). The "reopen the saved table" assertion (C6-R6) is isolated in **C6-003**, kept
  `enabled=0` with the defect in its runner description so the package stays green without hiding it.
- **O6:** pieces-by-table deferred; the suite has no crew piece-out helper (candidate C6-004).
- **O7:** yes — the supervisor 7005 is clocked in with no table (`capture.offTableCodes`), so the
  roll-up partitions 3 on-table + 1 off-table = 4.
- **O8:** no — employee rows stay untouched (fixture hygiene); table membership is expressed by the
  time-in's Table selection, as the catalog's step 2 does.
- Rows left on dev by the exploration: `E2ECrewTable_PLAN_0937` (id 2, Planner) and
  `E2ECrewTable_PROBE_…` (id 3, orchestrator probe); undeletable until the fix. Remove by hand then.

## Test cases (final)

| id | Title | Req | Tags | Category | enabled |
|---|---|---|---|---|---|
| `C6-001` | [Setup ▸ Table] Create a table under a crew with a supervisor | `C6-R1` | `regression` | ui | 0 → 1 when green |
| `C6-002` | [Capture by table] Clock a table of three in and roll the day up to the crew | `C6-R2`, `C6-R3` | `regression` | workflow | 0 → 1 when green |
| `C6-003` | [Setup ▸ Table] Reopen a saved table from the grid | `C6-R6` | `regression` | ui | 0 — dev defect (ct.TimeStamp), enable when fixed |

## Open questions (as raised by the Planner; resolved above)

| # | Question | Why it matters |
|---|---|---|
| O1 | `GET /crew-tables/{id}` and `GET /crew-tables/deleted` return **500 `internal server error`** for every id (rows 1 and 2) on dev 2026-09-25. The Edit page shows "Table not found.", and DELETE answers `400 invalid_version` without a version. File a WEBPET bug? Until it's fixed, C6-001 (C6-R6) is red and **neither case can clean up its table**. Run with `enabled=0`, or add an `unremovable` cleanup step with the ticket? | Blocks cleanup and C6-R6; an unremovable table piles up one row per run. |
| O2 | Does `POST /crew-tables` return `version` in its body? If yes, the spec can keep it for DELETE and skip the broken detail GET. Not captured live. | Possible cleanup workaround for O1 without weakening anything. |
| O3 | `GET time-cards/crew-time-in` returned **one** row for 2026-08-01…09-25 while `GET time-cards` holds 36 crewed Time In cards. Confirm that cards from `POST time-cards/crew-time-in` appear there (expected — same route as the form). | C6-R2/R3 read path. |
| O4 | The brief said "the office **Time In** form shows the Table". Live, the Time In form has no Table field (New or Edit, with or without Work Crew); only the Crew Time In New/Edit forms have one. Is the Crew Time In edit form the right office check, or is a Table field missing from Time In (bundle lag vs. by design)? | Decides where C6-R3's UI assertion lives. |
| O5 | Duplicate table name under the same crew: no on-blur rejection and Save enables; the server response (409 → "Failed to create table"?) is unobserved. Is uniqueness per crew, global, or none? `SetupScreenConfig.rejectionMessage` needs a value — `/Failed to create table/` is a placeholder. | Page object config; possible extra negative case. |
| O6 | Catalog step 2 says "time **and pieces** by table". Should C6-002 also post a Crew Piece Out with the table? The form wasn't explored (out of brief scope) and the suite has no crew piece-out helper. | Coverage of step 2's second half. |
| O7 | With every fixture worker on one table, the partition check is trivial (3 = 3, off = 0). Should the supervisor 7005 (or a 4th worker) be clocked in with no table so off-table = 1 and the roll-up is non-trivial? | Strength of C6-R3. |
| O8 | Should C6-001 also assign the workers to the table on the Employee form (`crewTableCounter`, filtered to the crew)? It changes a permanent fixture row and ties it to a per-run table that must be unassigned before DELETE. The plan leaves assignment to the time-in `Table` selection. | Fidelity to step 1 vs. fixture hygiene. |
