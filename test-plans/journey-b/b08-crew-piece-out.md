# `B8` · Crew piece-out

> **Transport, not simulation, happy path only.** As with B1–B12, the spec does not drive a device. It
> builds the `OrangeExportFile` envelope PET Pocket syncs, delivers it through the relay, has the office
> import it on screen (Connectivity ▸ Import ▸ Internet), and then checks what the office did with it.
>
> **Conventions:**
> * One spec, one happy-path `test()`, `testCaseId` `B8`. No negative, edge, boundary or extra-positive
>   cases. No EARS and no `B8-Rn` ids.
> * UI-first: the API is used only for device simulation, read-only reads and cleanup.
> * **The transfer is never committed.** D9 owns the commit, and a transferred card cannot be deleted
>   (DELETE answers 409).
> * On Transfer to Job Cards, scope by **crew only**. Any employee-level scope hides the crew piece-out
>   row by design (WEBPET-2139).
> * Envelopes are built only through `buildEnvelope` / `DEVICE_SCHEMA`. `exportEnvelope.ts` is not edited.
> * Hours/RH (WEBPET-2135) and the meal penalty (WEBPET-2619) are not asserted.

Source: no recording. The manual source is WEBPET-1527, which passed QA on 2026-09-08: "Crew pieces
recorded on a device import correctly and transfer successfully". The office surface was already
measured live for D9 against an imported crew piece-out, so there was no new browser exploration.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `B8` |
| Jira | `PET-12646` (automation) / `WEBPET-1527` (manual) |
| Scenario | `src/data/journey-b/b08-crew-piece-out.json` |
| Spec | `tests/web/journey-b-field/b08-crew-piece-out.spec.ts` |
| Runner row | `src/data/runner/journey-b.csv` → `B8` (`workflow`, `PET-12646`) |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `B8` — Journey B, Field harvest day |
| Segments / modules | `grower\|perennial-grower` / `Piece Payment` |
| Surface | `device`; runner category `workflow` (API and UI in one test, like B6/B11) |

> Record a single piece total for a crew whose output is counted collectively (for example a machine
> line with ground pickers), with per-person distribution deferred. The split to individuals happens at
> Transfer to Job Card.

Variation, out of scope: pack-house uses this for machine crews supported by ground pickers.

## Importer facts (web-pet `importmap/timecard.go`, `timecard_timein_synth.go`, `timecard_crewpopulate.go`)

- **The real device shape** (sample `FromIphone-20240313142926-A02.xml`): a crew piece-out is a
  `<PieceOut>` row in `<PieceOut_Records>`. `<Employee>` and `<EmployeeSource>` are empty;
  `<Crew>`, `<Job>` and `<NumOfPieces>` are set; the reference part is `PO`.
- **How it is stored:** every FK is nullable, so the card gets `EmployeeCounter NULL` and the record is
  not postponed. CardType derives to 0 (Time-Out / piece-out).
- **Exactly one card lands.** Time-in synthesis (WEBPET-1409) runs only for an *employee* piece-out, and
  crew population (WEBPET-1417) returns early when there is no employee.

## Catalog steps → expected outcomes

| # | Catalog step | Where it is checked |
|---|---|---|
| 1 | Record the crew's total pieces. | One employee-less `PieceOut` row arrives; asserted over the read GET. |
| 2 | The time cards show the crew total. | Transfer to Job Cards, scoped to the day and filtered by Work Crew; nothing committed. |
| 3 | Distribution is deferred to Transfer to Job Card (D9). | Job Cards preview tab proposes the per-member split; GET job-cards is still empty. |

**Step 1 — the crew total is captured (`GET time-cards`):**
- The import yields exactly 5 cards for the run's references: 2 crew time-ins (`CI`, cardType 1),
  1 crew piece-out (`PO`, cardType 0) and 2 crew-outs (`CO`, cardType 0).
- The piece-out card has:
  - `employeeCounter` **null**;
  - `crewCounter` = the `B1 CREW` id;
  - `jobCounter` = the `B8 PIECE JOB` id;
  - `numOfPieces` **4**;
  - its reference equals the envelope's `PO` reference.
- The two member time-ins are bound by id to `6001` and `6002` and carry no pieces.
- `B1 CREW` has exactly the run's 5 cards on the day, and exactly one of them has no employee. That
  proves no time-in was synthesized and no per-member piece-out was created.

