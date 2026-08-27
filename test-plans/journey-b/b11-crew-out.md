# `B11` · Crew-out to individual time-outs

> **Transport, not simulation — happy path only (user decision 2026-08-27).** One test that
> mirrors Amy's recording step by step. No negative cases, no variations. The
> `/annotations-to-script` "4–5 failure/edge rows" rule is **suspended** for this workflow;
> anything the frames did not settle is listed under *Not established / out of scope*
> rather than turned into a second scenario.
>
> **The recording corrects the master plan's guess about the record shape.** A crew-out
> reference is `CO` but an individually-recorded time-out is `TO`, and the office stores
> **no Job, Ranch or Field** on either — established from the frames and from source, not guessed.
>
> **No new screen.** Amy happens to verify on `View ▸ Time Cards` rather than Transfer to Job
> Cards, which may simply reflect a module/flag difference in her own LAN environment (user,
> 2026-08-27). We do not depend on it either way: the one thing that grid shows which the
> other does not — the **Employee Selection** provenance — is carried on the time-cards API
> (`employeeSource`), so `B11-R9` is asserted there. B11 therefore builds **no page object**
> and follows the existing Journey B specs exactly. (B10 is authored but unmerged, so the
> closest template on `main` is `b03-individual-time-in.spec.ts`, which already uses
> `buildEnvelope` + `DEVICE_SCHEMA` + `DeviceRecord` + `punchDay(DAY_OFFSET.B3)`.)

Source: `docs/media/journey-b/b11-crew-out.mp4` (Jira attachment **66884**, 9,039,947 bytes,
1920×1032, 157.5 s) → `.video-annotations/b11-crew-out/` — 114 keyframes, 57 action
(16 force-sampled), max action gap 5.0 s of 5.0 s allowed, not capped.

First dev run: 2026-08-27, green in 22.6 s over the **internet relay** (both WebMail legs) and
**no** `OFFICE_TRANSPORT_SUBSTITUTE`. Relay push HTTP 200 `<boolean>true</boolean>`; the office
pull reported `Pulled and queued 1 file(s) from the relay.` (`runId` 354, `filesPulled` 1,
`status` `ok`); all six cards `programCreated=true`. No annotations beyond `testCaseId` /
`requirement` / `slow` — in particular no `office-transport-substituted` and no
`peer-drained-mailbox`. This run is also the first live evidence anywhere on dev of
`employeeSource` 2 (`BarcodeBadge`), which the Planner had flagged as unverified.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `B11` |
| Jira | `PET-12649` (automation) / `WEBPET-1530` (manual test, read-only source) |
| Recording | `docs/media/journey-b/b11-crew-out.mp4` |
| This plan | `test-plans/journey-b/b11-crew-out.md` |
| Spec | `tests/web/journey-b-field/b11-crew-out.spec.ts` |
| Runner rows | `src/data/runner/journey-b.csv` → `B11-001` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `B11` |
| Journey | `B` — Field harvest day (mobile field capture) |
| Segments | `grower`, `perennial-grower` |
| Modules | `Real Time` |
| Surface | `device` — spec lives in `tests/web/journey-b-field/`, runner category `workflow` (API + UI in one test, like B1/B2/B3) |
| Demo candidate | no |
| Catalog status | draft |

**Summary** (from the catalog)
> One crew-out at end of day expands into an individual time-out for every active member.
> Workers who left early were already timed out individually.

## Catalog steps

Amy's environment is her own LAN office (`192.168.1.74`, user `Su`) plus a physical RS35
handheld screen-shared over Zoom (Spanish UI, PET 26.01.22, device mailbox `S34@jensilo`,
Reference Prefix `S34`, Connectivity Web, Export at Exit Yes — so the device syncs on its
own and no manual export/import appears in the recording). Her crew is
`254 Ronaldo Medrano`; the day is `08/10/2026`.

**State before the crew-out** (visible, not performed on camera): four members clocked in
on job `Grafting` at 14:51; `Jose Seranno Torres` timed out individually at 15:07 and
`Francisco Montalvo Bonfil` at 15:09 — the early leavers.

