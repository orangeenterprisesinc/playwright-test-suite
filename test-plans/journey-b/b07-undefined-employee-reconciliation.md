# `B7` · Undefined-employee reconciliation

> **Transport, not simulation — and the one workflow where the OFFICE does the attributing.**
> As with B1–B6 the spec does not drive a device. It builds the `OrangeExportFile` envelope PET
> Pocket syncs, delivers it through the relay, imports it, and verifies the office side by id.
>
> **B5's plan parked this here, and the recording confirms the split.** In B5 the *device* resolves
> the sticker to its owner and exports an employee, so the office does nothing clever (importer rung
> 1). In B7 the scanning device has **no roll assignment**, so it exports the *sticker prefix itself*
> in `<Employee>` and the office resolves it against `EmployeeCodeHistory`. That is the WEBPET-1410
> rule, and B7 is the only workflow that exercises it.

Source: `docs/media/journey-b/b07-undefined-employee-reconciliation.mp4` (Jira WEBPET-1526 attachment
66916, 463.3 s, 1920×1080) → `.video-annotations/b07-undefined-employee-reconciliation/` — 386
keyframes, 193 action (34 force-sampled), `Max gap 5.0s of 5.0s allowed`, not capped. The default run
was **capped at 60 change points with `Max gap 16.2s of 5.0s allowed`**; re-run once with
`--max-frames 200` per the annotator's own remedy table, which uncapped it and closed the gap. No
other flag was changed.

**Reading coverage.** The recording is a three-pane screen share: the office web app (left, Chrome on
`https://192.168.1.74`, signed in as `Su`), a **Galaxy S20+ 5G running `PET (26.01.22) -
DeviceDup31@je…`** (middle — **device B**, reference prefix `D31`), and a Zoom share of an **RS35
handheld running `PET (26.01.22) - Device31@jen…`** (right — **device A**, reference prefix `S31`).
Every frame cited below names which pane it is read from. This is a **local LAN instance**, not dev
staging: values read off it are the *product's* behaviour; ids and names are that instance's own.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `B7` |
| Jira | `PET-12645` (automation) / `WEBPET-1526` (manual) — [B7] Undefined-employee reconciliation |
| Recording | `docs/media/journey-b/b07-undefined-employee-reconciliation.mp4` |
| Screenshots | WEBPET-1526 attachments `66917`, `66918` — office `Edit Time Out` panels |
| This plan | `test-plans/journey-b/b07-undefined-employee-reconciliation.md` |
| Spec | `tests/web/journey-b-field/b07-undefined-employee-reconciliation.spec.ts` |
| Runner rows | `src/data/runner/journey-b.csv` → `B7-001` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `B7` |
| Journey | `B` — Field harvest day (mobile field capture) |
| Segments | `grower\|perennial-grower\|pack-house` |
| Modules | `Traceability - Stickers\|Piece Payment` |
| Surface | `device` — spec lives in `tests/web/journey-b-field/`, runner category `workflow` |
| Demo candidate | no — CSV `demo=0`, so **no** `@Demo` tag |
| Catalog status | draft |

**Summary** (from the catalog)
> Stickers scanned on a different device than the one that assigned them record as undefined, then
> attribute to the employee by sticker prefix at sync. Records still undefined after sync need manual
> office correction.

**Variations** (from the catalog)
> none

## Catalog steps

