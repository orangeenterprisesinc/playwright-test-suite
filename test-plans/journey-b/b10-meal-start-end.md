# `B10` · Meal start and end (field)

> **Transport, not simulation — happy path only.** As with B1/B2/B3 the spec does not drive a
> device. It builds the `OrangeExportFile` envelope PET Pocket syncs, delivers it through the
> relay, imports it, and verifies the office side by id and on screen.
>
> **The recording overturns the wire-format assumption in the master plan.** That plan expected a
> meal to arrive as `<UnpaidBreakCard_Records>` (the `BreakCard` table). It does not. On this
> device build the meal is captured on two dedicated screens — **Empezar Almuerzo** (start lunch)
> and **Terminar Almuerzo** (end lunch) — and each produces an ordinary **Time In** `TimeCard`
> record with reference part `TI`: the start on the **meal job** (`0 - Lunch`), the return on the
> **work job** (`Harvesting - Coachella`). Nothing reaches the `BreakCard` table, and the office
> renders both rows in the ordinary Time In panel (kf 47, 79, 89, 95, 97). The whole workflow is
> therefore expressible with the existing `TimeCard` envelope shape — no break-card groundwork.
>
> The 30-minute minimum is enforced **on the device only**, and it **blocks** rather than flags.
> Recorded below as not automatable via XML, with the exact message.

Source: `docs/media/journey-b/b10-meal-start-end.mp4` (Jira WEBPET-1529 attachment 66887,
141.4 s, 1920×1080) → `.video-annotations/b10-meal-start-end/` — 98 keyframes, 49 action
(11 force-sampled), `Max gap 5.0s of 5.0s allowed`, not capped.

First dev run: 2026-08-27, green in 86 s with `IMPORT_TRANSPORT=single-folder` and **no**
`OFFICE_TRANSPORT_SUBSTITUTE` — relay push HTTP 200, import run `328` `completed`
(file `completed`, empty message), `programCreated=true` on all three cards. The only annotation
was `gps-not-rendered-in-panel` (see N4).

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `B10` |
| Jira | `PET-12648` (automation) / `WEBPET-1529` (manual test, read-only source) |
| Recording | `docs/media/journey-b/b10-meal-start-end.mp4` |
| This plan | `test-plans/journey-b/b10-meal-start-end.md` |
| Spec | `tests/web/journey-b-field/b10-meal-start-end.spec.ts` |
| Runner rows | `src/data/runner/journey-b.csv` → `B10-001` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `B10` |
| Journey | `B` — Field harvest day (mobile field capture) |
| Segments | `grower\|perennial-grower` |
| Modules | `Real Time` |
| Surface | `device` — spec lives in `tests/web/journey-b-field/`, runner category `workflow` (API + UI in one test, like B1/B2/B3) |
| Demo candidate | no |
| Catalog status | draft |

**Summary** (from the catalog)
> Capture an unpaid meal, which by law requires both a start and a return punch and a minimum
> length. Devices can enforce the minimum so an early return does not trigger a penalty.

## Catalog steps

