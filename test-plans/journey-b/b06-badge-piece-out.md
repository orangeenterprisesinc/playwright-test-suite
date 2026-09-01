# `B6` · Badge piece-out

> **Transport, not simulation, happy path only.** As with B1–B5 the spec does not drive a device. It
> builds the `OrangeExportFile` envelope PET Pocket syncs, delivers it through the relay, imports it
> (`IMPORT_TRANSPORT=single-folder`), and verifies the office side by id.
>
> **What the recording adds to the catalog.** The catalog says "the checker scans the badge; a piece
> records; a second scan of the same badge within the duplicate range is ignored". The recording shows
> *where* each half lives: the scan, the badge→employee resolution and the de-dupe are **device-side**
> (`Piezas` screen, toast `Updated record within duplicate range.`) — not automatable via XML — while
> what reaches the office is an ordinary piece-out card already carrying its employee, its `Pieces`
> value and an `Employee Selection` of **Barcode Badge**. That card is all this spec asserts.

Source: `docs/media/journey-b/b06-badge-piece-out.mp4` (Jira WEBPET-1525 attachment 66892, 312.2 s,
1920×1032) → `.video-annotations/b06-badge-piece-out/` — 178 keyframes, 89 action (44 force-sampled),
`Max gap 4.9s of 5.0s allowed`, not capped. The default run was **capped at 60 change points with
`Max gap 9.9s of 5.0s allowed`**; re-run once with `--max-frames 200` per the annotator's own remedy
table, which uncapped it and closed the gap. No other flag was changed.

**Reading coverage.** 48 of the 89 captured moments were read as images. Every moment whose
`change_score` is ≥ 0.009 has been read; the 41 unread are 35 moments scored `0` (nothing moved —
a static screen held between force-samples) and 6 scored 0.0004–0.0021 (cursor movement only). No claim
below rests on a frame that was not opened.

The recording is against a **local LAN instance** (`http://192.168.1.74`, signed in as `Su`) with a real
RS35 handheld mirrored over Zoom (`PET (26.01.22) - Device32@jen…`, reference prefix `S32`) — not dev
staging. Values read off it are the *product's* behaviour; ids and names are that instance's own.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `B6` |
| Jira | `PET-12644` (automation) / `WEBPET-1525` (manual) — [B6] Badge piece-out |
| Recording | `docs/media/journey-b/b06-badge-piece-out.mp4` |
| This plan | `test-plans/journey-b/b06-badge-piece-out.md` |
| Spec | `tests/web/journey-b-field/b06-badge-piece-out.spec.ts` |
| Runner rows | `src/data/runner/journey-b.csv` → `B6-001` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `B6` |
| Journey | `B` — Field harvest day (mobile field capture) |
| Segments | `grower\|perennial-grower` |
| Modules | `Piece Payment` |
| Surface | `device` — spec lives in `tests/web/journey-b-field/`, runner category `workflow` (API + UI in one test, like B1–B4) |
| Demo candidate | no — CSV `demo=0`, so **no** `@Demo` tag |
| Catalog status | draft |

**Summary** (from the catalog)
> Record a piece by scanning the employee's badge when stickers are not used, which is lower throughput
> because the worker waits at the checker.

**Variations** (from the catalog)
> none

## Catalog steps