| # | Catalog step | What the recording shows | Automatable? |
|---|---|---|---|
| — | *Precondition: sticker rolls assigned on device A.* | **Device A (RS35, right pane).** Amy works in **`PET - Tiempo de Entrada`** — not the `ASIGNAR ROLLO` tile, which is on the menu (kf 0) but never opened. Header set once: Rancho `AVI-COA-DATES`, Campo `ANTHONY 3 - BARHI`, Trabajo `HARVESTING - COACHELLA`, Cuadrilla `319-25`, `08/12/2026` `6:30 AM` (kf 22–48). She fills **`First Roll Code`** `B7288570926`, then `Empleado` (kf 58). Device list `PET Time In Recs (3) Emps (3)` (kf 68): **Ayon Corrales,Joel** carries `First Roll Code: B7288570926`; **Ayon Corrales,Selene** and **Ayon Gamboa,Melchor** carry **none**. | **yes, as transport** — the assignment leaves the device as a nested `EmployeeCodeHistory` grid (see *Planner evidence*) |
| 1 | A second checker scans case stickers with no employee context (recorded as undefined). | **Device B (Galaxy S20+, middle pane).** `PET - Piezas - New`, `08/12/2026`, `Numero de Piezas` prefilled `1`, **`Cuadrilla de Trabajo` blank, `Empleado` blank, `Sticker` blank** (kf 218) — device B holds no roll assignment, so nothing resolves locally. Each scan displays the extracted **7-char prefix** large on screen: `B728434` / `Last Scanned:B7284340277` (kf 240), `B728857` / `Last Scanned:B7288570930` (kf 272). The save toast is **`Saved record. Record saved for B728857`** (kf 272) — the *prefix*, where B5/B6 show an employee name. | **yes** for the exported row; **no** for the device-local display and toast |
| 2 | On sync, the server matches each sticker prefix to that day's assignment. | **Office (left pane).** Device A's 3 Time Ins land first — Transfer to Job Cards `3 records · 3 Time Cards · 3 Employees · 0 Pieces` (kf 128); then its 6 pieces, `9 records · 9 Time Cards · 3 Employees · 6 Pieces` (kf 152). After device B syncs, `View ▸ Time Cards` filtered `2026-08-12 – 2026-08-12` shows **16 rows** (kf 350, 384) — table below. | **yes** — by employee id on `GET /time-cards` |
| 3 | Pieces attribute to the right employee; any still-undefined records are flagged for the office. | Device B's rows split: `0000010/11/12-260812-PO-D31-ui` → **`Joel Ayon Corrales`**; `0000007/08/09-260812-PO-D31-ui` and `0000013-…` → **`Undefined Employ…`** (kf 350). Opening an undefined one (kf 370) gives `Edit Time Out`: the Employee dropdown reads **`Undefined Employee`** with the required-field highlight — that *is* the correction affordance — and the **Memo** carries the reason — `Assigning to Undefined Employee - Missing Code: B728434` (attachment 66917). | **yes** — employee id equality plus the memo literal |

**The 16 rows on 2026-08-12** (kf 350, 384) — `S31` = device A, `D31` = device B:

| Reference | Time | Type | Employee | Employee Selection |
|---|---|---|---|---|
| `0000004/05/06-260812-TI-S31-ui` | 06:30 | Time In | Joel / Selene / Melchor | `Barcode Badge` |
| `0000007…0012-260812-PO-S31-ui` | 12:14 | Time Out | *(blank, pink "Records with missing val")* | `Sticker Code` |
| `0000007/08/09-260812-PO-D31-ui` | 12:16–12:17 | Time Out | **Undefined Employ…** | `Sticker Code` |
| `0000010/11/12-260812-PO-D31-ui` | 12:17–12:18 | Time Out | **Joel Ayon Corrales** | `Sticker Code` |
| `0000013-260812-PO-D31-ui` | 12:18 | Time Out | **Undefined Employ…** | `Sticker Code` |

**The undefined rows are flagged in the Memo — not in a Transfer issue group:**
`Assigning to Undefined Employee - Missing Code: B728434` (attachment 66917,
`0000018-…-PO-D31-ui`, Traceability `B7284340297`).

*Recorded context, not a requirement.* The recording also happens to show a second route to the same
fallback — `Duplicate Use of Traceability Code` naming the other record — when device B rescans a
sticker device A already used (kf 370, `0000013-…-PO-D31-ui`, Traceability `B7288570930`, other
record `0000010-260812-PO-S31-ui`). B7 automates the workflow's single path, so that edge case is
noted here and not carried as an acceptance criterion.

The extraction arithmetic is corroborated twice: `B7288570926 → B728857` and `B7284340277 → B728434`
— the first 7 characters, i.e. `RunTrackingEmpCodeStartLoc = 1`, `RunTrackingRollCodeStartLoc = 8` on
the recorded instance.