| # | Catalog step (ticket wording) | What the recording shows | Automatable? |
|---|---|---|---|
| 1 | Record the meal start. | Device main menu carries four break/meal tiles — `EMPEZAR DESCANZO`, `END BREAK`, `EMPEZAR ALMUERZO`, `TERMINAR ALMUERZO` (kf 21). Amy opens **Empezar Almuerzo**: date `08/10/2026`, a time picker she sets from 3:42 PM to **10:00 AM**, `Trabajo` fixed at **`0 - LUNCH`**, `Empleado` scanned by badge (kf 1–11). Three employees saved; the device list becomes `PET Time In Recs (9) Emps (3)` with three entries `08/10/2026 10:00 AM · Rancho: AVI-COA-Grape · Campo: Abs - Sweet Globe · Trabajo: 0 - Lunch · Cuadrilla: 254 Ronaldo Medrano` (kf 15). A meal start for an employee with no Time-In is refused: **"Missing TimeIn Before Lunch"** (kf 13). | **yes** — one `TimeCard` Time In record, part `TI`, `<Job>` = the meal job |
| 2 | Attempt a return before 30 minutes; confirm it is blocked or flagged. | On **Terminar Almuerzo** (no `Trabajo` field — only date, time, `Empleado`) Amy sets **10:29 AM** against the 10:00 start and scans the badge. The device refuses with a modal: **"Cannot return to work. Break too short. You can only return at 08/10/2026 10:30 AM Gonzalez Sandoval,Victor J"** (kf 71). Ending a meal for someone who never started one is likewise refused: **"Missing Lunch Seranno Torres,Jose W"** (kf 63). | **no** — the check runs on the device before any record exists, so nothing is exported to assert on |
| 3 | Record the meal end after the minimum. | Amy re-sets the time to **10:30 AM** and the scan is accepted (kf 75). The device list becomes `PET Time In Recs (12) Emps (3)` and the new entries read `08/10/2026 10:30 AM · … · Trabajo: `**`Harvesting - Coachella`** — the worker is returned to the prior job, not to the lunch job (kf 79). After `EXPORTAR`/sync the office grid goes 15 → 18 records with references `0000033/34/35-260810-`**`TI`**`-S34-ui`, `8/10/2026, 10:30:39 AM`, `Time In`, job `Harvesting - …` (kf 95). | **yes** — a second `TimeCard` Time In record, part `TI`, `<Job>` = the work job |

**Office side, across the two syncs.** After the first sync the three meal-start rows appear as
`Time In` / job `0 - Lunch` / `Barcode Badge` and carry status **Warning** while the meal is still
open (kf 47). After the second sync lands the returns, the same three rows read **Ready** and the
warning has moved to the 10:30 return rows, which are now the day's open punches (kf 89). The
issues panel stays at **2 groups** throughout, one of them `JobCounter is required on a piece-out
TimeCard` — **no meal, lunch or break issue group ever appears** (kf 43, 47, 89).

**The Time In panel for a meal-end row** (`0000034-260810-TI-S34-ui`, kf 97): `Reference`
read-only, `Date / Time` `08/10/2026 10:30 AM`, `Employee Selection` `Barcode Badge` read-only,
`Ranch` `AVI-COA-Grape`, `Field` `Abs - Sweet Globe`, **`Phase` `Harvesting - Coachella`**,
`Employee` `Montoya Martinez, Moises R`, `Work Crew` `254 Ronaldo Medrano`, `Run` —,
**`GPS Reading` `(36.80767, -119.8348178)`**, `Memo` empty, `Questions` "No questions recorded.",
`Transferred` `No`, `Unedited` `Yes`, `Traceability` empty. Every one of these is already a helper
on `TransferToJobCardsPage`. Note the panel **does** render GPS Reading on this build.

