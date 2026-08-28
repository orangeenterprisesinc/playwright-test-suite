# `B5` · Sticker piece-out

> **Transport, not simulation — happy path plus the office-side negative.** As with B1–B4 the spec
> does not drive a device. It builds the `OrangeExportFile` envelope PET Pocket syncs, delivers it
> through the relay, imports it, and verifies the office side by id.
>
> **What the recording shows changes where the sticker rule lives.** The catalog says pieces
> "attribute to the employee by sticker prefix". They do — but the *device* does the attributing.
> On the `Piezas` screen a scan of `B7271530648` immediately prints `Montalvo Bonfil, Francisco E`
> (kf 15), and every imported row lands in the office with `Employee Selection: Sticker Code`
> (kf 105) — an exported `EmployeeSource`. What reaches the office is a `PieceOut` row that already
> carries its employee. The office's own sticker rule (WEBPET-1410, `EmployeeCodeHistory`) is the
> fallback for a sticker the office must map itself — that is **B7**, not B5. See *Planner evidence*.

Source: `docs/media/journey-b/b05-sticker-piece-out.mp4` (Jira WEBPET-1524 attachment 66883, 230.3 s,
1920×1032) → `.video-annotations/b05-sticker-piece-out/` — 162 keyframes, 81 action (20 force-sampled),
`Max gap 5.0s of 5.0s allowed`, not capped. The default run was **capped at 60 change points with
`Max gap 10.0s of 5.0s allowed`**; re-run once with `--max-frames 200` per the annotator's own remedy
table, which uncapped it and closed the gap. No other flag was changed.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `B5` |
| Jira | `PET-12643` (automation) / `WEBPET-1524` (manual) — [B5] Sticker piece-out |
| Recording | `docs/media/journey-b/b05-sticker-piece-out.mp4` |
| This plan | `test-plans/journey-b/b05-sticker-piece-out.md` |
| Spec | `tests/web/journey-b-field/b05-sticker-piece-out.spec.ts` |
| Runner rows | `src/data/runner/journey-b.csv` → `B5-001` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `B5` |
| Journey | `B` — Field harvest day (mobile field capture) |
| Segments | `grower\|perennial-grower\|pack-house` |
| Modules | `Piece Payment\|Traceability - Stickers` |
| Surface | `device` — spec lives in `tests/web/journey-b-field/`, runner category `workflow` (API + UI in one test, like B1–B4) |
| Demo candidate | yes — CSV `demo=1`, so the test also carries `@Demo` |
| Catalog status | draft |

**Summary** (from the catalog)
> The checker scans completed-case stickers to record each piece and attribute it to the employee by
> sticker prefix. Workers keep moving rather than queueing at the checker.

**Variations** (from the catalog)
> pack-house scans at the line; the device can show running counts by employee, field, or job.

## Catalog steps

