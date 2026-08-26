# `B4` · Sticker-roll assignment at day start

> **Transport, not simulation — happy path only.** As with B1/B2/B3 the spec does not drive a
> device. It builds the `OrangeExportFile` envelope PET Pocket syncs, delivers it through the
> relay, imports it, and verifies the office side by id.
>
> **What the recording actually shows changes B4's shape.** The catalog describes a dedicated
> "assign the roll" scan. Amy does not use one. The device main menu carries an `ASIGNAR ROLLO`
> tile (kf 75) but she never opens it — she assigns the roll **inside the Time In screen**, which
> on this build (PET 26.01.22) carries a `First Roll Code` field (kf 1, 51). Each saved Time In
> therefore leaves the device carrying the roll code, and the office shows it on the Time In
> record's **Traceability** field (kf 141). That is the path this plan automates: an ordinary
> individual Time In record whose `TraceabilityCode` is the roll's first sticker.

Source: `docs/media/journey-b/b04-sticker-roll-assignment.mp4` (Jira WEBPET-1523 attachment 66882,
158.5 s, 1920×1032) → `.video-annotations/b04-sticker-roll-assignment/` — 142 keyframes, 71 action
(10 force-sampled), `Max gap 5.0s of 5.0s allowed`, not capped. The default run was **capped at 60
change points with `Max gap 8.2s of 5.0s allowed`**; re-run once with `--max-frames 140` per the
annotator's own remedy table, which uncapped it and closed the gap. No other flag was changed.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `B4` |
| Jira | `WEBPET-1523` — [B4] Sticker-roll assignment at day start |
| Recording | `docs/media/journey-b/b04-sticker-roll-assignment.mp4` |
| This plan | `test-plans/journey-b/b04-sticker-roll-assignment.md` |
| Spec | `tests/web/journey-b-field/b04-sticker-roll-assignment.spec.ts` |
| Runner rows | `src/data/runner/journey-b.csv` → `B4-001` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `B4` |
| Journey | `B` — Field harvest day (mobile field capture) |
| Segments | `grower\|perennial-grower\|pack-house` |
| Modules | `Traceability - Stickers` |
| Surface | `device` — spec lives in `tests/web/journey-b-field/`, runner category `workflow` (API + UI in one test, like B1/B2/B3) |
| Demo candidate | yes — CSV `demo=1`, so the test also carries `@Demo` |
| Catalog status | draft |

**Summary** (from the catalog)
> Link an employee to the sticker number range they will use for the day so later case scans
> attribute to them. The checker scans the roll's first sticker, then the badge.

## Catalog steps

| # | Catalog step | What the recording shows | Automatable? |
|---|---|---|---|
| 1 | The employee places the first sticker of their roll on the back of their badge. | Nothing — physical, off-camera. | no — physical act, no system surface |
| 2 | The checker scans the first sticker, then the employee badge. | Amy works in **PET - Tiempo de Entrada** (Time In), not a dedicated assign screen. She sets the header once — Rancho `KIRENS`, Campo `PACKING HOUSE`, Trabajo `GRAFTING`, Cuadrilla `254 RONALDO MEDRANO`, date `08/10/2026`, time `6:00 AM` (kf 1–51) — then per employee fills **First Roll Code** and **Empleado** and saves (kf 57 "Saved record for: …"). Four records, four distinct roll codes (kf 65–71). | **yes, as transport** — the scan order is device-side; what reaches the office is a Time In record carrying the roll code |
| 3 | A confirmation tone saves the link; the employee owns that sticker prefix, and the rest of each number identifies the case. | Device list `PET Time In Recs (4) Emps (4)` shows each employee with `First Roll Code: B72…` (kf 65–71). Office: View ▸ Time Cards filtered `2026-08-10 – 2026-08-10` → 4 `Time In` rows at `06:00` (kf 101), Exceptions panel `4 issues` "No corresponding Time-Out…" (kf 107). Opening a row (kf 141) shows **Traceability `B7282120254`**, Employee Selection `Barcode Badge`, Reference `0000011-260810-TI-S34-ui`, Ranch `KIRENS`, Field `Packing House`, Phase `Grafting`, Work Crew `254 Ronaldo Medrano`, GPS `(36.8076512, -119.8347981)`, Transferred `No`, Unedited `Yes`. | **yes** for the stored link; **no** for the tone |