**Device stamps its own seconds.** Amy picks 10:00 and 10:30; the office stores `10:00:32` and
`10:30:39` — the save instant, not the picked minute (kf 95). The spec controls the seconds
directly, so it asserts exact equality with what it sent.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `B10-R1` | When a device export delivers a Time In record whose `Job` is the meal job, PET Tiger shall store one time card of type Time In linked to that job, retrievable by the record's own `Reference`. | `B10-001` |
| `B10-R2` | When a device export delivers a meal-return Time In record whose `Job` is the work job, PET Tiger shall store a second time card of type Time In linked to the work job, distinct from the meal-start card. | `B10-001` |
| `B10-R3` | When a meal start and its return are delivered for one employee, PET Tiger shall link both cards to that employee's counter and to the same punch day. | `B10-001` |
| `B10-R4` | When a meal start and its return are delivered, PET Tiger shall store each card's date and time exactly as delivered, so that the stored return is 35 minutes after the stored start. | `B10-001` |
| `B10-R5` | Where the export is delivered by device import, PET Tiger shall mark both cards program-created and preserve each record's `GpsReading` verbatim. | `B10-001` |
| `B10-R6` | When the Transfer to Job Cards date range covers the punch day, PET Tiger shall display a row per delivered record and shall display the meal-start row's job in the Time In panel's `Phase` field. | `B10-001` |
| `B10-R7` | While a meal start and its return are both present for the day, PET Tiger shall raise no meal, lunch or break issue group on Transfer to Job Cards. | `B10-001` |
| `B10-R8` | If a meal return is attempted before the configured minimum meal length has elapsed, then PET Pocket shall refuse the punch and display the earliest permitted return time. | — not automatable: the device blocks before a record exists, so nothing is exported. Observed wording (kf 71): "Cannot return to work. Break too short. You can only return at 08/10/2026 10:30 AM Gonzalez Sandoval,Victor J". Preferences are `ChkMinBreakTime` and `DefaultUnpaidBreakLength` (`AndroidPET/.../conf/PetPreferences.java:971-972, :1029-1040`) |
| `B10-R9` | If a meal start is attempted for an employee with no Time-In that day, then PET Pocket shall refuse the punch. | — not automatable: device-side. Observed wording (kf 13): "Missing TimeIn Before Lunch" |
| `B10-R10` | If a meal return is attempted for an employee with no meal start, then PET Pocket shall refuse the punch. | — not automatable: device-side. Observed wording (kf 63): "Missing Lunch Seranno Torres,Jose W" |
| `B10-R11` | PET Tiger shall enforce no minimum meal length at import. | — not automatable as a positive assertion: the importer has no meal rule at all (see Wire format below). A too-short meal is flagged only by the job-card **penalty engine**, whose thresholds are `PenaltyRule.RequiredNetHoursForBreak` database config rather than a fixed 30 minutes, and which needs a complete time pair over the net-hours threshold plus `PenaltyRule` rows on dev |
| `B10-R12` | PET Tiger shall route the real-time meal-start broadcast between devices in a scan-device group. | — not automatable: `MealStart_Records` / `LastTimeOut_Records` (`AndroidPET/.../record/MealStartRecord.java`, `sync/ExportMealStartAndTimeOut.kt`) is registered nowhere in web-pet's importer, so the cloud office cannot receive it. This is the channel the step-2 block depends on |

## Wire format (established read-only from source, before the Planner runs)

Citations are file + symbol in `orangeenterprisesinc/web-pet` and `orangeenterprisesinc/AndroidPET`.

* **What B10 actually sends** — `TimeCard` records, exactly the shape `b03` already builds:
  reference part `TI`, `EmployeeSource` `BarcodeBadge`, `DateIn`/`TimeIn`, `Employee`, `Crew`,
  `Job`, `Ranch`, `Field`, `GpsReading`. The only thing that makes a record a meal punch is
  **which job it names**. Confirmed by the office references in kf 95 (`…-TI-S34-ui`) and the
  Time In panel in kf 97.
* **Why not `BreakCard`** — the break-card import path is real
  (`importmap/register.go:253-261` registers one mapper under `BreakCard` (paid) and
  `UnpaidBreakCard` (meal); `importmap/breakcard.go` derives paid/unpaid from the node name unless
  an explicit `<IsPaidBreak>` column overrides it; rows land in the `BreakCard` table served by
  `GET /break-cards`, `DELETE /break-cards/{id}`). It is simply **not the path this device screen
  uses** — it is the office's own Input ▸ Meal screen and the crew-break flow. The `Show meal`
  toolbar button on Transfer to Job Cards stays greyed out for the whole recording.
* **No import-time meal rule.** `breakCardPreSave` enforces only *end after start*
  (`"EndDateTime (…) should be after StartDateTime (…)"`); a search for `MinimumMealLength` /
  `VerifyMinimumMeal` over web-pet returns nothing. Meal penalties live in
  `input/compute/transfer/penalty.go`, whose own header states "The thresholds are CONFIG, not
  statute … the algorithm reads its thresholds from `PenaltyRule.RequiredNetHoursForBreak`".
* **No meal warning in the transfer catalog.** `input/compute/transfer/combine.go` carries exactly
  three exceptions — `warn.incomplete_time_in` ("No corresponding Time-Out/Piece-Out(without
  Job)/Crew-Piece-Out was found"), `warn.dangling_time_out`, `warn.zero_net_time` — and no
  break/meal exception, which is why `B10-R7` is written as a negative.