| # | Catalog step | What the recording shows | Automatable? |
|---|---|---|---|
| 1 | The worker attaches the next sequential sticker to a finished case. | Nothing — physical, off-camera. | no — physical act, no system surface |
| 2 | The checker scans the case sticker. | Amy opens `PIEZAS` from the device main menu (kf 11, 63). The `Piezas` screen carries `Numero de Piezas` (prefilled `1`), `Cuadrilla de Trabajo` `254 RONALDO MEDRANO`, `Empleado` (blank), `Sticker` and `Memo` (kf 15–33); the header reads `08/10/2026` `2:27 PM`. Each scan prints the resolved owner at the foot — `Montalvo Bonfil, Francisco E` / `Last Scanned: B7271530648` (kf 15). Four scans, one per employee, using the four roll codes B4 assigned (kf 43, 89). | **yes, as transport** — the scan and the sticker-to-employee lookup are device-side; what reaches the office is a `PieceOut` row already carrying its employee |
| 3 | One piece records for the employee linked to that prefix, bounded by the default, minimum, and maximum pieces-per-scan preferences, with a confirmation tone. | Device list `PET Piezas Recs (4) Emps (4)` — each entry `08/10/2026 2:28 PM - 1 piece`, `Cuadrilla de Trabajo: 254 Ronaldo Medrano`, `Sticker: B72…` (kf 89). `DISPLAY` shows `BACK (TOTAL PIECES: 4)` over `Santos, David: 1`, `Barillas Ramirez,Balmore A: 1`, `Martinez ,Alejandro: 1`, `Montalvo Bonfil, Francisco E: 1` (kf 81). The bounds are enforced on the device: `6` → `Numero de Piezas exceeds maximum: 5.000000` (kf 37), `5.5` → the same (kf 49), `.50` → `Numero de Piezas less than minimum: 0.750000` (kf 55). Re-scanning a sticker already recorded → `Traceability code already used.` (kf 15, 21). | **yes** for the stored piece; **no** for the bounds dialogs, the tone, and the device totals |
| — | *Expected result: pieces attribute to the correct employee by sticker prefix; counts are viewable by employee, field, or job.* | Office `View ▸ Time Cards`, filtered `2026-08-10 – 2026-08-10` → **8 rows** (kf 105, 121, 137): B4's four `Time In` at `06:00` (`Employee Selection: Barcode Badge`, job `Grafting`) plus four rows typed **`Time Out`** at `14:27`/`14:28` carrying **`Pieces 1`** and **`Employee Selection: Sticker Code`**, each against the right employee. Opening one (kf 149, 159): `Reference 0000003-260810-PO-S34-ui`, `Traceability B7281920556`, `Employee Santos, David`, `Pieces 1`, `Work Crew 254 Ronaldo Medrano`, **`Job` / `Ranch` / `Field` empty**, `GPS Reading (36.8076857, -119.8348202)`, `Transferred No`, `Unedited Yes`, `No questions recorded.` Exceptions panel: `8 issues` — four `JobCounter is required … TimeCard`, four `No corresponding … Out (without Job) found`. | **yes** by employee; **no** by field or job — those columns are empty on the recorded rows, and the catalog's own variations line places running counts on the **device** |

Piece codes captured, one per employee (kf 89, 149, 159) — the same roll codes B4 assigned:

| Employee | Sticker scanned |
|---|---|
| Montalvo Bonfil, Francisco E | `B7271530648` |
| Barillas Ramirez, Balmore A | `B7288520643` |
| Santos, David | `B7281920556` |
| Martinez, Alejandro | `B7282120254` |

The office's Piece Out preference panel is on screen throughout (`/setup/scan-devices/37` → Piece Out):
`Default Pieces 1.00000`, `Maximum Pieces In Piece Out 5.000000000000`, `Duplicate Range (minutes) 2`,
`Create Time In From Piece Out — (Global: No)`, `Allow Multiple Piece Outs In Duplicate Range —
(Global: No)`, `Lock Number Of Pieces No`, `Piece Out Display After Save — (Global: Pallet Count)`.
The bounds step 3 names are configured **office-side** here and enforced **device-side**.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `B5-R1` | Where the Piece Payment and Traceability - Stickers modules are licensed, when a device export containing piece-out records that carry an employee, a sticker employee-source and a traceability code is imported, PET Tiger shall create one piece time card per reference bearing that employee's id. | `B5-001` |
| `B5-R2` | Where the Traceability - Stickers module is licensed, when such a record is imported, PET Tiger shall store the scanned sticker code as that time card's traceability code. | `B5-001` |
| `B5-R3` | When such a record is imported, PET Tiger shall record its number of pieces as the time card's Pieces value. | `B5-001` |
| `B5-R4` | When one export carries several piece-out records for the same employee, PET Tiger shall total their pieces to the number of stickers scanned for that employee. | `B5-001` |
| `B5-R5` | When a piece-out record is imported, PET Tiger shall key it by a reference whose part is `PO` and shall report it as a time-out-typed card carrying a Pieces value. | `B5-001` |
| `B5-R6` | If a piece-out record's employee value resolves to no employee, then PET Tiger shall attribute the card to the configured Undefined Employee. | `B5-001` |
| `B5-R7` | When a piece-out record carries no job, PET Tiger shall import the card and shall raise its missing-job exception against it. | `B5-001` |
| `B5-R8` | If a piece count above the device's Maximum Pieces preference is entered, then PET Tiger shall reject it with `Numero de Piezas exceeds maximum: 5.000000`. | — not automatable: device-side, enforced in the Piezas activity; the rejected value never reaches an envelope (kf 37, 49) |
| `B5-R9` | If a piece count below the device's Minimum Pieces preference is entered, then PET Tiger shall reject it with `Numero de Piezas less than minimum: 0.750000`. | — not automatable: device-side, same reason (kf 55) |
| `B5-R10` | If a sticker already recorded is scanned again, then PET Tiger shall reject the scan with `Traceability code already used.` | — not automatable: device-side de-duplication; the rejected scan never reaches an envelope (kf 15, 21) |
| `B5-R11` | PET Tiger shall play a confirmation tone when a piece is recorded. | — not automatable: device audio, no office surface |
| `B5-R12` | PET Tiger shall show running piece totals by employee on the device's Display screen. | — not automatable: device-side; the catalog's variations line places running counts on the device (kf 81) |