| # | Jira step | What the recording shows | Automatable? |
|---|---|---|---|
| 1 | The supervisor records a single crew-out. | *kf 16–31.* `MENU PRINCIPAL` → main menu (`TIEMPO DE ENTRADA` / `HORA DE ENTRADA DE LA CUADRILLA` / `TIEMPO DE SALIDA` / **`HORA DE SALIDA DE LA CUADRILLA`** / `PIEZAS` / `CANTIDAD DE VINAS` / `ASIGNAR ROLLO` / `EXPORTAR` / `IMPORTAR` / `SIN-CRONIZAR`). Taps **`HORA DE SALIDA DE LA CUADRILLA`** → `Select Cuadrilla de Trabajo` offering `254 Ronaldo Medrano` and `ALL EMPLOYEES`; picks the crew. Screen shows `08/10/2026`, **`3:10 PM`**, Cuadrilla `254 RONALDO MEDRANO`, Memo empty. `Empleado Selection` lists **exactly the three still-active members, all pre-checked** — Barillas Ramirez Balmore A, Santos David, Martinez Alejandro — and she taps `DONE`. Toast: **`Record(s) saved for the following: Barillas Ramirez,Balmore A. Santos, David. Martinez ,Alejandro.`** | device UI — no; the office receives the already-expanded rows |
| 2 | The program creates an individual time-out for each still-active member (the reference shows CO). | *kf 32–35 (device), kf 56–63 + 100–105 (office).* Device list becomes **`PET Tiempo de Salida Recs (5)`**: Barillas 3:10 PM, Santos 3:10 PM, Martinez 3:10 PM, Montalvo 3:09 PM, Seranno 3:07 PM. In the office, three `Time Out` rows at **15:10** for those three employees, Crew `254 Ronaldo Medrano`, **Job blank**, Employee Selection **`Crew`**. Opening one → `Edit Time Out` with Reference **`0000003-260810-CO-S34-ui`**, Date/Time `08/10/2026 03:10 PM`, Employee `Martinez ,Alejandro`, Work Crew `254 Ronaldo Medrano`, **Job / Ranch / Field all empty**, GPS `(36.8076576, -119.8347626)`, Transferred `No`, Unedited `Yes`. | **yes** |
| 3 | Early leavers are unaffected, having timed out earlier. | *kf 8–15, 56–63, 84–89.* Before the crew-out the device already listed two time-outs (Montalvo 3:09 PM, Seranno 3:07 PM); after it they are still there at the same times. In the office they render as `Time Out` at **15:09** and **15:07** with Employee Selection **`Barcode Badge`**, and the 15:09 row's `Edit Time Out` shows Reference **`0000002-260810-TO-S34-ui`** — part `TO`, not `CO` — Date/Time `08/10/2026 03:09 PM`, Job/Ranch/Field empty, Unedited `Yes`. | **yes** |

Not part of any step: *kf 0–5*, an aborted individual time-out — she enters an employee and
the device answers `Employee Cedillos Ayala, Edwin David is missing`; that employee appears
in no later list and no record results.

## Wire format (established read-only from source, before the Planner runs)

Confirmed against `web-pet` `apps/api/internal/connectivity/importmap/timecard.go` and the
real device export `docs/05-mobile-integration/samples/FromIphone-20240313142926-A02.xml`,
then corroborated by the recording:

1. **One row per member, not one crew-out record.** The sample carries 27 `<TimeOut>` rows in
   one `<TimeOut_Records>` block, consecutive references, all sharing one `<Crew>` and one
   identical `DateOut`/`TimeOut` instant. The device fans the crew-out out *before* export.
   The recording agrees: one crew-out → three records, all at `3:10 PM`.
2. **Node is `TimeOut`**, not `CrewOut` (`CrewOut` is a legal importer node —
   `timecard.go:28,42` — but the device does not use it).
3. **A time-out row carries no Job, Ranch or Field.** Sample elements are exactly
   `Reference, DateOut, TimeOut, Employee, Crew, BreakTime, GpsReading, UpdateTime,
   PictureVerification, Signature, EmployeeSource`; `LookupContents="Employee:Code|Crew:Code"`
   — two entities, not five. The office `Edit Time Out` panel confirms Job/Ranch/Field empty.
4. **`EmployeeSource` is `Crew`** for a crew-out and `BarcodeBadge` for an individual
   time-out; the office surfaces this verbatim in the **Employee Selection** column.
5. **CardType 0 is derived, not sent.** `deriveTimeCardTypeAndDateTime` (`timecard.go:420-476`)
   is an if/else chain: a `DateIn`+`TimeIn` pair *wins* and yields CardType 1; otherwise
   `DateOut`+`TimeOut` yields `cardTypeTimeOut = 0` (`timecard.go:50`). Our `punchOut` rows
   emit only `DateOut`/`TimeOut` → **0**.