* **Candidate product defect, not exercised here.** `DBRecordsLayer.getDateAndTimeColumns` pairs
  `StartDate` with **`EndDate`** (not `StartTime`) for the four break record types, and on a
  CloudPet build `ExportTableItem.convertDateTimeColumns` removes both source elements and writes
  `date + "T" + time` — so a break-card export would appear to carry a malformed `StartDateTime`.
  Source reading only, never observed on a run, and outside B10's path because this device screen
  emits `TimeCard` rows. Worth a PET ticket (component Cloud, assignee Gukan) if the office ever
  needs to ingest device break cards.

## Not established (Planner resolves against dev before generation)

| # | Question | Why it matters |
|---|---|---|
| ~~N1~~ | ~~Does a meal-start Time-In flip from **Warning** to **Ready** once the return lands?~~ **Moot for this spec.** `B10-R7` was kept as a pure "no meal/lunch/break issue group" negative and the spec asserts no per-row status at all, so the transition never has to be pinned down. Left unasserted deliberately: it is a job-card-pairing behaviour, not a meal-import one. `verifyImportInOffice`'s blanket `/Warning/i` is wrong for B10 either way, which is why the spec composes the UI half itself. | — |
| N2 | Is the office's meal job identified by configuration (`Preferen` `UnpaidBreakJob`) or is any job acceptable as the meal job for import and display? | Decides whether the fixture's new meal job needs a preference write. The spec must **not** write preferences (B7 precedent). |
| ~~N3~~ | ~~The `Real Time` module key as `GET session/me` reports it.~~ **Resolved from code (Planner, 2026-08-27):** the journey suite's module gate is declarative, not in-spec — the runner CSV's `modules` column plus `evaluateScope` (`src/config/scope.ts`). `Real Time` is in `CORE_MODULES` (`src/data/static/shared/modules.ts:80`), "the base engine every instance has", so it can never be the module missing from a scope. B10 needs **no** in-spec gate or annotation, exactly like B2/B3. | — |
| ~~N4~~ | ~~Does the deployed office build render `GPS Reading` in the Time In panel?~~ **Resolved by the first dev run (2026-08-27):** it does **not** — the run recorded a `gps-not-rendered-in-panel` annotation. kf 97 shows the field populated on Amy's build, so this is a deployed-bundle difference, matching the B1–B4 precedent. The soft-assert-plus-annotation posture is correct and stays; the card-level GPS assertion in `deliverAndVerifyCards` is the authoritative one. | — |
| ~~N5~~ | ~~Does a Time-In on the meal job need a `Department`, `Run` or other field the panel shows as `—`?~~ **Resolved by the first dev run:** no. All three cards imported, the import run reported `completed` with an empty message, and the rows rendered as transfer candidates rather than blockers. | — |

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists — grid, date range, Time In panel (`panelRanchValue`, `panelFieldValue`, `panelPhaseValue`, `panelEmployeeValue`, `panelWorkCrewValue`, `panelGpsValue`), `rowStatus`, `issueGroupAffectedCount` |
| Left navigation | — | `src/pages/shell/LeftNavPage.ts` | exists |

One additive helper needed: **`issueGroupTexts(): Promise<string[]>`** on
`TransferToJobCardsPage` — expand the issues panel and return each `listitem`'s text — so
`B10-R7` can assert the **absence** of a group class rather than the presence of one.
`issueGroupByText` can only match a group you already know the name of.

## Data

Existing `JOURNEY_B_FIXTURE` covers ranch `4001`, fields `4101`/`4102`, jobs `4201`/`4202`,
crew `5001`, employees `6001`–`6004`. B10 adds one record:

| Value | Code | Name | Why |
|---|---|---|---|
| meal job | `4203` | `B10 LUNCH` | the job a meal-start Time In names, the office's `0 - Lunch` equivalent. `4201`/`4202` are B1/B2 work jobs and must keep their meaning. |

`DAY_OFFSET.B10 = -3` already exists, so B10's punches never share an employee-day with B1 (0),
B2 (−1) or B3 (−2) under `workers=2`. Employee `6001` on that day is B10's alone.