**Step 2 — the time cards show the crew total (Transfer screen, crew-scoped, before commit):**
- After the day scope, Analyze and Work Crew = `B1 CREW`, the screen offers exactly the run's 5 references.
- `crewPieceOutRows()` equals `[PO reference]`.
- That row reads Employee `—`, Pieces `4`, Type `Piece Out`, Pay by Piece `Yes`.
- The totals strip reads `Pieces 4`.
- The header select-all checkbox is untouched.

**Step 3 — distribution is deferred:**
- The Job Cards preview carries each member's pieces on exactly one card: `B1 PRESENT ONE` and
  `B1 PRESENT TWO`, 2 pieces each.
- The preview totals read Pieces 4 · Employees 2.
- *Measured live 2026-10-15:* `B1 CREW` has an **Exercise Job** (`exerciseJobCounter` 9 = 4000-General,
  10 min). The transfer (web-pet `exercise_job.go`, legacy `CreateExerciseJobCard`) carves the first
  10 minutes of each member's first piece card into a pieceless 4000-General card, so the preview holds
  4 cards: 2 exercise and 2 piece. Only the piece-bearing rows are asserted, and the job-card total is
  not, because it follows crew setup rather than the split.
- `GET job-cards` for the day, filtered to `B1 CREW`, returns 0.
- Every one of the run's cards is still `transferred` false.
- **The Transfer button is never clicked.**

**Not asserted:**

| Item | Status | Reason |
|---|---|---|
| The device-side crew pieces screen | not automatable | Device UI; the office receives the finished row. |
| Commit, written job cards, conservation | deferred | D9 owns them. |
| Employee / Home Crews / Departments scope | not automatable | Hides the crew piece-out by design (WEBPET-2139). |
| Hours, OT buckets, Amount | not asserted | WEBPET-2135, D6 amount defect. |
| Meal penalty | not asserted | WEBPET-2619. The 4-hour day stays clear of meal logic. |
| Uneven split; pack-house variation | deferred | Out of the happy path. |
| `Piece Payment` licence | annotated only | Read from `PT_MODULES` (PET-12689), as in B6. |

## Decisions

1. **Piece job.** Fixture job `4201 B1 HARVEST` is paid by Time with no piece rate. Add one fixture row,
   `entities.pieceJob = { code "4204", name "B8 PIECE JOB", paymentType "Piece", pieceRate 1, hourlyRate 1 }`.
   - It is ensured **on screen** through `ensureJobOnScreen` (`src/utils/fixtureRows/ensureOnScreen.ts`);
     existence is a GET.
   - `hourlyRate 1` follows the D-journey "rate-less job transfers to 0 cards" lesson.
   - The `B8 ` prefix is protected by `PROTECTED_NAME_PATTERNS`.
   - Free code on dev is verified on the first run; `ensureOnScreen` throws on a code/name clash.
2. **Crew, members and day.** `5001 B1 CREW`, members `6001 B1 PRESENT ONE` and `6002 B1 PRESENT TWO`,
   **`dayOffset -17`**.
   - Offsets 0…−16 are taken: B 0…−9, C6 −10, D6 −11, D9 −12, D10 −13, E2 −14, D3 −15, D5 −16.
   - −17 is inside `maximumDaysForTransferExport` 21.
3. **Envelope.** Every record has ranch `4001`, field `4101`, job `4204`:

   | # | node / part | time | employee | notes |
   |---|---|---|---|---|
   | 0 | `TimeCard` / `CI` | 07:00 | `6001` | source `Crew`, crew `5001` |
   | 1 | `TimeCard` / `CI` | 07:00 | `6002` | as #0 |
   | 2 | `PieceOut` / `PO` | 10:00 | **none** | crew `5001`, `pieces 4` |
   | 3 | `TimeOut` / `CO` | 11:00 | `6001` | source `Crew`, crew `5001` |
   | 4 | `TimeOut` / `CO` | 11:00 | `6002` | as #3 |

   - **The crew-outs are required.** With no time-out, the day plans 0 job cards (measured on D6/D9).
   - **4 pieces.** `maximumNumberOfPieces` is 5 on dev. The spec reads the preference and fails loudly
     if 4 falls outside the min/max.
   - **Even split.** A shared crew-in and crew-out means every split rule gives 2/2 (WEBPET-2850).
   - **Timing.** The piece-out is 3 h after the time-in, inside the 8 h MaxMultiplePieceOutInterval
     (WEBPET-2620).
   - **Employee tags omitted (tester decision).** The PieceOut row omits `Employee` and `EmployeeSource`
     instead of sending them empty. The builder cannot emit an empty tag, and an absent tag imports the
     same way (nullable FK → NULL). The `employeeCounter === null` assertion would catch an
     Undefined-Employee fallback.
   - **References are 25 chars (tester decision)**, like every green B1–B12 import. 26 is what fails
     with SQL 8152.