6. **The importer never mints a `CO` — the device supplies it.** `timeCardReferenceParts`
   (`timecard.go:665-680`) returns only `TI`/`SC`/`NL`/`TO`, and its own comment
   (`timecard.go:642-646`) says the `CI`/`CO`/`PO` PartIds *"belong to the INTERACTIVE
   Crew-In / Crew-Out / Piece-Out screens … The import's default arm is TimeOutReferenceInfo,
   so an imported crew/piece card gets 'TO'."* A `CO` survives only because the envelope
   carries an explicit `<Reference>` — as B1's `CI` does. `buildEnvelope` already does this
   via `record.part`.
7. **Reference format matches ours byte-for-byte.** Amy's office shows
   `0000003-260810-CO-S34-ui` = `{seq7}-{yyMMdd}-{part}-{prefix}-ui`, exactly what
   `buildReference` produces.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `B11-R1` | When a crew-out is saved for a work crew, PET Pocket shall create one Time Out record per still-active member, all stamped with the same date and time. | — not automatable via XML: device-side fan-out; the office receives the already-expanded rows, which `B11-R4` asserts |
| `B11-R2` | While a crew-out's employee list is open, PET Pocket shall list only the crew members who have not already timed out. | — not automatable: device UI (`Empleado Selection`, kf 27) |
| `B11-R3` | When a crew-out is saved, PET Pocket shall confirm it naming each member a record was created for. | — not automatable: device UI toast (kf 31) |
| `B11-R4` | When a crew-out export is imported, PET Tiger shall hold exactly one Time Out card (cardType 0) per crewed-out member, each linked by id to the scanned employee and to the crew, with `programCreated` true. | `B11-001` |
| `B11-R5` | When a crew-out export is imported, PET Tiger shall preserve each card's device reference with part `CO`. | `B11-001` |
| `B11-R6` | PET Tiger shall leave Job, Ranch and Field unset on an imported Time Out card. | `B11-001` |
| `B11-R7` | When a member timed out individually before the crew-out, PET Tiger shall hold that member's Time Out card at its own earlier time with a `TO` reference, unchanged by the crew-out. | `B11-001` |
| `B11-R8` | When a crew-out export is imported, PET Tiger shall stamp every card created by it with the same date and time. | `B11-001` |
| `B11-R9` | PET Tiger shall record the Employee Selection of a crew-out Time Out card as `Crew` (`employeeSource` 13) and that of an individually-recorded Time Out card as `Barcode Badge` (`employeeSource` 2). | `B11-001` |

## Not established / out of scope

Listed, not tested. Nothing here becomes a second scenario.

| # | Question / item | Why it matters |
|---|---|---|
| ~~N1~~ | Does `GET /time-cards` expose `employeeSource`? | **Resolved 2026-08-27 from source.** Yes — `apps/api/internal/input/time_card.go:51-52` returns `employeeSource` (int) and `employeeSourceText` (string); its comment says both *"drive the Employee Selection grid column on View Time Cards and Transfer to Job Cards"*. Codes from `importmap/enums.go:154-179`: `Crew` = **13**, `BarcodeBadge` = **2**. `B11-R9` is asserted on the API. |
| ~~N2~~ | Is a page object needed for **View ▸ Time Cards**? | **Resolved — no.** N1 puts the provenance on the API, so nothing Amy read off that grid is unreachable. B11 builds no page object and asserts no Transfer to Job Cards state. |
| N3 | Which office screen a customer verifies on (`View ▸ Time Cards` vs `Transfer to Job Cards`) | Amy used the former; possibly a module/flag difference in her LAN environment. Not a product requirement B11 asserts either way. |
| N4 | GPS on a crew-out card. The recording shows `(36.8076576, -119.8347626)` on both time-out types, but our envelope controls it. | Carried as an ordinary `gps` field; not a separate requirement. |
| N5 | The `Exceptions` panel (`18 issues`, `17 blocking`, mostly `JobCounter is required on a piece-out TimeCard`, plus `No corresponding Time-In was found within the maximum working period`) | Amy's environment carries unrelated same-day noise from other workflows. Our fixture day is clean, so no exception-count assertion is written. |
| N6 | Whether the office pairs a crew-out time-out with the morning time-in and clears B1's `No corresponding Time-Out/Piece-Out` group | Not shown — Amy never opens Transfer to Job Cards. Deliberately not asserted. |
| N7 | The aborted `Employee … is missing` path (kf 3) | Device-side validation on an action that produced no record. Negative case — out of scope. |
| N8 | `ALL EMPLOYEES` option on `Select Cuadrilla de Trabajo` (kf 23) | A variation Amy did not take. |
| N9 | Tones / audible feedback | No audio in the capture. |

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Connectivity ▸ Import ▸ Internet | `Connectivity ▸ Import ▸ Internet` | `src/pages/connectivity/ImportInternetPage.ts` | exists — the office UI half, driven by `deliverAndVerifyCards` on the internet transport, exactly as in B1/B2/B3/B4 |