No rejection criteria are invented. Every row cites a keyframe or an importer source; the pack-house
variation is the same device flow with no distinct system surface in the recording, so it is recorded
under *Not automatable* rather than guessed at.

`B5-R1`'s `Where` clause names both catalog modules, matching the `modules` column on `B5-001` — that
pairing is what `src/config/scope.ts` filters a per-customer run on. It scopes the requirement to
customers licensing both; it is **not** a runtime precondition for the assertions. Dev currently
reports `PiecePayment=false` (PET-12689) while still storing pieces and resolving employees, which is
why `B5-001` verifies the behaviour there today. See **N6**.

## Planner evidence — the importer, read before the spec

Read-only `gh api` fetches against `orangeenterprisesinc/web-pet`, so the Planner does not repeat them.
These decide the envelope shape and retire the run brief's employee-less `PieceOut` assumption.

* **`importmap/employee_fk_ladder.go:13-60,172-190` — rung 0.** An empty `<Employee>` value reaches
  *no* rung: "not rung 8, not any … Undefined Employee". An employee-less piece row binds
  `EmployeeCounter` NULL — neither the roll owner nor the Undefined Employee.
* **`importmap/timecard_rules.go:1620-1700` — the WEBPET-1410 sticker rule** is rung 8's left arm,
  gated on six conjuncts: FK unresolved · non-empty `<Employee>` · `LookupContents` resolving Employee
  by `Code` · node `PieceOut`/`PieceOutWithTimeIn` (not the Crew aliases) · non-empty
  `<TraceabilityCode>` · a non-empty extracted alternate code.
* **`timecard_rules.go:1777-1830`** — that rule keys `EmployeeCodeHistory.AlternateCode` on **the
  file's `<Employee>` value**, not on the code extracted from the sticker (flagged in-source as a
  correction to the ticket), windowed `StartDateTime BETWEEN startOfDay(pieceOut) AND pieceOut`
  (`:1746-1775`).
* **`timecard_rules.go:178-200,1516-1550`** — the extraction depends on the client preferences
  `RunTrackAlternateCodeLength` (nullable; null means it never fires), `RunTrackAlternateCodePrefix`,
  `RunTrackingEmpCodeStartLoc`, `RunTrackingRollCodeStartLoc`.
* **`employee_fk_ladder.go:326-360` — rung 8's right arm** (`AssignUndefinedEmployee`) is gated only on
  an unresolved FK, a non-empty value and a `Code` lookup — *not* on the sticker conjuncts. It binds
  nothing when the Undefined Employee preference is 0 or absent. This is what carries `B5-R6`.