4. **Transfer scope.** Use the grid's Work Crew column filter (`filterByCrew`). It filters on the card's
   own crew, keeps the employee-less row and recomputes the strip (measured on D9).
5. **Independence (tester decision).** B8 must run at any time with no other spec before it.
   - Its fixture rows are ensured, never assumed.
   - Its day is its own.
   - The before-phase sweep is extended by **reuse**: `sweepFixtureCards` takes an optional `crewIds`,
     and the `timeCards` cleanup step an optional `crewCodes`. With them set, it also deletes the
     fixture crew's **employee-less** cards on the day, i.e. a hard-killed run's leftover crew
     piece-out.
   - The new fields are optional, so every existing step is byte-identical.

## Changes (smallest, additive, null-guarded)

- **`src/data/schemas/journeyBFixture.ts`**
  - Add a `PieceJob` entity schema: `paymentType 'Piece'`, positive `pieceRate` and `hourlyRate`.
  - Add `entities.pieceJob`.
- **`src/data/journey-b/fixture.json`**
  - Add `entities.pieceJob` and one `_notes` line.
- **`src/data/schemas/journeyBScenario.ts`**
  - `ExpectedCardJsonSchema.employeeCode` becomes nullable. `null` means "the office stores no
    employee".
  - Optional `fixtureRowsOnScreen: ['pieceJob']`.
  - The `preconditions` enum gains `'pieceLimits'`.
  - Optional strict `expected.transfer`: `members`, `crewEmployeeCell`, `pieceOutType`, `payByPiece`,
    `piecesTotal`, `piecesPerMember`, `jobCards`.
  - `superRefine`:
    - a `null` employee must point at an employee-less piece-out record;
    - `piecesPerMember × members = piecesTotal` = the sum of the employee-less piece-out pieces;
    - `jobCards = members`;
    - `transfer` requires `fixtureRowsOnScreen` to include `pieceJob`.
- **`src/data/schemas/cleanupStep.ts`**
  - `timeCards` gains an optional `crewCodes: string[]` (min 1).
- **`src/utils/api/timeCardsApi.ts`**
  - `sweepFixtureCards` accepts an optional `crewIds`. A card also matches when `employeeCounter` is
    null and `crewCounter` is in `crewIds`.
  - The doc comment gains one line.
- **`src/utils/cleanup/runCleanup.ts`**
  - `sweepBefore` maps `crewCodes` to ids. It accepts only the seeded office crew's code and throws on
    any other code, like the employee path.
- **`src/utils/api/officeFixture.ts`**
  - Type only: `pieceJob?: EnsuredRecord`.
- **`src/utils/api/officeVerification.ts`**
  - `ExpectedCard.employeeCode` and `employeeId` become nullable.
  - Null ids are skipped in `groupByContext`, the sweep list, the `byEmployee` fallback and the panel
    lookup. A crew piece-out always has a reference, so the reference path is used.
- **`src/utils/journeys/journeyBFlow.ts`**
  - `runJourneyBScenario`: when `fixtureRowsOnScreen` includes `pieceJob`, call `ensureJobOnScreen`.
    Throw if `pages` is absent.
  - `resolveExpectedCards`: add the piece job to the jobs map; a `null` employee code gives
    `employeeId null`.
  - `hookEmployeeIds` filters out nulls.
  - `journeyBPreconditions`:
    - add `'pieceLimits'`, read from `minimumNumberOfPieces` / `maximumNumberOfPieces`;
    - annotate `pieceOutIncludesOnlyTimeInEmployees` and `distributeCrewPiecesByHours` as read, never
      written.
  - `assertExpectedCards`: the expected id is `null` for a `null` employee code.
  - New thin helpers. They do **not** import `journeyDFlow` (lint ban).
    - `crewCardsOnDay(run)`: `listTimeCards(day)` filtered to the fixture crew.
    - `memberName(run, code)`.
    - `openCrewTransferCandidates(pages, run)`:
      1. `goto`, then `scopeToDay`, then `analyzeCandidates`, then `filterByCrew`;
      2. poll until the candidates equal the run's references;
      3. roster guard: throw, naming both sets;
      4. never select, never transfer.
    - `crewJobCardsOnDay(run)`: `listJobCards(day)` filtered to the fixture crew.