Roll codes captured, one per employee (kf 65–71):

| Employee | First Roll Code |
|---|---|
| Montalvo Bonfil, Francisco E | `B7271530648` |
| Barillas Ramirez, Balmore A | `B7288520643` |
| Santos, David | `B7281920556` |
| Martinez, Alejandro | `B7282120254` |

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `B4-R1` | Where the Traceability - Stickers module is licensed, when a device export containing individual Time In records that carry a sticker-roll traceability code is imported, PET Tiger shall create one Time In time card per reference with the importing employee's id. | `B4-001` |
| `B4-R2` | Where the Traceability - Stickers module is licensed, when such a record is imported, PET Tiger shall store the roll's first sticker code as that time card's traceability code. | `B4-001` |
| `B4-R3` | When each employee in one export carries a distinct sticker roll, PET Tiger shall store each roll code against only its own employee's time card. | `B4-001` |
| `B4-R4` | PET Tiger shall play a confirmation tone when the roll-to-badge link is saved on the device. | — not automatable: device audio, no office surface |
| `B4-R5` | PET Tiger shall require the sticker to be scanned before the badge. | — not automatable: device-side scan order, enforced in `AssignBarcodeRollActivity.processScannerCode`; the exported record carries no ordering evidence |
| `B4-R6` | Where the Traceability - Stickers module is licensed, when a barcode roll is assigned to an employee at the pack-house line, PET Tiger shall record the roll against that employee's code history. | — **withheld**, see *Withheld: the pack-house variation* |
| `B4-R7` | If a roll already assigned to an employee is assigned to that same employee again, then PET Tiger shall report the assignment as `alreadyAssigned` and shall not add a second code-history row. | — **withheld**; the product currently fails this |
| `B4-R8` | If a roll assignment omits the employee, then PET Tiger shall reject it with `Employee is required` on field `employeeCounter`. | — **withheld** with R6/R7 (same endpoint) |
| `B4-R9` | When individual Time In records carrying sticker-roll traceability codes are imported, PET Tiger shall not create or modify any employee code-history row. | `B4-001` |

`B4-R6`–`B4-R8` cover the catalog's *"pack-house assigns at the line"* variation through
`POST /scan/assign-barcode-roll`. They were implemented, run against dev, and then **withheld** —
see below. They are not deleted: the requirements stand, the product does not currently meet R7,
and the helper (`src/utils/api/stickerRollApi.ts`) is kept ready. No rejection criteria are
invented — the recording is a single happy path, and guessing failure modes the frames never
showed would break rule 6.

### Withheld: the pack-house variation

Run against dev staging 2026-08-26. Two **byte-identical** calls to
`POST /scan/assign-barcode-roll` (`{employeeCounter, alternateCode, firstCode}`) both returned
`outcome: "inserted"`, leaving two rows on employee `6006`:

```
{counter:2, alternateCode:"B7999900006", startDateTime:null, firstCode:"B7999900006", codeType:0}
{counter:1, alternateCode:"B7999900006", startDateTime:null, firstCode:"B7999900006", codeType:0}
```

The documented enum says `alreadyAssigned = no-op (already assigned to this employee)`, and the
table's identifying columns are `(EmployeeCounter, AlternateCode, StartDateTime)` — identical across
both rows, since `startDateTime` is null and the request has no field to supply it. So the no-op
branch may be unreachable by construction.

**Consequence for B4:** with no delete endpoint, keeping phase 2 in `B4-001` would leak one
undeletable row per run. It is withheld until the behaviour is settled (product defect vs. a
misleading OpenAPI description — the handler source has not been read, so the ticket is not yet
filed). Two rows already exist on `6006` from this investigation and cannot be removed via any API.

## Not established by the recording — all resolved

Each decided an assertion. None was guessed; each is now closed with its evidence.