**Context the recording shows but this spec does not assert.** Device A's own six piece-outs
(`PO-S31`) reach the office carrying Joel, then a **crew distribution** blanks them — attachment
66918 and kf 332 read `Employee Ayon Corrales,Joel removed, Distributed to entire Crew`, and the
Transfer screen offers `Crew piece-out tc=… Fix` (kf 152, 218). That is the crew-piece-out
distribution flow (**B8**), not B7, and it is why those rows show an empty Employee in the final grid.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `B7-R1` | Where the Traceability - Stickers module is licensed, when a device export carrying an employee code-history assignment grid is imported, PET Tiger shall record the roll's extracted prefix as that employee's code-history alternate code. | `B7-001` |
| `B7-R2` | Where the Traceability - Stickers and Piece Payment modules are licensed, when a piece-out record whose employee value is a sticker prefix matching a same-day code-history assignment is imported, PET Tiger shall attribute the resulting time card to that assignment's employee. | `B7-001` |
| `B7-R3` | If a piece-out record's sticker prefix matches no code-history assignment for that day, then PET Tiger shall attribute the resulting time card to the configured Undefined Employee. | `B7-001` |
| `B7-R4` | If a piece-out record is attributed to the Undefined Employee for want of an assignment, then PET Tiger shall record on that card's memo `Assigning to Undefined Employee - Missing Code: <prefix>`. | `B7-001` |
| `B7-R5` | When a piece-out record declares an alternate-code employee source, PET Tiger shall report the card's Employee Selection as `Sticker Code`. | `B7-001` |
| `B7-R6` | When such a record is imported, PET Tiger shall store the full scanned sticker as the card's traceability code and its number of pieces as the card's Pieces value. | `B7-001` |
| `B7-R7` | When such a record is imported, PET Tiger shall key the card by the device's own reference, whose part is `PO`, and shall store it as a time-out-typed card. | `B7-001` |
| `B7-R8` | PET Tiger shall reconcile the sticker prefix at import rather than on the scanning device — a device holding no roll assignment shall export the extracted prefix as the record's employee value. | `B7-001` |
| `B7-R9` | While the Piezas screen is open on a device holding no assignment, PET Tiger shall display the extracted prefix and shall confirm the save with `Record saved for <prefix>`. | — not automatable: device-side; the display never reaches an envelope (kf 240, 272) |
| `B7-R10` | PET Tiger shall play a confirmation tone when a piece is recorded. | — not automatable: device audio, no office surface |
| `B7-R11` | Where two checker devices are in use, PET Tiger shall keep each device's reference sequence distinct by device prefix. | — not automatable via one envelope: needs a second physical device; observed as `S31` vs `D31` (kf 350) |

Nothing here is invented: every row cites a keyframe, an attachment or a named source line. The
office-side sticker rule is B7's alone — B4 stores the roll, B5 exercises the device-resolved path.

**Scope.** B7 covers the single path Amy's recording walks, as B1–B6 do: one assignment, one matched
prefix, one unmatched prefix. `B7-R3`/`B7-R4` are not a negative case — the catalog's own step 3 makes
the still-undefined record part of the workflow. Deliberately **not** carried as requirements: the
duplicate-traceability fallback and the crew-distribution flow (**B8**), both noted above as recorded
context.

## Planner evidence — read before the spec

Read-only `gh api` fetches against `orangeenterprisesinc/web-pet` and `…/AndroidPET`, so the Planner
does not repeat them.

### Device side — what actually leaves device A (this corrects the B4 plan)

* **`editrecord/TimeInActivity.java:1786-1789`** — after the TimeCard row is saved:
  `if (mPrefs.labelTraceabilityModuleExist() && !traceabilityCode.isEmpty()) createCodeHistoryRecordAndUpdateEmployee(...)`.
* **`TimeInActivity.java:1962-1989`** builds a `RecordTypes.EMP_CODE_HISTORY` record with
  `ScannedCode` = the full sticker, `FirstCode` = `tc.getFirstCode()` (the suffix), `AlternateCode` =
  `tc.getContainerCode()` (**the prefix**), and **`StartDateTime` = the Time In's own date/time**.
  Guarded on `tc.getContainerCode().length() > 0`.
* **`sync/TimeCardExport.java:105-107, 336-372`** serializes it as
  `<Employee_Records LookupContents="Employee:Code"><Employee><Code>…</Code><EmployeeCodeHistory_Records LookupContents="AddOnlyGrid"><EmployeeCodeHistory>`,
  one element per column minus `parent_id`/`ExportTime`/`Employee` — i.e. **Author, DateIn, TimeIn,
  StartDateTime, ScannedCode, AlternateCode, FirstCode, Reference, UpdateTime**.
* **`record/EmployeeCodeHistoryRecord.java:17-36`** — `PartID = "CH"`; only `ScannedCode` is required.
* **`common/TraceabilityCode.java:146-156`** —
  `getAlternateCode = code[empStartLoc-1 .. seqStartLoc-2]`, `getFirstCode = code[seqStartLoc-1 ..]`;
  returns `""` unless `1 <= empStartLoc < seqStartLoc`.