- **No change** to `exportEnvelope.ts`, `TransferToJobCardsPage.ts` or `JobCardsPage.ts`.

## Scenario cleanup

```json
"cleanup": [{ "kind": "timeCards", "employeeCodes": ["6001", "6002"], "crewCodes": ["5001"], "dayOffset": -17 }]
```

- **Before:** sweep the members' cards and the crew's employee-less cards on day −17.
- **After:** delete the run's 5 cards by id. They are never transferred, so every delete succeeds.
- `B8 PIECE JOB` is a permanent fixture row and is never deleted.

## API allowances

On-screen steps have no row here: the New Job form, Import ▸ Internet, the date scope, Analyze, the
Work Crew filter, the Job Cards tab, the open-card and Transferred reads (Transfer to Job Cards) and the
no-job-card proof (View ▸ Job Cards, member rows only).

| Call | Endpoint | Allowance |
|---|---|---|
| module / preference gates | `GET session/me`, `GET preferences` | read |
| fixture existence | `GET ranches/fields/jobs/crews/employees` | read |
| binned piece job restore | `POST jobs/{id}/restore` (inside `ensureOnScreen`) | cleanup |
| before sweep | `GET time-cards` → `DELETE time-cards/{id}` | cleanup |
| envelope push | relay `UploadFile` | device |
| import read-back (reference poll, ids for cleanup) | `GET time-cards?from&to` | read |
| teardown | `DELETE time-cards/{id}` | cleanup |

No API write creates or edits a setup record, and there is no transfer execute, reverse or job-card delete.

## Test case

| id | Title | Tags |
|---|---|---|
| `B8` | Crew piece-out | `@JourneyB @B8 @Regression` |

Title: `[Crew Piece Out] Deliver one crew piece-out with no employee and verify the office holds the crew
total on one card, with the per-person split only proposed at transfer.`

Imports: `@fixtures/base.fixture`, `@data/schemas/journeyBScenario`, `@utils/data/scenarioLoader`,
`@utils/journeys/journeyBFlow`.

1. **Load and gate.** Run `loadScenario` and `journeyBPreconditions`. Assert
   `pieceLimits.minimum ≤ 4 ≤ pieceLimits.maximum`, with both values in the message.
2. **Deliver.** `runJourneyBScenario`: ensures the piece job on screen, sweeps, builds and sends the
   envelope, imports on screen, verifies the 5 cards by reference.
3. **Envelope.**
   - `send.success`.
   - `sections`, `referenceParts`, `employeeSources`, `pieceCounts` equal the expected values.
   - The `PieceOut` section carries no `Employee` / `EmployeeSource` tag.
4. **Step 1.**
   - `assertExpectedCards`.
   - The piece-out card: employee null, crew / job / pieces / cardType / `PO` part as expected.
   - `crewCardsOnDay` equals the run's cards, and has exactly one employee-less card.
5. **Step 2.**
   - `openCrewTransferCandidates`.
   - `crewPieceOutRows`, then the row cells `—` / `4` / `Piece Out` / `Yes`.
   - `piecesTotal` 4; select-all not checked.
6. **Step 3.**
   - `openJobCardsTab`; preview has 2 rows, 2 pieces each, totals 4 / 2 / 2.
   - `openTimeCardsTab`.
   - `crewJobCardsOnDay` is 0, and every card is untransferred.
7. **Teardown.** The scope's after-phase `runCleanup`.

## Validation

- `npm run typecheck`, `npm run lint`, `npm run runner:sync`, `npm run runner:check`,
  `npm run ui-first:audit -- --strict`, and `npm run webpet:runner:check` (shared `src/utils` touched).
- `npm run test:dev -- --grep @B8` with `UI_FIRST_GUARD=enforce`, green twice.
- Regression of the shared changes:
  `npm run test:dev -- tests/web/journey-b-field/b06-badge-piece-out.spec.ts tests/web/journey-b-field/b11-crew-out.spec.ts`.

## Risks (for the Healer)

- **Polluted day −17.** List the day's cards first (the fixture-day-poisoning lesson). Never loosen an
  assertion.
- **`hourlyRate 1` and the preview.** If it splits each member into hours and piece rows, keep the
  per-member pieces sum and the totals, and drop only the row count after confirming live. Never weaken
  the 2/2 split.
- **Merge conflict.** `fix/fixture-day-reconcile` (unmerged) also edits `timeCardsApi.ts`; whichever
  merges second rebases.