| # | Question | Resolution |
|---|---|---|
| N1 | Does importing a Time In whose `TraceabilityCode` is a roll code also write an **EmployeeCodeHistory** row? | **No.** `employee_code_history.go` consumes only the nested `<EmployeeCodeHistory_Records>` grid, which `B4-001` never sends; a flat `<TimeCard_Records>` row never reaches it. Asserted as `B4-R9`. The roll→employee link later piece-outs resolve through is the TimeIn traceability code itself — see `/admin/time-cards/set-crew-from-traceability`. |
| N2 | Whole scanned sticker or derived prefix? | **Verbatim.** Device `First Roll Code: B7282120254` (kf 65–71) = office Traceability `B7282120254` (kf 141). The spec asserts equality with the sent code. |
| N3 | Is Traceability - Stickers licensed on dev staging? | **Yes.** `POST /scan/assign-barcode-roll` returns `400 {"error":"Employee is required"}` — a validation rejection, so auth, CSRF, permissions and the module gate all passed. |
| N4 | Is the dedicated assign path (`ASIGNAR ROLLO` / `POST /scan/assign-barcode-roll`) in scope? | **Yes, folded into `B4-001` as phase 2** — it is the catalog's "pack-house assigns at the line" variation. No second runner row. Carries `B4-R6`–`B4-R8`. |
| N5 | Does the import create any row beyond the Time In cards? | **No.** Proved by bracketing the import with `GET /employees/{id}/code-history` snapshots for **both** `6005` and `6006` and asserting **deep equality** (not just count, so mutation and reassignment are caught too), alongside `verifyImportInOffice`'s id-equality on `GET /time-cards`. Snapshots must bracket the import **only** — phase 2 legitimately writes a history row. |

### Schema discovery already done (evidence for the Planner)

Read-only source fetches, so the Planner does not repeat them:

* **`AssignBarcodeRollActivity.java`** (`AndroidPET/app/src/main/java/…/editrecord/`) — the dedicated
  screen writes `RecordTypes.EMP_CODE_HISTORY` (`mScreenType = TABLE_EMP_CODE_HISTORY_RECORDS`),
  setting `ScannedCode`, `AlternateCode`, `FirstCode`, `StartDateTime`, `Employee`.
* **`EmployeeCodeHistoryRecord.java`** — `PartID = "CH"`; columns `Author, DateIn, TimeIn, Employee,
  StartDateTime, ScannedCode, AlternateCode, FirstCode, Reference, UpdateTime, ExportTime`. Its
  `listOfEmptyRequiredValues` is commented *"Used for time in activity"*, consistent with the Time In
  screen also producing one — this is what N1 must confirm end to end.
* **`TimeCardExport.serializeCodeHistoryRecords`** — that record does **not** export as a flat
  `<X_Records>` section. It nests:
  `<Employee_Records LookupContents="Employee:Code"><Employee><Code>…</Code>`
  `<EmployeeCodeHistory_Records LookupContents="AddOnlyGrid"><EmployeeCodeHistory>…`
* **`web-pet importmap/employee_code_history.go`** (WEBPET-2121) — the importer accepts that nested
  grid. Columns `AlternateCode` (NOT NULL), `StartDateTime`, `FirstCode` (NOT NULL), `ScannedCode`,
  `Reference`, `CodeType` (enum, default `0` = Sticker Roll). Identity =
  `(EmployeeCounter, AlternateCode, StartDateTime)`; `AddOnlyGrid` makes the write insert-only and
  idempotent. Gated on the `LABELTRACEABILITY` module (N3).
* **Office read-back**: `GET /employees/{id}/code-history` → `{employeeCodeHistoryCounter,
  alternateCode, startDateTime, firstCode, codeType}`. Rendered read-only by
  `EmployeeCodeHistorySection.tsx`. **There is no DELETE** for a code-history row anywhere in
  `apps/api/openapi.yaml` — see *Cleanup*.
* **Office write path** (N4): `POST /scan/assign-barcode-roll` → `outcome: inserted | reassigned |
  alreadyAssigned`. An upsert, so it is repeatable without accumulating rows.

