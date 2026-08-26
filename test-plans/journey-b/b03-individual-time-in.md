# `B3` · Individual time-in and duplicate-range correction

> **Transport, not simulation — happy path only (user decision 2026-08-26).** As with B1/B2 the
> spec does not drive a device. It builds the `OrangeExportFile` envelope PET Pocket syncs at the
> end of Amy's recording — two individual (badge) Time In records for one employee, reference part
> `TI`, `EmployeeSource` `BarcodeBadge` — delivers it through the relay, imports it, and verifies
> the office side by id and on screen. The duplicate-range correction itself happens on the device
> before sync: the office only ever receives the corrected record (kf 106–118), which is exactly
> what the envelope carries. Device-side rules are recorded below as not automatable via XML.

Source: `docs/media/journey-b/b03-individual-time-in.mp4` (Jira WEBPET-1522 attachment 66792,
205 s, 1920×1032) → `.video-annotations/b03-individual-time-in/` — 120 keyframes, 60 action
(27 force-sampled), `Max gap 5.0s of 5.0s allowed`, not capped.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `B3` |
| Jira | `WEBPET-1522` — [B3] Individual time-in and duplicate-range correction |
| Recording | `docs/media/journey-b/b03-individual-time-in.mp4` |
| This plan | `test-plans/journey-b/b03-individual-time-in.md` |
| Spec | `tests/web/journey-b-field/b03-individual-time-in.spec.ts` |
| Runner rows | `src/data/runner/journey-b.csv` → `B3-001` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `B3` |
| Journey | `B` — Field harvest day (mobile field capture) |
| Segments | `grower\|perennial-grower` |
| Modules | `Real Time` |
| Surface | `device` — spec lives in `tests/web/journey-b-field/`, runner category `workflow` (API + UI in one test, like B1/B2) |
| Demo candidate | no |
| Catalog status | draft |

**Summary** (from the catalog)
> Clock in a single worker by badge or biometric (start of day, late arrival, or a fix), with
> same-scan correction inside the duplicate range. A rescan with corrected data within the window
> overwrites rather than duplicates.

## Catalog steps

Device clock in the recording: 08/07/2026, 10:37 → 10:40. Office is Amy's local instance, user
`Su`; device is an RS35 ("RS35 Journey B") with **Duplicate Range (minutes) = 2** on its Scan
Device record (kf 0–5, 36–55).

| # | Jira step | What the recording shows | Automatable? |
|---|---|---|---|
| 1 | Scan the employee badge with field and job selected | Tiempo de Entrada: Rancho Amy's Ranch, Campo Field 01, Trabajo Box - Field Packing, Cuadrilla 254 Ronaldo Medrano; badge scan → "Hernandez, Daniel"; LISTA **Recs (1) Emps (1)**, 10:37 AM (kf 6–21) | device capture: no — the record it produces is what the envelope carries |
| 2 | Rescan with corrected data within the duplicate range | Still 10:37: Rancho → AV-Kern-Grape, Campo → Central - Org Scarlet Royal, rescan → toast "Updated record within duplicate range for: Hernandez, Daniel" (kf 24–33) | device-only; the envelope carries the **corrected** record |
| 3 | Confirm the rescan overwrote the prior record | LISTA still **Recs (1)**, now AV-Kern-Grape / Central - Org Scarlet Royal (kf 34–47). *(Also shown: at 10:40 an identical rescan is refused — "TimeIn is identical with the previous TimeIn record", kf 56–63.)* | device-only |
| 4 | Rescan outside the range → new record | 10:40: Rancho → AVI-COA-Citrus, Campo → Anthony Nursery - Mangos, rescan → LISTA **Recs (2) Emps (1)** (kf 64–81) | device-only; the envelope carries **both** records |
| 5 | *(office)* Review after sync | View ▸ **Time Cards**, From/To 08/07/2026, Apply Filter → **Total 2 rows**, both "Time In", Daniel Hernandez, crew 254 Ronaldo Me…, Box - Field Packing (kf 94–105). Exceptions: 1 issue "No corresponding Time-Out/Piece-Out(without Job)/Crew-Piece-Out found" (kf 110–111). Edit Time In: refs **`0000006-260807-TI-S34-ui`** (10:37, AV-Kern-Grape / Central - Org Scarlet Royal) and **`0000007-260807-TI-S34-ui`** (10:40, AVI-COA-Citrus / Anthony Nursery - Mangos), Phase "Cajas del Fil", GPS (36.8076638, -119.8348287), Transferred No (kf 112–119) | **yes** — `GET time-cards` id equality; office UI via the existing Transfer to Job Cards verification (B1/B2 pattern; View ▸ Time Cards has no page object yet — see Screens) |

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `B3-R1` | When an individual time-in export (two `TimeIn` records for one employee, distinct `TI` references, `EmployeeSource` `BarcodeBadge`, different field/job contexts) is imported, PET Tiger shall hold exactly one Time In card (cardType 1) per reference, each linked by id to the scanned employee, ranch, field, job and crew, with `programCreated` true. | `B3-001` |
| `B3-R2` | When the punch day is loaded in the office, PET Tiger shall list one row per imported card carrying its reference, and flag each as an open Time In (no corresponding Time-Out/Piece-Out). | `B3-001` |
| `B3-R3` | When a badge is rescanned within the Duplicate Range with different data, PET Pocket shall replace the existing Time In record ("Updated record within duplicate range for: <employee>"); outside the range with different data it shall add a record; outside the range with identical data it shall refuse ("TimeIn is identical with the previous TimeIn record"). | — not automatable via XML: device-side duplicate-range rules; the office receives the final state, which `B3-R1` asserts |
| `B3-R4` | Where biometric identification is configured, PET Pocket shall accept a fingerprint in place of a badge scan. | — not automatable: device hardware, not shown |