| # | Catalog step | What the recording shows | Automatable? |
|---|---|---|---|
| 1 | The worker brings a finished case to the checker. | Nothing — physical, off-camera. | no — physical act, no system surface |
| 2 | The checker scans the badge. | Device menu `PET (26.01.22) - Device32@jen…` offers `TIEMPO DE ENTRADA`, `HORA DE ENTRADA DE LA CUADRILLA`, `TIEMPO DE SALIDA`, `HORA DE SALIDA DE LA CUADRILLA`, **`PIEZAS`**, `ASIGNAR ROLLO`, `EXPORTAR`, `IMPORTAR`, `SINCRONIZAR` (kf 49, 107, 161). `PIEZAS` opens `PET - Piezas - New`: header `08/11/2026` / `10:13 AM`, `Numero de Piezas` prefilled **`1`**, `Empleado` blank, **`Sticker` blank**, `Memo`, footer `Previous Number of Pieces: / Previous Employee: / Last Scanned:` (kf 1, 53). Each badge scan fills `Empleado` with the resolved name — `VELEZ NERIS, RAQUEL` (kf 9), `VELARDE MARTINEZ,MIGUEL` (kf 13, 39), `VILLAREAL VAZQUEZ,HORTENCIA` (kf 21), `VILLA, SERGIO` (kf 93). `Sticker` stays empty throughout: this is the badge path, stickers not in use. | **yes, as transport** — the scan and the badge→employee resolution are device-side; what reaches the office is a `PieceOut` row already carrying its employee |
| 3 | A piece records; a second scan of the same badge within the duplicate range is ignored. | A first scan toasts **`Saved record. Record saved for <employee>`** (kf 5), and `LISTA` lists it as `08/11/2026 10:13 AM - 1 piece`, `Cuadrilla de Trabajo: 330 Ivan Felix`, **`Sticker: Not Selected`** (kf 19). A re-scan **inside** the range toasts `Updated record within duplicate range. Record saved for <employee>` and the list still reports `Recs (4) Emps (4)` (kf 9, 29, 39, 45, 137). A rescan three minutes later — **outside** the range — toasts `Saved record.` again and does add a record (kf 89, 97). | **the stored piece, yes**; the in-range de-dupe **no** — it happens on the device before sync, so the suppressed scan never reaches an envelope |
| — | *Expected result: badge piece-out records one piece and de-dupes within the range.* | Office `Transfer to Job Cards` (`/transfer-to-job-cards`), reached from the left nav, date range `08/11/2026 – 08/11/2026` applied (kf 121–127, 153, 157). Each piece row reads Type **`Piece Out`**, Crew `330 Ivan Felix`, Employee Selection **`Barcode Badge`** (kf 127, 131, 159). Opening one (kf 173) gives a panel titled **`Time Out`**: `Reference 0000003-260811-PO-S32-ui`, `Date / Time 08/11/2026 10:13 AM`, `Employee Villareal Vazquez,Hortencia`, **`Pieces 1`**, `Work Crew 330 Ivan Felix`, `Transferred No`, `Unedited Yes`, `GPS Reading (36.807657, -119.8348531)`, `Traceability` empty, `Memo` empty, `No questions recorded.` | **yes** — one card per scan, by employee, pieces, reference part, card type and employee-selection |