**No new page object.** B11 adds no screen. The office UI it exercises is the relay pull
(`pages.leftNav` → `pages.importInternet`), which the internet transport already walks; every
B11 outcome is then asserted on `GET /time-cards`.

For the record, Amy verifies on `View ▸ Time Cards` (`/view/time-cards`) rather than Transfer
to Job Cards — date range, `Apply Filter`, a grid of
`Date · Time · Type · Employee · Crew · Job · Employee Selection`, and a row opening into an
`Edit Time Out` panel. That is a viewing preference, possibly a module/flag difference in her
LAN environment, not a product outcome. The only datum unique to that grid — **Employee
Selection** — is on the API as `employeeSource`, so nothing is lost by not building the page
(see resolved N1/N2).

## Data

Existing Journey B fixture entities only — no new records
(`src/data/journey-b/fixture.ts`):

| Role in B11 | Fixture record |
|---|---|
| Ranch / Field / Job for the morning time-ins | `4001 B1 RANCH` / `4101 B1 FIELD` / `4201 B1 HARVEST` |
| Crew | `5001 B1 CREW` |
| Still-active members (crewed out) | `6001`, `6002` |
| Early leaver (times out individually before the crew-out) | `6003 B1 PRESENT THREE` |
| Not clocked in | `6004 B1 ABSENTEE FOUR` (asserted absent) |

`DAY_OFFSET.B11 = -4` already exists — B11 punches four days back so parallel workers never
collide on the office's duplicate-Time-In rule at `workers=2`.

Times follow the recording's shape (clock-in, early leaver out, crew-out one minute later):
morning time-ins `07:15`, early leaver's `TO` at `15:09`, crew-out `CO` at `15:10`.

## Preconditions

- [x] `DEVICE_RELAY_*` in `.env.dev`; internet relay transport (the code default — do **not**
      set `IMPORT_TRANSPORT=single-folder`, which would skip the WebMail leg entirely).
- [x] Relay gates open (WEBPET-2222: `WEBMAIL_LIVE_SEND_ENABLED` + `ClientRelayRegistration`
      with `LiveSendEnabled=1`).
- [ ] `IMPORT_POLL_TIMEOUT_MS=180000` — the worker claims files on the client's
      `serviceImportInterval` cadence, not on arrival.

## Cleanup

| What | Before the run | After the run |
|---|---|---|
| Fixture punches on the B11 day | `sweepFixtureCards(sessionApi, { employeeIds: [6001, 6002, 6003, 6004 ids], day })` via `deliverAndVerifyCards`' pre-run sweep — **all card types**, so both the Time-Ins (cardType 1) and the Time-Outs (cardType 0) go | — |
| Imported cards | — | `cleanupCards(sessionApi, cards, testInfo)` in a `finally` |
| Office setup records | `seedOfficeFixture` is idempotent — discovered, not recreated | kept |

No SQL, ever — the dev database is unreachable by design; setup and teardown go through the
app's API.

## Test cases

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `B11-001` | Crew-out to individual time-outs | `B11-R4`, `B11-R5`, `B11-R6`, `B11-R7`, `B11-R8`, `B11-R9` | `regression` | 0 → 1 when green |

```ts
test.describe('B11 · Crew-out to individual time-outs', { tag: ['@JourneyB', '@B11'] }, () => {
    test('[Crew Out] Record one crew-out for the crew and verify an individual time-out per still-active member, leaving the early leaver untouched.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B11-001' },
            { type: 'requirement', description: 'B11-R4|B11-R5|B11-R6|B11-R7|B11-R8|B11-R9' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

## Open questions for the tester

None outstanding — N1 and N2 were resolved from source on 2026-08-27; everything else is
recorded above as deliberately out of scope.