**Verdict: Outcome A — the assignment is exported and the importer accepts it.** The recording's
path needs no new `DEVICE_SCHEMA` node at all: `traceabilityCode` is already a `DeviceRecord` field
and `DEVICE_SCHEMA.tags.traceabilityCode` already exists, so `B4-001` is a `TimeCard`/`TI`/
`BarcodeBadge` record with `traceabilityCode` set. The nested `EmployeeCodeHistory` grid is only
needed for the dedicated `ASIGNAR ROLLO` path, which this recording does not use.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Time Cards | `View ▸ Time Cards` | **none — and none is needed** | `src/pages/processing/TimeCardsPage.ts` does **not** exist (only `TransferToJobCardsPage.ts` is in that folder). Verification is API-only: `GET /time-cards` already returns `traceabilityCode`. |
| Transfer to Job Cards | `View ▸ Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists — `applyDateRange` fixed for arbitrary days by B3; **not used by B4** |
| Employee ▸ Code History tab | `File ▸ Employee ▸ <employee> ▸ Code History` | — | not needed — `GET /employees/{id}/code-history` carries `B4-R6`/`B4-R7`/`B4-R9` |

## Data

Fixture values come from `src/data/journey-b/fixture.ts`. B4 uses the **sticker employees**
`6005` / `6006` (`B5 STICKER FIVE` / `B5 STICKER SIX`) so B1's time-in sweep never touches them,
per the run brief. Two employees is the minimum that proves `B4-R3`.

Roll codes must be **run-unique** — the `EmployeeCodeHistory` identity is
`(EmployeeCounter, AlternateCode, StartDateTime)` and there is no delete endpoint, so a fixed code
would either collide or accumulate silently. Derive them from `newRunPrefix()` in the shape the
recording shows (`B7` + digits), and record the sent value so the assertion compares like with like.

`DAY_OFFSET.B4 = -8` — already present in `src/data/journey-b/fixture.ts`.

## Preconditions

- [ ] Employees `6005` and `6006` exist (seeded by `seedOfficeFixture`).
- [ ] Ranch `4001`, field `4101`, job `4201`, crew `5001` exist (same fixture).
- [ ] `DEVICE_RELAY_FROM` / `DEVICE_RELAY_URL` / `DEVICE_RELAY_SERVER` set; run with
      `IMPORT_TRANSPORT=single-folder`.
- [ ] **N3** — Traceability - Stickers licensed on the dev client. Planner confirms before the
      spec is written; if it is off, `B4-R1`/`B4-R2` still hold (they are TimeCard fields, not
      grid fields) but N1 cannot be answered.

## Cleanup

| Entity | Removed by | Notes |
|---|---|---|
| Time In time cards | `cleanupCards()` (`src/utils/api/officeVerification.ts`) → `DELETE /time-cards/{id}` | Same as B1/B2/B3. |
| `EmployeeCodeHistory` row — device path | **nothing to remove** | N1 is resolved: the import never writes one. |
| `EmployeeCodeHistory` row — phase 2 | **n/a — phase 2 withheld** | The upsert is not idempotent in practice (see *Withheld*), so a fixed payload does **not** hold a single row. With no delete endpoint this would leak one row per run, which is why the phase is out of `B4-001`. |

No SQL. All cleanup goes through the app's API.

## Test cases

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `B4-001` | Deliver individual time-in records carrying sticker-roll codes, verify each roll is stored against its own employee, and that the import writes no code-history row. | `B4-R1`, `B4-R2`, `B4-R3`, `B4-R9` | `regression` + `demo=1` → `@Demo` | **1** |

`testName` stays `stickerRollAssignmentAtDayStart`; `category` flips `api` → `workflow`.

## Open questions for the tester

None outstanding — N1–N5 are closed in the table above, and both decisions the plan raised
were settled by the user this session:

- **Cleanup / `enabled`** → `enabled=1`. The device path writes no code-history row (`B4-R9`
  asserts it), so `cleanupCards()` removes everything `B4-001` creates.
- **Pack-house variation** → attempted as phase 2, then **withheld** when dev disproved the
  endpoint's idempotency. One open item remains for the tester: decide whether the
  `alreadyAssigned` behaviour is a code defect or a documentation defect (needs the handler source),
  then file the PET ticket and restore `B4-R6`–`B4-R8`.