* **`editrecord/PieceOutActivity.java:351-370`** — the load-bearing one for B7: when the local
  `Employee_Records` lookup on `AlternateCode` **misses**, `empName` and `empCode` both default to
  `alterCode`, so the exported `<Employee>` carries the **prefix** — not empty, not the full sticker.
  `:176-186` → `record/RecordBase.java:434-437` sets `EmployeeSource = AlternateCode` regardless of
  whether the match succeeded.

> **Correction to the B4 plan.** B4's N1 concluded that importing a Time In carrying a roll code
> writes no `EmployeeCodeHistory` row. That is true of the **flat envelope `B4-001` builds**, which
> never sends the nested grid — it is *not* true of the real device, which sends both. `B4-R9` still
> stands as written (it asserts about B4-001's own envelope); the B4 plan's inference that later
> piece-outs resolve "through the TimeIn traceability code itself" is superseded by the grid.

### Office side — the rule that reconciles

* **`importmap/employee_code_history.go:14-27, 79-101`** — accepts exactly that nested shape; columns
  `AlternateCode` NOT NULL, `FirstCode` NOT NULL, `StartDateTime` nullable, `CodeType` NOT NULL
  (absent → `0` Sticker Roll). Identity `(EmployeeCounter, AlternateCode, StartDateTime)`; gated on
  module `LABELTRACEABILITY` (fail-open when the licence is unknown).
* **`nested_grids.go:276-280, 365-431`** — `AddOnlyGrid` is **idempotent by identity**: a re-import of
  an identical row is a no-op UPDATE, never a second insert.
* **`importmap/employee_fk_ladder.go:262-295`** — **rungs 4/5**: gated on the sticker predicate **and**
  `RunTrackingAssignRollsDaily` (default `false`). **`:509-533`** — the predicate is *exact equality*:
  `stickerAlternateCode(traceCode, prefs) == a.Value`.
* **`importmap/timecard_rules.go:1640-1701`** — **rung 8-left**, the WEBPET-1410 rule, six conjuncts,
  **not** gated on AssignRollsDaily. So at dev's default the row falls through to rung 8-left with
  `limitToLatest = true`; either rung produces the same attribution, so the spec asserts the outcome,
  not the rung.
* **`timecard_rules.go:1787-1798`** — the join: `EmployeeCodeHistory h … WHERE h.AlternateCode = @alt`
  **`AND h.StartDateTime BETWEEN @afterDate AND @beforeTime`**, i.e. `startOfDay(pieceOut) .. pieceOut`.
  The lookup key is the file's `<Employee>` value (`:1650-1653`), not the extracted code (`:1672`).
* **`employee_fk_ladder.go:420-441` / `timecard_rules.go:1838-1852`** — the Undefined-Employee rung
  binds preference **`RunTrackingUndefinedEmp`** and appends the memo line
  `"Assigning to Undefined Employee - Missing " + col + ": " + valueFromFile`. A preference of 0 or an
  absent row binds **nothing** (EmployeeCounter stays NULL).
* **`timecard_rules.go:1534-1550, 1441-1446`** — `stickerAlternateCode` returns `""` when
  `RunTrackingEmpCodeStartLoc` and `RunTrackingRollCodeStartLoc` are at their **registry defaults of
  0**, which fails conjunct (f) and makes the whole rule inert. See **N1** — this is B7's gate.
* **No transfer exception exists for an Undefined-Employee card.** `input/compute/transfer/validate.go`
  contains no `Undefined` literal; its only employee-identity issue is `BlockFKMissing`
  (`"EmployeeCounter is required on a transferable TimeCard"`, `:203-207`) and that fires on a **NULL**
  employee, a different case. The office's remediation actions are
  `POST /admin/time-cards/assign-employee-to-undefined-piece-outs` (`{updated}`) and
  `POST /admin/time-cards/set-crew-from-traceability` (`{from,to}` → `{updated,notFound}`), both gated
  on `preferences.update` + `LabelTraceability`.

**`POST /scan/assign-barcode-roll` is unusable for B7.** B4 proved it writes `StartDateTime = NULL`,
and `BETWEEN` never matches NULL, so a roll assigned through that endpoint can never satisfy the
window. The nested grid is the only seeding path that sets `StartDateTime`.

## Not established by the recording

The recording is a LAN instance with the label-tracking preferences configured. Dev staging is not.

| # | Question | Why it matters |
|---|---|---|
| N1 | Dev's `RunTrackingEmpCodeStartLoc`, `RunTrackingRollCodeStartLoc`, `RunTrackingBarcodeLen`, `RunTrackAlternateCodeLength`, `RunTrackAlternateCodePrefix`, `RunTrackingAssignRollsDaily`. | **The gate.** At the registry defaults (`0`, `0`, nil) the office extracts `""` and `B7-R2`/`B7-R3` cannot fire at all. `PUT /preferences` can write all of them (`employeeCodeStartLocation`, `rollCodeStartLocation`, `assignRollsDaily`, …) — but per the run decision the spec **reads and gates**, never writes. Note `assignRollsDaily` false→true additionally **clears `AlternateCode` on every Employee row** and needs `confirmClearAlternateCodes: true`; the spec must never send it. |
| N2 | Dev's `RunTrackingUndefinedEmp` value. B5 found `undefinedEmployee = 4` ("Undefined Employee", inactive). | `B7-R3` asserts id equality; a preference of 0 leaves `EmployeeCounter` NULL and the assertion must say so rather than accept any non-null id. Read-only — there is no field for it on `UpdatePreferencesRequest`. |
| N3 | Is `PiecePayment` in `PT_MODULES` on the dev API task? B6 proved it is **not**, and that no `/admin/tm` change can alter it. `LabelTraceability` **is** on (B5). | Per the run decision B7 asserts **both**, consistent with B5-001/B6-001 — so B7-001 is expected red on this gate until DevOps updates `PT_MODULES`. |
| N4 | Does the grid import also write `Employee.AlternateCode` office-side? The device does (`updateEmployeeAlterCodeAndPieceOut`), but the exported grid carries only `<Code>` under `<Employee>`. | Decides whether rung 3 (`Employee.AlternateCode`) short-circuits ahead of rungs 4/8. The **outcome is identical**, so no assertion changes — but if rung 3 fires, B7 would not actually be exercising the code-history rule, which is the point of the workflow. Planner confirms with `GET /employees/{id}` before and after. |
| N5 | Code-history residue policy — see *Cleanup*. `EmployeeCodeHistory` has **no DELETE** anywhere in `openapi.yaml`. | With a fixed `AlternateCode` and `StartDateTime` on `punchDay(DAY_OFFSET.B7)`, the identity changes daily, so the suite leaves **one undeletable row per calendar day it runs**. Pinning B7 to a fixed date instead would hold it at exactly one row forever. Decision needed before the gate opens. |

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Time Cards | `View ▸ Time Cards` | **none — and none is needed** | `src/pages/processing/TimeCardsPage.ts` does not exist. `GET /time-cards` returns `employeeCounter`, `traceabilityCode`, `numOfPieces`, `memo` and `employeeSourceText` — every value `B7-R2`–`B7-R8` asserts. |
| Employee ▸ Code History | `File ▸ Employee ▸ <employee> ▸ Code History` | — | not needed — `GET /employees/{id}/code-history` (`src/utils/api/stickerRollApi.ts` → `getCodeHistory`) carries `B7-R1`. |
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists — **not used by B7**. There is no transfer issue group for an Undefined-Employee card (see *Planner evidence*), so the screen shows nothing B7 asserts. |

## Data

Fixture values come from `src/data/journey-b/fixture.ts`. `DAY_OFFSET.B7 = -9` is already present.
B7 needs a roll owner that neither B5 (`6006`) nor B6 (`6005`) touches, so **employee `6007`** is
added to `F.sticker` — this also quarantines the permanent code-history residue (N5) on one employee.

Sticker codes must be shaped so the office's own extraction reproduces the `<Employee>` value the
spec sends: with `empStartLoc=1` / `rollStartLoc=8` the prefix is `code[0..7)`. Derive both from
`newRunPrefix()`, and **send the prefix the test computed** rather than re-deriving it in the
assertion, so the comparison is like-for-like.

**Envelope `B7-001` builds** — one envelope, `punchDay(DAY_OFFSET.B7)`, `prefix = newRunPrefix()`:

| # | Node / part | Time | `<Employee>` | Elements |
|---|---|---|---|---|
| 1 | `TimeCard` / `TI` | 06:30 | `6007` code | crew `5001`, ranch `4001`, field `4101`, job `4201`, `employeeSource` `BarcodeBadge`, `traceabilityCode` = assigned roll — device A's Time In |
| 2 | `Employee_Records` **nested grid** (not a flat `_Records` section) | 06:30 | `6007` code | `AlternateCode` = assignedPrefix, `FirstCode` = roll suffix, `ScannedCode` = full roll, `StartDateTime` = 06:30 that day |
| 3 | `PieceOut` / `PO` | 12:17 | **assignedPrefix** | crew `5001`, no job/ranch/field, `pieces` 1, `traceabilityCode` = assignedSticker, `employeeSource` `AlternateCode` — `B7-R2` |
| 4 | `PieceOut` / `PO` | 12:16 | **unassignedPrefix** | same shape, a prefix with no grid row — `B7-R3`, `B7-R4` |

**Office assertions.** `GET /employees/{id}/code-history` → a row whose `alternateCode` is
assignedPrefix (`B7-R1`). `GET /time-cards` cardType 0 → per reference: `employeeCounter`
(`emp6007.id`, then `preferences.undefinedEmployee`), `traceabilityCode` verbatim, `numOfPieces` 1,
`cardType` 0, `employeeSourceText` `"Sticker Code"`, and `memo` matching
`/^Assigning to Undefined Employee - Missing Code: <unassignedPrefix>/` on the undefined row.

## Preconditions

- [ ] Employees `6005` / `6006` / **`6007`**, ranch `4001`, field `4101`, job `4201`, crew `5001`
      exist (`seedOfficeFixture` plus `ensureEmployee(F.sticker[2])`, as B4/B5/B6 do).
- [ ] `DEVICE_RELAY_FROM` / `DEVICE_RELAY_URL` / `DEVICE_RELAY_SERVER` set; run with
      `IMPORT_TRANSPORT=single-folder`, without `OFFICE_TRANSPORT_SUBSTITUTE`.
- [ ] **N3** — `LabelTraceability` **and** `PiecePayment` licensed. `PiecePayment` is **not** in
      `PT_MODULES` on dev today, so `B7-001` is expected **red on this gate**; the spec names it in an
      `environment-gate` annotation and fails — never a silent skip.
- [ ] **N1** — the label-tracking start-location preferences non-default on dev. They are **not**
      today. Same treatment: named in an `environment-gate` annotation, and the test fails.

## Cleanup

| Entity | Removed by | Notes |
|---|---|---|
| Time In + piece time cards | `cleanupCards()` (`src/utils/api/officeVerification.ts`) → `DELETE /time-cards/{id}` in a `finally` | Same as B1–B6, including the Undefined-Employee card. |
| Leftovers from an interrupted run | `sweepFixtureCards(sessionApi, { employeeIds: [emp6007.id, undefinedEmployeeId], day, cardTypes: [CARD_TYPE.timeOut, CARD_TYPE.timeIn] })` **before** delivery | Explicit, spanning both card types. |
| `EmployeeCodeHistory` row | **nothing can remove it — there is no DELETE endpoint** | The `AddOnlyGrid` write is idempotent by `(EmployeeCounter, AlternateCode, StartDateTime)`, so a fixed alternate code leaves **one row per calendar day the suite runs**, permanently, on employee `6007`. See **N5** — a decision, not an oversight. |

No SQL. All cleanup goes through the app's API.

## Test cases

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `B7-001` | Deliver a roll assignment and employee-less sticker piece-outs from a second device, and verify the office attributes the assigned prefix to its owner and flags the unassigned one on the Undefined Employee. | `B7-R1`, `B7-R2`, `B7-R3`, `B7-R4`, `B7-R5`, `B7-R6`, `B7-R7`, `B7-R8` | `regression` (demo=0 → no `@Demo`) | **1** |

`testName` stays `undefinedEmployeeReconciliation`; `category` is already `workflow`. One case, one
envelope — the same shape as `B4-001`, `B5-001` and `B6-001`.

## Open questions for the tester

- [ ] **N5 needs your call**: accept one permanent code-history row per calendar day on employee
      `6007`, or pin B7 to a fixed calendar date so it stays at exactly one row forever. B7 sends no
      crew Time In that could collide, so the fixed date is safe — it just breaks the `DAY_OFFSET`
      convention. Nothing accrues while the gate is red.
- [ ] **N1 / N3** are environment changes, not code: `PT_MODULES` needs `PiecePayment`, and the two
      start-location preferences need setting on the dev client. Until both land, `B7-001` is red by
      design and its reconciliation assertions are unproven on dev.