Times: Time-In **07:15**, meal start **12:00**, meal return **12:35** — a 35-minute meal, over the
30-minute minimum the recording demonstrates, and deliberately not a round 30 so an office-side
rounding or clamp would show up.

## Preconditions

- [x] Office records exist under the codes the envelope references — `seedOfficeFixture`, extended
      with the meal job.
- [x] The worker is clocked in — the envelope's own 07:15 Time-In record, which is also what the
      device requires before it will accept a meal start (`B10-R9`).
- [ ] `Real Time` module licensed on dev — read and annotated, never skipped (N3).
- No preference writes. B7's rule stands: this suite reads preferences and gates on them, it
  never writes them.

## Cleanup

No SQL, ever. Everything through the app's API.

| What | Before the run | After the run |
|---|---|---|
| Fixture time cards for employee `6001` on the B10 day | `sweepFixtureCards(sessionApi, { employeeIds: [id6001], day, cardTypes: [CARD_TYPE.timeIn] })` — removes orphans from an earlier run whose import landed after its poll timed out | — |
| The three imported time cards | — | `cleanupCards(sessionApi, cards, testInfo)` in a `finally`, best-effort, attaching whatever could not be deleted |
| Office setup records (ranch, fields, jobs, crew, employees) | `seedOfficeFixture` is idempotent — looked up by code, created only when missing | **kept** — a stable QA fixture, as for B1–B4 |

`cleanupCards` is used directly rather than through `verifyImportInOffice` because B10 composes
its own UI verification (see below), so it owns its own teardown.

## Implementation shape

`deliverAndVerifyCards` gives the API half unchanged — pre-run sweep, single-folder import,
`findByReferences`, id equality, `programCreated` and GPS per card. B10 then does its **own**
Transfer to Job Cards pass instead of calling `verifyImportInOffice`, because that helper asserts
every row shows `Warning` (`officeVerification.ts:480`), which kf 89 shows is wrong once a meal is
closed. `deliverAndVerifyCards` and `cleanupCards` are exported standalone for exactly this case
(`officeVerification.ts:275-279`).

`ExpectedCard.reference` already lets three cards for one employee be matched individually
(`officeVerification.ts:339`), as B3 does with two — so `deliverAndVerifyCards` needs no change.

No change is needed to `exportEnvelope.ts`, `timeCardsApi.ts` or `officeVerification.ts`.

**Do not set `OFFICE_TRANSPORT_SUBSTITUTE=1` for this spec.** In that opt-in fallback
`groupByContext` (`officeVerification.ts:127-142`) collapses the 07:15 clock-in and the 12:35
return — they share field and job — into one group and `substituteTransport` writes a single punch
at a hard-coded 07:15, silently dropping the return. Pre-existing, unreachable on the happy path,
and not worth changing for a route that never proves an import anyway.

## Test cases

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `B10-001` | Meal start and end (field) | `B10-R1`, `B10-R2`, `B10-R3`, `B10-R4`, `B10-R5`, `B10-R6`, `B10-R7` | `regression` | 1 |

```ts
test.describe('B10 · Meal start and end (field)', { tag: ['@JourneyB', '@B10'] }, () => {
    test('[Meal] Deliver a meal start on the meal job and its return on the work job, and verify both punches.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B10-001' },
            { type: 'requirement', description: 'B10-R1|B10-R2|B10-R3|B10-R4|B10-R5|B10-R6|B10-R7' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

## Open questions for the tester

- [ ] The master plan's per-workflow design row for B10 (`UnpaidBreakCard` start/end, "end − start
      ≥ 30 min", "no missing meal return warning") is superseded by this plan. B9 (paid break) is
      the same class of record — `EMPEZAR DESCANZO` / `END BREAK` on the same device menu — so it
      will very likely be Time-Ins on a break job too, not `BreakCard_Records`. Worth revisiting
      that row before B9 is prompted.
- [ ] `Show meal` on the Transfer to Job Cards toolbar is greyed out for the entire recording. If
      it is meant to surface `BreakCard` rows, nothing in this workflow populates them.