* **B4-R9** already proved that importing a Time In carrying a roll code writes **no**
  `EmployeeCodeHistory` row, and `POST /scan/assign-barcode-roll` writes `StartDateTime = NULL`, which
  the window above can never match. `/employees/{id}/code-history` is GET-only and `openapi.yaml`
  exposes no `deleteCodeHistory`.

**Verdict: B4 Outcome A, device-resolved.** B5 exercises rung 1 — the device sends the employee it has
already resolved. No `EmployeeCodeHistory` seeding, and therefore no permanent residue. The office-side
code-history path belongs to B7.

## Not established by the recording

| # | Question | Why it matters |
|---|---|---|
| N1 | The exact wire value of the sticker `EmployeeSource` — `Sticker Code` is the office *column* rendering. Confirm from AndroidPET `sync/TimeCardExport.java`, `common/TraceabilityCode.java`, `editrecord/PieceOutActivity.java`. | Decides a new `DEVICE_SCHEMA.employeeSource` entry; today only `Crew` and `BarcodeBadge` exist. |
| N2 | Does the office accept the exported `<Employee>` on rung 1, or re-resolve through code history? | Confirms B5 needs no seeding. If it re-resolves, B5 inherits the `StartDateTime` problem and becomes an annotated environment gate rather than a green test. |
| N3 | The Undefined Employee preference on the dev client and that employee's id (`GET /employees`, once). | `B5-R6` asserts id equality; an unset preference leaves `EmployeeCounter` NULL, and the assertion must say so rather than accept any non-null id. |
| N4 | Does importing a piece-out for an employee with no time-in that day synthesize one (WEBPET-1409)? The recorded employees already had B4's Time In, so it never fired. | Decides whether cleanup must sweep synthesized Time-Ins as well as piece cards. |
| N5 | The exact exception text and API surface for the missing-job issue (`JobCounter is required …`, kf 105). | `B5-R7` asserts it; the wording must come from dev, not from a keyframe crop. |
| N6 | Which modules does B5 actually depend on, and are they licensed on dev? | A module that gates the assertions is a precondition; one that gates a neighbouring feature is not. Either way the state is named in an annotation, never silently skipped. |

### Planner resolution (2026-08-26 — AndroidPET source, importer spec, dev staging GETs + one blocked UI probe)

