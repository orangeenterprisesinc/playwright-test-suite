# `B2` · Crew move and job change

> **Transport change, 2026-08-12.** `B2-001` no longer drives a device: it builds the envelope a
> device exports *after* a move — movers in the destination, the member left behind unchanged, one
> punch each — and delivers it through the relay. Device-side requirements (`B2-R1`, `B2-R2`,
> `B2-R3`, `B2-R5`) are deferred with the mobile automation; the row now claims `B2-R6|B2-R7`.
> The office half drives the web UI like the recording: sidebar ▸ Connectivity ▸ Import ▸ Internet
> (the relay pull — red on dev until the relay gates + WEBPET-1830 open), then Transfer to Job
> Cards with the date range. `IMPORT_TRANSPORT=single-folder` keeps the direct importer-API path.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `B2` |
| Recording | `docs/media/Journey B2 Crew Move and Job Change.mp4` |
| This plan | `test-plans/journey-b/b02-crew-move-and-job-change.md` |
| Spec | `tests/web/journey-b-field/b02-crew-move.spec.ts` |
| Runner rows | `src/data/runner/journey-b.csv` → `B2-001` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `B2` |
| Journey | `B` — Field harvest day (mobile field capture) |
| Segments | `grower\|perennial-grower` |
| Modules | `Real Time` |
| Surface | `device` — registered as category `workflow`, see `b01-crew-time-in.md` → *Deviation* |
| Demo candidate | no |
| Catalog status | draft |

**Summary** (from the catalog)
> Move the whole crew to a new field or job mid-day with one action, carrying everyone who moved.
> The prior job is automatically closed for those members.

## Catalog steps

| # | Catalog step | What the device actually does | Automatable? |
|---|---|---|---|
| 1 | Select the new field or job and the work crew | **Crew In again** — there is no crew-move screen on the device (verified: no `CrewMove` in AndroidPET). Field/job are set by scanning the destination barcodes | yes |
| 2 | The device lists the crew; uncheck anyone who did not move | the same "Employee Selection" dialog as B1, pre-checked | yes |
| 3 | Save; the move is recorded and the prior job is auto-timed-out for moved members | each mover's **existing Time In is updated in place** to the new field/job — same row, same reference. No second punch, no time-out row | the reassignment: yes. The period closure: no — see below |

### What a move actually writes (measured, not assumed)

Four crew members, one move, one member left behind → **four rows, not seven**:

| `_id` | Employee | Field | Job |
|---|---|---|---|
| 1 | B1 PRESENT ONE | `B2 FIELD EAST` | `B2 PRUNING` |
| 2 | B1 PRESENT TWO | `B2 FIELD EAST` | `B2 PRUNING` |
| 3 | B1 PRESENT THREE | `B2 FIELD EAST` | `B2 PRUNING` |
| 4 | B1 ABSENTEE FOUR | `B1 FIELD` | `B1 HARVEST` |

The movers keep their original `_id` and `Reference` — this is `updateJobInEmployeeRecord`'s
"Field changed" branch reassigning the open punch, not a re-punch. The spec asserts the row count and
the unchanged references precisely because an extra Time In per mover would be a double punch, and
eventually double pay.

### Where the "prior job is closed" actually happens

Time cards are *points in time*; the device never writes a time-out for a move. Closing the previous
period is office-side:

- web-pet's `/scan/crew-move` → `POST /time-cards/crew-move` composes an explicit crew **time-out +
  time-in** pair server-side. That endpoint is a web-only composition — it has no legacy screen and no
  device counterpart, and the device importer has **no `CrewMove` node**: a device move arrives as an
  ordinary `CrewIn`.
- The D4 Transfer to Job Card turns the points into paid periods.

So this plan asserts the device's real contribution (a second Crew In for the movers only) and leaves
period-closure to the journey that owns it. Asserting it here would test a behaviour the device does
not have.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `B2-R1` | When a crew time-in is saved against a different field and job, PET Pocket shall update each selected member's existing Time In to the new field and job. | `B2-001` |
| `B2-R2` | If a member is unchecked when the crew moves, then PET Pocket shall leave that member's existing Time In unchanged. | `B2-001` |
| `B2-R5` | PET Pocket shall keep exactly one open Time In per crew member across a move. | `B2-001` |
| `B2-R3` | While more than one field or job exists, PET Pocket shall leave the field and job slots empty until a barcode selects one. | `B2-001` |
| `B2-R4` | When a crew move is imported, PET Tiger shall close the prior job for the moved members. | — not automatable here: the device writes no time-out; office-side behaviour, see above |
| `B2-R6` | When the post-move punches reach the office, PET Tiger shall link each moved member's time card to the destination field and job, and the member left behind to the original. | `B2-001` — transport substitution as in [b01](b01-crew-time-in.md) |
| `B2-R7` | When the punch day is loaded on Transfer to Job Cards, PET Tiger shall list one row per punch carrying its reference. | `B2-001` |

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| PET Pocket Crew In | `Main menu ▸ Crew In` | `src/pages/device/PetPocketCrewInPage.ts` | exists (shared with B1) |

## Data

`src/data/device/petPocketFixture.ts` carries the destination records B2 needs — `field2`
(`B2 FIELD EAST`, code 4102) and `job2` (`B2 PRUNING`, code 4202) — alongside B1's originals. Their
presence is also what stops the screen pre-filling, which is what makes the move explicit.

## Preconditions

Same as `b01-crew-time-in.md` (SDK/AVD, debug APK, Appium driver, booted emulator, the four
preference keys).

## Cleanup

None: the device is re-seeded from the golden database at the start of every run.

## Test cases

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `B2-001` | Move the crew to a new field and job, leaving one member behind | `B2-R1`, `B2-R2`, `B2-R3`, `B2-R5`, `B2-R6`, `B2-R7` | `regression` | 1 |

One export happens, **after** the move: the app only sends records it has not exported, and a move
rewrites the existing rows rather than adding any, so a single envelope carries the four cards in
their final state. The office half is subject to the same object-storage and analyze-flag conditions
described in [`b01-crew-time-in.md`](b01-crew-time-in.md).

## Open questions for the tester

- [ ] Does the office close the prior period at import, or only when D4 transfer runs? That answer
      decides which journey owns `B2-R4`.
- [x] **Answered by the recording (watched 2026-08-11):** Amy uses **Crew In** (*Hora de Entrada de
      la Cuadrilla*) with the same Employee Selection dialog — 4 of 5 members checked — confirming
      the no-crew-move-screen finding. One nuance her rig adds: her punches were already **exported**
      before the move, and re-punching after an export creates **new** office rows (5 → 9 on her
      Transfer screen) — the in-place update this spec asserts applies to *unexported* records, which
      is the flow this spec runs (capture → move → single export). Both orderings are legitimate; the
      export-then-move variant becomes automatable once the import transport exists.