**Context the recording shows but this spec does not assert.** Amy's piece-outs carry **no Job**
(`Job —`, panel `Job * Select Job`), so the office holds them at `Blocking` with the issue
`JobCounter is required on a piece-out TimeCard` — `12 records · 8 blocking · 4 warnings`,
`12 Time Cards · 4 Employees · 8 Pieces` (kf 127, 171). That is a *rejection* path; per the
happy-path scope this plan sends a job (the ticket's own precondition — "a piece-eligible job") and
asserts the clean import instead. The job-less blocker is left to a later negative case if one is
wanted; see **N2**.

**Reference format, corroborated.** `0000003-260811-PO-S32-ui` (kf 173) is exactly what
`buildReference` emits — `{seq:7}-{yyMMdd}-{part}-{prefix}-ui` with part `PO`. This settles a
discrepancy in the run brief, which read `{MMDDYY}` off the *iPhone* sample
(`0000302-031324-PO-A02`): Android/CloudPet uses `yyMMdd`, which is what
`src/utils/relay/exportEnvelope.ts` already does. No builder change needed.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `B6-R1` | Where the Piece Payment module is licensed, when a device export containing a badge piece-out record is imported, PET Tiger shall create one time card for that record's reference bearing its employee id. | `B6-001` |
| `B6-R2` | When such a record is imported, PET Tiger shall record its number of pieces as the time card's Pieces value. | `B6-001` |
| `B6-R3` | When such a record is imported, PET Tiger shall store it as a time-out-typed card and shall report its type as `Piece Out` on Transfer to Job Cards. | `B6-001` |
| `B6-R4` | When such a record is imported, PET Tiger shall key the card by the device's own reference, whose part is `PO`. | `B6-001` |
| `B6-R5` | When a piece-out record declares a barcode-badge employee source, PET Tiger shall report the card's Employee Selection as `Barcode Badge`. | `B6-001` |
| `B6-R6` | When a piece-out record carries a crew and a job, PET Tiger shall link the card to both. | `B6-001` |
| `B6-R7` | When a piece-out record carries a GPS reading, PET Tiger shall store it on the card verbatim. | `B6-001` |
| `B6-R8` | If a badge already recorded is re-scanned inside the device's duplicate range, then PET Tiger shall update the existing record rather than add one, and shall report `Updated record within duplicate range. Record saved for <employee>`. | — not automatable: device-side; the suppressed scan never reaches an envelope (kf 9, 29, 39, 45, 137) |
| `B6-R9` | When a piece is recorded, PET Tiger shall play a confirmation tone. | — not automatable: device audio, no office surface |
| `B6-R10` | While the Piezas screen is open, PET Tiger shall show the previous piece count, the previous employee and the running record and employee counts. | — not automatable: device-side (kf 11, 19, 97, 139) |

Nothing here is invented: every row cites a keyframe or an importer source. The sticker path is
explicitly *not* B6 (`Sticker: Not Selected` throughout) — that is B4/B5/B7.

## Planner evidence — the importer, read before the spec

Read-only `gh api` fetches against `orangeenterprisesinc/web-pet` and `…/AndroidPET`, so the Planner
does not repeat them.

* **Element list of a device piece-out** — AndroidPET `record/PieceOutRecord.java:15-40`: table
  `PieceOut_Records`, `PartID = "PO"` (l.16), date/time columns `PieceOutDate`/`PieceOutTime`
  (l.18-19), then Crew, Employee, Job, Ranch, Field, `NumOfPieces`, Reference, UpdateTime, Variety,
  AgRow, TraceabilityCode, GpsReading, Load, EmployeeSource, WorkOrder. The iPhone sample
  `docs/05-mobile-integration/samples/FromIphone-20240313142926-A02.xml:1118-1137` shows the same node
  with `LookupContents="Employee:Code|Crew:Code|Job:Code|Ranch:Code|Field:Code|Variety:Code|AgRow:Code"`.
* **Stored card type is 0 (TimeOut)** — `importmap/timecard.go:466-473`: a `PieceOutDate`+`PieceOutTime`
  pair, *or* the node name `PieceOut`, sets `cardTypeTimeOut`; an explicit `<CardType>PieceOut</CardType>`
  is coerced to TimeOut too (`:525-532`). This is why the office panel is titled `Time Out` while the
  grid's Type column renders `Piece Out` (kf 173 vs kf 127) — one card, two renderings.
* **The piece-out rules fire only for the `PieceOut` node** — `timecard_rules.go:334-337`
  (`isPieceOutNodeName` = `PieceOut` or `PieceOutWithTimeIn`; the Crew aliases are excluded). So
  `node: 'PieceOut'` is the shape that exercises them.
* **Pieces default** — `timecard_rules.go:1149-1170`: an absent `NumOfPieces` is filled from
  `DefaultNumberOfTimeCardPieces` (or 1). The spec therefore sends `NumOfPieces` explicitly, so `B6-R2`
  asserts our value rather than the preference.
* **No Time-In synthesis, by construction** — the WEBPET-1409 PostSave hook
  (`timecard_timein_synth.go:156-261`) needs *all* of: a piece-out node name, a bound Employee, a bound
  `NumOfPieces`, `PktFieldRequiredInPieceOut` off, **a bound Field** (`:183-185` returns early without
  one), and `PktTimeInCardCreateMethod` not `User`/`Opposite` (`:237-240`; an absent row reads `User`,
  `:328-336`). The recording's piece-outs carry **no Field** (kf 173) — so a faithful envelope cannot
  trigger synthesis whatever the preference says. Dev also reads `timeInCardCreationMethod:"User"`
  (B5 Planner resolution N4). Belt and braces: the pre-run sweep still covers card types 0 **and** 1.
* **Piece-eligibility is enforced device-side, not by the importer** —
  `editrecord/PieceOutActivity.java:1066-1067` ("Only Piece Jobs are allowed in Piece-out",
  `isJobPaymentTypeByPiece`); `timecard_rules.go:1255-1277` consults `Job.PaymentType` only for the
  data-tracking skip and `:2300-2329` only to find a prior piece-job Time-In. So the importer never
  rejects a piece row over payment type. See **N2**.
* **Employee source** — `record/RecordBase.java:435-436,452-453` sets
  `EmployeeScanSourceOptions.BarcodeBadge` for a scanned barcode column and
  `sync/TimeCardExport.java:221` exports it verbatim, i.e.
  `<EmployeeSource>BarcodeBadge</EmployeeSource>` = `DEVICE_SCHEMA.employeeSource.barcodeBadge`. The
  office renders it `Barcode Badge` (kf 127) — `B6-R5`.
* **The duplicate range is a device preference** — `PieceOutActivity.java:1679,1774,1786,2154`:
  `saveRecord(r, mPrefs, poPreferences.getDuplicateRange())` updates the identical in-range record.
  That is why `B6-R8` is not automatable: the office never sees the suppressed scan.

**Groundwork: one page-object method.** `buildEnvelope` + `DEVICE_SCHEMA` (`PieceOut` node, `pieceOut`
row shape, `referenceParts.pieceOut`), `deliverAndVerifyCards`/`cleanupCards`, `timeCardsApi`'s optional
`cardType` and `sweepFixtureCards({cardTypes})`, and `DAY_OFFSET.B6 = -6` all landed with B3/B4 — the
only addition is `TransferToJobCardsPage.rowCells()` (see *Screens and page objects*). No fixture,
envelope-builder or verification-helper change.

## Not established by the recording

| # | Question | Why it matters |
|---|---|---|
| N1 | Is **Piece Payment** licensed on the dev client? B5 found `modules.PiecePayment=false` (2026-08-26); the recording's local instance clearly has it. | Either way it must be *named*: the spec pre-checks `GET session/me` and fails with an `environment-gate` annotation, never a silent skip. Enabling it is a one-time TigerMaster change (`/admin/tm`, ClientID 1, su can) — being done for this run. |
| N2 | Does dev's fixture job `4201` qualify as "piece-eligible" (`PaymentType` ∈ {1 Piece, 3 TimeAndPiece, 4 TimeAndAllPieces}), and does a piece-out that carries a job import **clean** — no `JobCounter is required` issue, status not `Blocking`? The recording only ever shows job-less piece-outs. | This is the happy path's load-bearing assumption. If a job-carrying piece-out still blocks, `B6-001`'s scope needs revisiting before the spec is written, not after. Planner: `GET /jobs`, then one delivered record. |
| N3 | Does the Transfer grid render `Piece Out` / `Barcode Badge` on **dev's** build, and is `POST /transfer-to-job-cards/analyze` enabled there? | `B6-R3`/`B6-R5` are asserted on the row; dev has the analyze flag on (probed 2026-08-10) and the existing helper annotates `transfer-grid-not-asserted` when it is off, with the API assertions standing either way. |
| N4 | The exact moment of `EXPORTAR` / `SINCRONIZAR` on the device. The main menu carrying those buttons is on screen (kf 49, 107, 161) and the office grid populates afterwards (kf 127), but the tap itself falls in a force-sampled, motionless stretch. | Cosmetic only — the spec builds and delivers the envelope itself, so the device's sync UI is out of scope. |
| N5 | What the **large numeral** on the `Piezas` screen counts. It reads 2 → 3 → 4 → 1 → 0 → 2 → 1 across kf 5, 9, 21, 89, 137, 139, 163 and matches neither the `LISTA` record count (4 → 8 → 9) nor the `Previous Number of Pieces` footer. | Nothing in the automation depends on it — it is a device display. Recorded so a later reader does not mistake it for a record counter. |

### Planner resolution (2026-08-27 — Planner agent on source; orchestrator on live dev + web-pet sources)

| # | Resolution | Evidence |
|---|---|---|
| N1 | **The licence flag does not come from TigerMaster at all on dev — it comes from the `PT_MODULES` env var, and no admin action can change it.** `LoadModulesForClient` returns `parseModulesEnv(PT_MODULES)` and **skips the TigerMaster query entirely** whenever that var is non-empty; only when it is unset does it run `SELECT Name FROM TigerMaster.dbo.vw_ActiveClientModules WHERE ClientId=@p1` and map names via `dbNameToKey` (which *does* contain `"Piece Payment": {"PiecePayment"}`, so this is not a mapping gap). Proof the override is live on dev: `session/me` reports **20** modules true — `BioIdentification`, `CostAccounting`, `ElectronicToken`, `Measurement`, `Notification`, `Onboarding`, `Signature`, `TimeCardQuestions`, `WorkOrder`, `RealTimeDashboard` among them — none of which are in TigerMaster's **13** subscriptions for client 1 (`Bonus Payment, Connectivity, Department, Equipment, Grower Billing, Inventory, Irrigation, Piece Payment, Real Time, Time Sheet Entry, Traceability - Items, Traceability - Stickers, Windows`). A view can only filter, never add, so the set must be the env list — which omits `PiecePayment` while TigerMaster licenses it (moduleId 36). **The unblock is `PT_MODULES` on the dev API task (DevOps), not `/admin/tm`.** `B6-001` therefore pre-checks `session/me.modules.PiecePayment`, pushes an `environment-gate` annotation naming `PT_MODULES` explicitly, and **fails** — per the ticket AC and the run brief, never a silent skip. | `apps/api/internal/auth/modules.go:569-571` (env override), `:579-610` (view query + `dbNameToKey` miss = silent `continue`), `:505` (`"Piece Payment": {"PiecePayment"}`), `:18` (`PT_MODULES`); live `GET /session/me` and `GET /admin/tm/clients/1/modules`, 2026-08-27 |
| N2 | **Keep job `4201`; no fixture change.** It is `paymentType: 0` (`jobCounter 221`) and that is deliberate: `officeFixture.ts:37-40` says the fixture's `paymentType: 'Time'` is display text the office API cannot take, so `seedOfficeFixture` does not forward it and `ensureJob` applies its default `0`. Payment type is irrelevant to the import — `JobCounter is required` fires on a **missing Job link**, never on eligibility (`timecard_rules.go:1255-1277`, `:2300-2329` consult `PaymentType` only for the data-tracking skip and a prior-Time-In lookup), and piece-eligibility is enforced **device-side** (`PieceOutActivity.java:1066-1067`). So a job-carrying piece-out satisfies the happy path. `ensureJob` *does* forward a numeric `paymentType` if a future case needs a piece-paid job (`setupEntitiesApi.ts:166-188`). | `officeFixture.ts:37-40`; `setupEntitiesApi.ts:166-188`; live `GET /jobs` 2026-08-27; plan's *Planner evidence* |
| N3 | **`rowFor` is the Reference cell, not the row** — the plan's original assertion idiom was wrong and would never have matched. One new method, `rowCells()`, mirroring `rowStatus`'s row filter. **Both halves then confirmed on dev 2026-08-27** by a gate-bypassed verification run: `analyzeEnabled()` returned `true` and the grid assertions executed and passed, so dev does render Type `Piece Out` and Employee Selection `Barcode Badge` for an imported badge piece-out. The `transfer-grid-not-asserted` branch stays for other environments. | `TransferToJobCardsPage.ts:221-227, 241-246`; `BasePage.ts:25`; `officeVerification.ts:420-424`; instrumented run 2026-08-27 |
| N4/N5 | Unchanged — out of scope for the automation (device sync UI; unexplained device numeral). | — |

**The spec body is proven; only the gate is red.** A one-off verification run on 2026-08-27 with the
licence assertion neutralised (a throwaway copy, never committed, deleted afterwards) took the full
path — envelope → relay → `single-folder` import → every EARS assertion → Transfer to Job Cards grid →
cleanup — and **passed**. It also produced the two facts above: `employeeSourceText === "Barcode Badge"`
(so `B6-R5` is now pinned, not merely attached) and `analyzeEnabled() === true`. So when `PT_MODULES`
gains `PiecePayment`, `B6-001` turns green with no code change; nothing downstream of the gate is
unverified.

**Preferences confirmed live (2026-08-27), settling the synthesis question twice over:**
`timeInCardCreationMethod: "User"` (mode `User` never synthesizes, `timecard_timein_synth.go:237-240`),
`fieldRequiredInPieceOut: false`, `serviceImportInterval: 1` (minute), and
**`defaultNumberOfTimeCardPieces: 0`** — note the zero: `timecard_rules.go:1145-1148` warns an *absent*
preference row yields 1 while a row holding 0 yields **0**, so sending `NumOfPieces` explicitly is
required for `B6-R2`, not merely tidy.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` (left nav) | `src/pages/processing/TransferToJobCardsPage.ts` | **exists, plus one new method.** `applyDateRange`, `waitForCandidates`, `rowFor`, `rowStatus`, `analyzeEnabled`, `screenshot` are reused. **Correction (Planner):** `rowFor(id)` is *not* the row — its JSDoc and `officeVerification.ts:420-424`'s exact-match `toHaveText(reference)` prove it resolves to the **Reference cell**, so asserting `Piece Out` / `Barcode Badge` on it could never match. `rowStatus` (`:241-246`) shows the correct idiom — `page.getByRole('row').filter({ has: this.rowFor(id) })` — but `page` is `protected` (`BasePage.ts:25`), so the spec cannot compose it inline. Add one method mirroring `rowStatus`: `rowCells(timeCardCounter): Locator`. `rowFor`'s contract is untouched, so B1–B5 keep working. |
| Piece-out side panel | click a piece row | — | **not used.** The page object's `timeInPanel` is filtered on a heading `/^Time In$/i` (l. 91-93) and a piece-out panel is titled **`Time Out`** (kf 173), so it would need a new member. Skipped deliberately: every panel value (`Reference`, `Pieces`, `Employee`, `Work Crew`, `GPS Reading`) is asserted on the card via `GET /time-cards`, which is authoritative. Add a generalised `panelFor(title)` only when a workflow needs the panel itself. |
| PET Pocket `Piezas` | device `MENU PRINCIPAL ▸ PIEZAS` | — | device-side, out of scope (`B6-R8`–`B6-R10`) |

## Data

Fixture values come from `src/data/journey-b/fixture.ts`. B6 uses **employee `6005`** (`F.sticker[0]`),
ranch `4001`, field `4101`, job `4201`, crew `5001`; `DAY_OFFSET.B6 = -6` is already present. Note
`6005`/`6006` are named `B5 STICKER …` from B4's phase, but the split in use is **`6005` → B6,
`6006` → B5** (per the B5 plan), so the two never share an employee-day under `workers=2`.
`seedOfficeFixture` does not ensure the sticker employees — call `ensureEmployee(sessionApi, F.sticker[0])`
directly, as B4/B5 do.

Nothing here needs run-unique values: identity is the `Reference`, and `newRunPrefix()` already makes
those per-run. The piece row carries **no Field and no Ranch**, mirroring kf 173 — which also makes
Time-In synthesis structurally impossible (see *Planner evidence*).

**Envelope `B6-001` builds** — one envelope, one record, `punchDay(DAY_OFFSET.B6)`,
`prefix = newRunPrefix()`:

| # | Node / part | Time | Employee | Elements |
|---|---|---|---|---|
| 1 | `PieceOut` / `PO` | 10:13 | `6005` | crew `5001`, job `4201` (confirmed by N2), no ranch/field, `pieces` 1, `employeeSource` `BarcodeBadge`, `gps` the `b01` fix literal |

**Office assertions**, per EARS id — every row keeps an API-level witness so nothing depends on the
Transfer grid being enabled:

| EARS | Assertion | Read from |
|---|---|---|
| `B6-R1` | `card.employeeCounter === emp6005.id` (from `ensureEmployee(F.sticker[0])`, not `seedOfficeFixture`) | `GET /time-cards` |
| `B6-R2` | `Number(card.numOfPieces) === 1` | `GET /time-cards` |
| `B6-R3` | `card.cardType === CARD_TYPE.timeOut` (0); **and** if `analyzeEnabled()`, `rowCells(id)` contains `Piece Out`, else the existing `transfer-grid-not-asserted` annotation | `GET /time-cards`; `rowCells` |
| `B6-R4` | `card.reference === references[0]`, which `buildReference` built with part `PO` | envelope + card |
| `B6-R5` | `card.employeeSourceText === 'Barcode Badge'` — **pinned**, confirmed against dev 2026-08-27 (the office renders `BarcodeBadge` exactly as the recording's grid cell does, kf 127); also attached; **and** `rowCells(id)` contains `Barcode Badge` | `GET /time-cards`; `rowCells` |
| `B6-R6` | `card.crewCounter === office.crew.id` **and** `card.jobCounter === office.job.id` — id equality, never non-null (the nine-rung FK ladder in `timeCardsApi.ts` can resolve a bad code to the wrong employee) | `GET /time-cards` |
| `B6-R7` | `String(card.gpsReading ?? '') === gpsFix` verbatim | `GET /time-cards` |
| belt-and-braces | `cardType 1` for 6005 that day → **zero** rows (no WEBPET-1409 synthesis; structurally impossible with no Field) | `GET /time-cards` |

## Preconditions

- [ ] Employee `6005`, ranch `4001`, field `4101`, job `4201`, crew `5001` exist (`seedOfficeFixture`
      plus `ensureEmployee(F.sticker[0])`).
- [ ] `DEVICE_RELAY_FROM` / `DEVICE_RELAY_URL` / `DEVICE_RELAY_SERVER` set; run with
      `IMPORT_TRANSPORT=single-folder`, without `OFFICE_TRANSPORT_SUBSTITUTE`.
- [ ] **N1** — `PiecePayment` present in **`PT_MODULES`** on the dev API task. It is **not** today, and
      no TigerMaster/`/admin/tm` change can alter it (see *Planner resolution*), so `B6-001` is expected
      **red on this gate** until DevOps adds it. The spec names it in an `environment-gate` annotation
      and fails — never a silent skip.
- [x] **N2** — job `4201` is sufficient; payment type is enforced device-side only. No fixture change.

## Cleanup

| Entity | Removed by | Notes |
|---|---|---|
| The piece time card (cardType 0) | `cleanupCards()` (`src/utils/api/officeVerification.ts`) → `DELETE /time-cards/{id}` in a `finally` | Same as B1–B5. |
| Leftovers from an interrupted run | `sweepFixtureCards(sessionApi, { employeeIds: [6005], day, cardTypes: [CARD_TYPE.timeOut, CARD_TYPE.timeIn] })` **before** delivery | Explicit, so the sweep spans card type 1 as well; `deliverAndVerifyCards` is then called with `sweep: false`. Its own sweep would cover only the single `cardType` passed. |
| A synthesized Time-In (WEBPET-1409) | the same sweep | Structurally impossible here (no Field on the piece row) — swept anyway so a future preference or fixture change cannot orphan one. |

No SQL. All cleanup goes through the app's API.

## Test cases

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `B6-001` | Deliver a badge piece-out export and verify the office records one piece against the scanned employee. | `B6-R1`, `B6-R2`, `B6-R3`, `B6-R4`, `B6-R5`, `B6-R6`, `B6-R7` | `regression` (demo=0 → no `@Demo`) | **1** |

`testName` stays `badgePieceOut`; `category` is already `workflow`.

## Open questions for the tester

- [ ] **N2** is the one that can move scope: if a job-carrying piece-out still lands `Blocking` on
      `JobCounter is required`, then the recording's job-less shape *is* the only shape, and `B6-001`
      would assert that blocker instead of a clean import. The Planner settles it before the spec.
- [ ] Is a negative case wanted later for the job-less piece-out (`JobCounter is required on a
      piece-out TimeCard`, kf 127) and for the out-of-range rescan adding a second card (kf 89)? Both
      are provable through this same transport; both are out of the happy-path scope agreed here.
- [ ] **N5** — if anyone knows what the large numeral on the `Piezas` screen counts, it is worth one
      line here; it is currently unexplained and deliberately unasserted.