| # | Resolution | Evidence |
|---|---|---|
| N1 | **`AlternateCode`** (`AlternateCodeWithScale` when a scale is present). New entry `DEVICE_SCHEMA.employeeSource.alternateCode`. The office stores enum **6** and renders `employeeSourceText` **"Sticker Code"**. | AndroidPET `editrecord/PieceOutActivity.java:183` → `record/RecordBase.java:435-436,452-453` → `conf/Enums/EmployeeScanSourceOptions.java:9`; exported verbatim by `sync/TimeCardExport.java:221`; deployed SPA enum `{…6:"Sticker Code"…13:"Crew"}`; a live Crew card reads `employeeSource:13`/`"Crew"`. No `StickerCode` literal exists device-side. |
| N2 | **Rung 1 accepts it — B5 is a green test, not a gate.** `<Employee>` carries the employee *Code*, resolved by the declared `Employee:Code` lookup; rung 8's sticker arm only fires on an unresolved FK. No code-history read, no seeding, no residue. | The plan's own importer evidence; kf 105 (four correct employees with no history rows — B4-R9); B3/B4 green on the identical path. |
| N3 | Preference **set**: `undefinedEmployee = 4`, `undefinedEmployeeName` "Undefined Employee"; employee id 4 is inactive and its comment documents exactly this fallback. `B5-R6` asserts `employeeCounter === prefs.undefinedEmployee`. Employee `6006` → id **587** (`6005` → 586). | `GET /preferences`, `GET /employees` (dev, 2026-08-26). |
| N4 | **No synthesis on dev** — `timeInCardCreationMethod:"User"`, `fixedTimeForTimeInFromPieceOut:null`, and the recording's own Piece Out panel shows `Create Time In From Piece Out — (Global: No)`. B5 sends the Time In first regardless. The sweep still covers cardTypes `[1,0]` so a later preference flip cannot orphan a synthesized card. | `GET /preferences`; kf 0/15 panel; the WEBPET-1409 PostSave hook in the importer spec. |
| N5 | Surface: **`POST /transfer-to-job-cards/analyze`** — it feeds both the Transfer screen and the Time Cards Exceptions panel. Full literal now pinned from a dev run: `{"code":"block.fk_missing","severity":"block","message":"JobCounter is required on a piece-out TimeCard","sourceTimeCardCounter":…,"employeeCounter":…,"date":…,"errorParams":{"field":"JobCounter","reason":"piece-out"}}`. **The payload identifies cards by `sourceTimeCardCounter`, not by `Reference`** — so `B5-R7` joins on the `timeCardCounter` values this run's import produced and requires **every** piece card to be flagged, not merely one. | Dev run 2026-08-28, attached as `transfer-to-job-cards-analyze-B5.json`; kf 105 clips the same text to "JobCounter is required … TimeCard". |
| N6 | `GET /session/me` reports `PiecePayment=false`, `LabelTraceability=true`, `Traceability=true`. **The two are gated differently, because they gate different things.** *Traceability - Stickers* is a hard precondition — without it the importer has no sticker path and `B5-R2` would be vacuous, so the spec asserts it. *Piece Payment* gates piece **payment**, not piece **capture**: the importer stores `NumOfPieces` and resolves the employee with it off, which is all `B5-R1`–`B5-R7` assert. It reads false on dev only because the API resolves modules from the `PT_MODULES` env var and never queries TigerMaster — where Piece Payment (moduleId 36) **is** licensed for client 1. The spec therefore **records it in an `environment-gate` annotation naming PET-12689 and asserts against the API regardless** — named, never silently skipped. Under EARS, `Where <module> is licensed` scopes a requirement rather than failing it. | `GET /session/me` 2026-08-26; `GET /api/admin/tm/clients/1/modules` → `{"moduleId":36,"name":"Piece Payment"}`; leftover PO card 346 (`0000001-260811-PO-DFLT-ui`) stores `numOfPieces:12` unlicensed; **PET-12689** (Cloud Infra) — `PT_MODULES` in `services/tigerden/ecs.tf` omits 8 keys and blocks 26 catalog workflows. |

**Structure note for the Generator.** `deliverAndVerifyCards` / `verifyImportInOffice` assume a single
`cardType` and one reference per expected card; B5-001 composes `importDeviceExport` +
`findByReferences` (cardType 1, then 0) + `sweepFixtureCards([587, 4], day, [0,1])` + `cleanupCards`
directly — all existing exports, no new util. An imported `PieceOut` is **cardType 0**; the grid's Type
column is what rendered it "Time Out" in the recording. Dev's `serviceImportInterval` is now 1 minute.
`/setup/scan-devices/37` is 404 today (the device row is gone) — do not reference it.

**Envelope `B5-001` builds** (one envelope, `punchDay(DAY_OFFSET.B5)`, `prefix = newRunPrefix()`):

| # | Node / part | Time | Employee | Elements |
|---|---|---|---|---|
| 1 | `TimeCard` / `TI` | 06:00 | `6006` | crew `5001`, ranch `4001`, field `4101`, job `4201`, `employeeSource` `BarcodeBadge` — the seeding Time In, mirroring the recorded day |
| 2 | `PieceOut` / `PO` | 14:27 | `6006` | crew `5001`, **no** job/ranch/field, `pieces` 1, `traceabilityCode` stickerA, `employeeSource` `AlternateCode` |
| 3 | `PieceOut` / `PO` | 14:28 | `6006` | same shape, `pieces` 1, stickerB — gives `B5-R4` its total of 2 |
| 4 | `PieceOut` / `PO` | 14:28 | `9999999` (resolves to nothing) | crew `5001`, no job, `pieces` 1, stickerC, `employeeSource` `AlternateCode` — `B5-R6`; anonymous-worker rungs are off on dev, so rung 7 cannot intercept it |