## Not established (Planner resolves before generation)

| # | Question | Why it matters |
|---|---|---|
| N1 | Exact element list of an individual time-in record and its node name (`<TimeIn_Records>` vs `<TimeCard_Records>`), whether it carries `<Crew>`, and the literal `EmployeeSource` value (`BarcodeBadge`) — from web-pet `apps/api/internal/connectivity/importmap/timecard.go` and `docs/05-mobile-integration/samples/FromIphone-20240313142926-A02.xml`. | Feeds `DEVICE_SCHEMA`; specs never write tags. |
| N2 | Confirm `TI` as the reference part for Tiempo de Entrada (recording: `0000006-260807-TI-S34-ui`). | Reference fidelity — the importer keys on it. |
| N3 | Does the office accept two Time In cards for one employee on one day from the same import without flagging a duplicate as Blocking on Transfer to Job Cards (they differ in time, field and job)? | Decides whether Transfer rows show Warning (as B1) or Blocking. |

### Planner resolution (2026-08-26, from web-pet `importmap/timecard.go` + `FromIphone-20240313142926-A02.xml`)

- **N1 resolved.** An individual badge time-in is a `<TimeCard>` row inside
  `<TimeCard_Records LookupContents="Employee:Code|Crew:Code|Job:Code|Ranch:Code|Field:Code">` — the
  same node B1 uses; only `EmployeeSource` differs (`BarcodeBadge` vs `Crew`). Sample row tags, in
  order: `Reference, DateIn, TimeIn, Employee, Crew, Job, Ranch, Field, GpsReading, TraceabilityCode,
  UpdateTime, PictureVerification, Signature, Memo, EmployeeSource`; **no `<CardType>`** — the
  importer derives TimeIn (1) from `DateIn`+`TimeIn`. The eleven TimeCard node names the importer
  accepts: TimeCard, TimeIn, TimeOut, PieceOut, CrewIn, CrewOut, CrewPieceOut, CrewPiece,
  PieceOutWithTimeIn, NonLaborCard, SignatureCard (+`_Records`).
- **N2 resolved.** `TI` is the Time In reference part (sample `0021312-031324-TI-A02`; the importer
  mints `TI` for TimeIn when absent; `SC`/`NL`/`TO` for the others).
- **N3 open — observe at run time.** Rows are upserted by Reference (update refused only when
  `Transferred`); no same-day duplicate rule surfaced in the importer. The spec asserts row
  presence and the open-punch issue group, not the Warning/Blocking severity.
- Envelope: `TimeCard_Records`, two rows, part `TI`, `EmployeeSource` `BarcodeBadge`, `<CardType>`
  omitted (sample fidelity; exercises the derivation path B1 does not). Row 1 field 4101 / job 4201
  with GPS; row 2 field 4102 / job 4202.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Sidebar | — | `src/pages/shell/LeftNavigationPage.ts` | exists |
| Connectivity ▸ Import ▸ Internet | `Connectivity ▸ Import ▸ Internet` | `src/pages/connectivity/ImportInternetPage.ts` | exists (bypassed by `IMPORT_TRANSPORT=single-folder`) |
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists — used for `B3-R2`, as in B1/B2 |
| View ▸ Time Cards | `View ▸ Time Cards` | — | not built; Amy's screen, deferred (would be a later enhancement) |

## Data

- Office fixture (existing): ranch `4001`, fields `4101`/`4102`, jobs `4201`/`4202`, crew `5001`,
  employee `6001` — `src/data/journey-b/fixture.ts`, `src/utils/api/officeFixture.ts`.
  Record 1 (10:37, corrected) = field `4101` + job `4201`; record 2 (10:40) = field `4102` + job
  `4202`. One ranch in the fixture, so the recording's ranch change is expressed as a field change.
- Punch day: today + `DAY_OFFSET.B3` (−2) so B1/B2/B3 never share an employee-day under `workers=2`.
- Reference prefix: `newRunPrefix()` per run; GPS fix on record 1 (asserted on the card, as in B1).

## Preconditions

- [ ] `seedOfficeFixture` ensures the office fixture.
- [ ] `DEVICE_RELAY_*` in `.env.dev`; `IMPORT_TRANSPORT=single-folder`.

## Cleanup

Cards found by reference are deleted via `DELETE time-cards/{id}` in `finally`; the pre-run sweep
removes leftovers for employee `6001` on the B3 day. No SQL.

## Test cases

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `B3-001` | Individual time-in and duplicate-range correction | `B3-R1`, `B3-R2` | `regression` | 0 → 1 when green |