**Office assertions.** `GET /time-cards` cardType 1 → the TI card's employee/crew/ranch/field/job
counters and `programCreated`; cardType 0 → per reference `employeeCounter` (587, 587, 4),
`numOfPieces` 1 (sum 2 for `6006`), `traceabilityCode` verbatim, `jobCounter` null, `cardType` 0,
`employeeSourceText` "Sticker Code", `programCreated` true; `POST /transfer-to-job-cards/analyze` →
an issue matching `/^JobCounter is required/`.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Time Cards | `View ▸ Time Cards` | **none — and none is needed** | `src/pages/processing/TimeCardsPage.ts` does not exist. Verification is API-only: `GET /time-cards` returns `employeeCounter`, the pieces value and `traceabilityCode`. |
| Transfer to Job Cards | `View ▸ Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists — **not used by B5**; the recorded piece rows carry no job, so the screen shows nothing meaningful for them |

## Data

Fixture values come from `src/data/journey-b/fixture.ts`. B5 uses the **sticker employee `6006`**
(`B5 STICKER SIX`) as the roll owner, per the run brief, so its rows never collide with B6 (`6005`) or
B1's time-in sweep. `DAY_OFFSET.B5 = -7` is already present.

Sticker codes must be **run-unique** — the device rejects a re-scanned traceability code (`B5-R10`) and
the office keys cards by Reference, so a fixed sticker would blur one run's rows into the next. Derive
them from `newRunPrefix()` in the shape the recording shows (`B7` plus digits), and record the sent
value so the assertion compares like with like.

## Preconditions

- [ ] Employee `6006`, ranch `4001`, field `4101`, job `4201`, crew `5001` exist (seeded by
      `seedOfficeFixture`).
- [ ] `DEVICE_RELAY_FROM` / `DEVICE_RELAY_URL` / `DEVICE_RELAY_SERVER` set; run with
      `IMPORT_TRANSPORT=single-folder`.
- [ ] **N6** — **Traceability - Stickers** licensed on the dev client (it is): the spec asserts it,
      because without it `B5-R2` has nothing to assert. **Piece Payment** is *not* a precondition —
      it gates piece payment, not piece capture — so the spec records its state in an
      `environment-gate` annotation naming PET-12689 and asserts against the API either way.

## Cleanup

| Entity | Removed by | Notes |
|---|---|---|
| Piece time cards | `cleanupCards()` (`src/utils/api/officeVerification.ts`) → `DELETE /time-cards/{id}` | Same as B1–B4. |
| The seeding Time In | `cleanupCards()` | Sent in the same envelope, swept with the rest. |
| Synthesized Time-In (WEBPET-1409) | `cleanupCards()`, pending **N4** | If the importer synthesizes one, the sweep must cover its card type too. |
| `EmployeeCodeHistory` | **nothing to remove** | B5 writes none — the link is device-side. |

No SQL. All cleanup goes through the app's API.

## Test cases

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `B5-001` | Deliver sticker piece-out records, verify each piece attributes to its sticker's owner with the code stored verbatim, that the pieces total, and that an unresolvable sticker falls to the Undefined Employee. | `B5-R1`, `B5-R2`, `B5-R3`, `B5-R4`, `B5-R5`, `B5-R6`, `B5-R7` | `regression` + `demo=1` → `@Demo` | **1** |

`testName` stays `stickerPieceOut`; `category` flips `api` → `workflow`.

## Open questions for the tester

- [ ] **N2** decides whether `B5-001` is a green test or an annotated environment gate. The Planner
      settles it against dev before the spec is written.
- [ ] The catalog promises counts "by employee, field, or job". The recording shows them by employee
      on the device only, and the imported rows carry no field or job. If an office grouping surface
      exists (`View ▸ Pieces`), it is a candidate for a second case — not asserted here on the strength
      of a menu item alone.
