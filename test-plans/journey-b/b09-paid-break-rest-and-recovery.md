# `B9` · Paid break (rest and recovery)

> **Transport, not simulation. One happy path.** As in B1–B12, the spec does not drive a device. It builds the `OrangeExportFile` envelope that PET Pocket syncs, relays it, imports it on screen (Connectivity ▸ Import ▸ Internet), and then proves the claim on **Transfer to Job Cards ▸ Job Cards** (the pre-commit preview). There the transfer engine turns a break start that has no return punch into a break card of the configured length, followed by an automatic return to the prior job.
>
> **The device sends no return punch and no break card.** The wire carries a work Time In, a Time In on the paid-break job, and the end-of-day Time Out. Anything that appears at the break's end is the program's doing.

Source: no recording for B9. Engine behaviour comes from the web-pet transfer source (`break_card_resume*.go`, `break_resume_ladders.go`, `breakcard.go`). Settings were measured live on 2026-10-28 (app.ptdev.xyz, `su`, read only, nothing changed). D10 (`test-plans/journey-d/d10-exercise-and-auto-break-split.md`) is the office-side twin: same engine path, punches entered in the office, commit included.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `B9` (:654-677) |
| Jira | `PET-12647` (automation) / `WEBPET-1528` (manual test, Done, read-only) |
| Recording | — none |
| This plan | `test-plans/journey-b/b09-paid-break-rest-and-recovery.md` |
| Spec | `tests/web/journey-b-field/b09-paid-break-rest-and-recovery.spec.ts` |
| Scenario | `src/data/journey-b/b09-paid-break-rest-and-recovery.json` |
| Runner row | `src/data/runner/journey-b.csv` → `B9` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `B9` |
| Journey | `B` — Field harvest day (mobile field capture) |
| Segments | `grower\|perennial-grower` |
| Modules | `Real Time` (a core module, so no in-spec gate is needed; same as B10, N3) |
| Surface | `device`. The spec goes in `tests/web/journey-b-field/`. Runner category becomes **`workflow`** (it was `api`) because the spec verifies in the UI, like B8/B10 |
| Demo candidate | no |
| Catalog status | draft |

**Summary** (from the catalog)
> Capture a paid rest break, which by law records that the break was given but needs no return punch. The program supplies the configured length and returns the worker to the prior job.

## Catalog steps

| # | Catalog step | Where it happens | Automatable? |
|---|---|---|---|
| 1 | Record the break start. | Device: a Time In on the paid-break job (see Wire format). It reaches the office through the relay and the on-screen Internet import. | **yes**: one `TimeCard` record, part `TI`, `<Job>` = the paid-break job |
| 2 | The program applies the configured break length (typically 10 minutes) from the crew record or preference. | Transfer engine `boundRealBreakCards` → `lengthForCard`. The ladder is Job default (>0) → Crew `Break Lengths` → Preference `Paid-break Length Minutes`. Seen on Transfer ▸ Job Cards tab. | **yes, on screen, before any commit** |
| 3 | The worker is auto-returned to the prior job with no return punch required. | Same engine pass. Auto-return ladder is Crew `Auto Return from Break` → State → Preference `requireReturnFromBreakTimeIn` (dev: `FromPaidBreakAndMeal`). It emits a synthetic resume Time In on the previous work job at break start + length. | **yes, on screen**: a card on the prior job starting exactly at the break end, with no punch at that minute |

## Wire format (decided from source + B10 evidence)

* **The break start is a `TimeCard` `TI` on the paid-break job, not a `BreakCard`.**
  - `breakcard.go` `breakCardPreSave` (:192-195) rejects a `BreakCard` unless Start, End *and* Length can all be derived. So a start-only break cannot be represented as a BreakCard.
  - A BreakCard that carries a Length means the *device* applied the length, which contradicts step 2.
  - The program-side bounding and auto-return operate only on "a real Time-In on the deployment … paid-break job (prefs.PaidBreakJob)" (`break_card_resume_real.go` header and :183-332). BreakCard rows are not inputs to it.
  - B10's recording shows the break tiles (`EMPEZAR DESCANZO` / `END BREAK`) beside the meal tiles, and the meal tiles emit plain `TI` TimeCards. Dev has `showPaidBreakScreens = true`.
  - `useBreakCardForPaidBreakInKiosk = true` applies to the Kiosk, not to PET Pocket field capture.
* **A closing punch is required.** Without a later punch the engine has no closer and does not bound the break (`boundOneRealBreak`: `closer == nil → return nil`). The day therefore ends with a `TimeOut`/`TO`. That is the end of the shift, not a return from break.
* **Times:** 07:00 TI on the work job, **09:00** TI on the break job, **10:45** TO. Seconds are `:00`.
  - Every punch sits on a 15-minute boundary. Dev rounds with `roundingByStartTimeAndEndTime = true` and `timeRoundingFactor = 15`, so punch rounding cannot move anything.
  - The break end (09:10) is deliberately *not* on a quarter. The engine publishes it as `AutoReturnBreakEnd`, which is re-derived as rounded start + length and is not grid-rounded. This makes B9 a direct regression check of the 09-02 QA finding "Paid Breaks are defaulting to 15 minutes rather than 10".
  - The day is 3 h 45 min, under `employeeMealStart = 4`, so no meal rule can fire.
* **The Part-A gate is not what makes the break.** `CreateBreakCardFromTimeIn` (Crew → State → No) is consulted only through `paidBreakLookups.gateForCard`, which the crew auto-break injector uses. `boundRealBreakCards` classifies a physically punched break only by `PaidBreakJob`/`ZeroTimeBreakJob` (`breakJobCounters(prefs)`). B9 still sets `Everyone` on its crew because that is D10's measured working configuration and legacy's. It costs nothing and does not depend on this reading of the source.

## Settings lever and concurrency decision

**Chosen: designate the tenant `Paid Break Job` on screen, under one cross-worker lock that D10 shares.**

* **State lever: rejected.**
  - `B1 FIELD` (99) has `stateCounter: null`.
  - The Setup menu has no State screen, so it cannot be set on screen.
  - `State.PaidBreakJobCounter` (`loadStatePaidBreakJobs` → `paidBreakJobForField`) feeds only the injector. Real punches are classified by preferences only.
* **Arm 3 (a job with its own Default Length): rejected.** It needs no preference, but the length comes from the Job record and auto-return is forced regardless of crew or preference (`break_card_resume_joblength.go`). It would not prove "from the crew record or preference".
* **B9 owns its break job `4205 B9 BREAK JOB`** rather than reusing `D10 BREAK JOB`. There is no cross-journey fixture coupling. The lock makes the two different designations safe, because only one holder at a time, and each restores to null.
* **Lock: `paid-break-job`**, a `mkdir` file lock with a 600 s stale threshold. It is acquired *before* the designation and released only *after* the restore, so neither spec can clear the preference under the other.
  - The order is always paid-break lock → preferences lock, so there is no cycle.
  - The restore `PUT` also runs inside `withPreferencesLock`. Otherwise a concurrent whole-form Preferences save (B5/B7 sticker locations) that loaded before the PUT could write the job back.
* **Guard:** if `paidBreakJob` is already set on entry to a job whose name does not match `/^[BD]\d{1,2} /`, fail by name and never overwrite it. That is someone else's configuration. Suite residue (D10/B9 after a killed run) is overwritten and then restored.
* **Measured 2026-10-28:** `#paidBreakJob` now *does* offer `— None —` (the memory note saying it does not is outdated). The restore still stays an API `cleanup`, because only that survives a test timeout.

## Expected outcomes

- The device envelope carries three records: a Time In on `B9 WORK JOB`, a Time In on `B9 BREAK JOB`, and a Time Out. There is no `BreakCard_Records` / `UnpaidBreakCard_Records` section, and the work job appears only once, so the device sent no return punch. *(envelope asserts)*
- After the on-screen Internet import, the crew-scoped Transfer to Job Cards grid lists exactly this run's three references.
  - The break-start row reads Type `Time In` and Job `B9 BREAK JOB`.
  - The last row reads Type `Time Out`.
  - None is manually edited. *(`assertImportedRows`)*
- Reopened from the menu after the rule is applied, `B9 CREW`'s Break & Automation section shows:
  - `Create Break Card from Time In` = `Everyone`
  - `Auto Return from Break` = `From Paid Break`
  - `Auto Break Type` = `None`
  - `Break Lengths` = `10`
  - no Exercise Job
- Reopened after the save, Preferences ▸ Job ▸ Job Assignments shows `Paid Break Job` = `B9 BREAK JOB`.
- On Transfer ▸ Job Cards tab, scoped to `B9 CREW` and the fixture day and before anything commits, PET Tiger previews exactly **3** job cards in chronological order:
  - `B9 WORK JOB` 07:00–09:00 (120 min)
  - `B9 BREAK JOB` 09:00–**09:10 (10 min)**
  - `B9 WORK JOB` **09:10**–10:45 (95 min)
  - Gross = Net on each. Read via `previewSegments()` → `previewClock()`.
- The break card's length equals the crew's `Break Lengths` (10). The card after it is on the prior job and starts exactly at the break end, although no punch exists at 09:10.
- The segments are contiguous, from the 07:00 time-in to the 10:45 time-out. `120 + 10 + 95 = 225 = 10:45 − 07:00`.
- The preview totals bar reads `Job Cards 3`, `Employees 1`, `Pieces 0`.
- No Issues group matches `/closing punch|return from break|paid break/i`, and `blockingCount()` is 0.
- Nothing is committed. Back on the Time Cards tab, every own reference is still a candidate and reads untransferred.
- `paidBreakJob` reads `null` when the test ends, pass or fail (cleanup).
- Not asserted:
  - Amount column. *— deferred: D10 owns the money; 10 min = 0.1667 h is not exact in two decimals.*
  - The commit and the written job cards. *— deferred: D10 commits the identical engine path. B9 stops at the preview, which leaves no job-card residue and keeps the lock short.*
  - Auto-return disallowed (tolerance window), a real return punch, a second break (index into the CSV), and the `Create Break Card = No` variant. *— deferred: one happy path per workflow.*
  - The device's own break screens (`EMPEZAR DESCANZO` / `END BREAK`) and any device-side validation. *— not automatable: device-side, and no B9 recording exists.*
  - On-blur validation, Save-stays-disabled and the Unsaved-changes bar on the Crew/Job/Preferences forms. *(POM)*

**If dev contradicts this** (break ends 09:15, the break runs to 10:45, or there is no break card), it is red by product. Park the row `enabled 0`, draft a bug (component Cloud, assignee Gukan), and never weaken the expectation.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Setup ▸ Crew / Job (fixture rows) | Setup ▸ Crew / Job | `src/utils/fixtureRows/ensureOnScreen.ts` (`ensureCrewOnScreen`, `ensureJobOnScreen`) | exists |
| Setup ▸ Crew ▸ Break & Automation | Setup ▸ Crew → row | `src/pages/setup/CrewPage.ts` `setBreakAutomation` | **extend**: `exerciseJob` / `exerciseJobLengthMinutes` become optional (`undefined` = leave as is; `null` = must be empty, cleared with the combobox's `Clear` button). B9 passes `null`. D10 is unchanged. The select label on screen is "Auto Break Type" (`#autoPaidBreakType`), option `None` = 0 |
| Preferences ▸ Job ▸ Job Assignments | File ▸ Administration ▸ Preferences | `pages.preferences` (`gotoPreferences`, `gotoSection('Job')`, `choose`, `saveIfDirty`, `displayedValue`) | exists. `#paidBreakJob` is a base-ui Select. `Paid-break Length Minutes` is `#defaultPaidBreakLength` (dev 10) |
| Connectivity ▸ Import ▸ Internet | — | `pullFromRelayInternetUi` (via `deliverAndVerifyCards`) | exists |
| Transfer to Job Cards — Time Cards / Job Cards tabs | Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` (`scopeToDay`, `scopeToTimeCardCrew`, `analyzeCandidates`, `filterByCrew`, `candidateReferences`, `readRow`, `rowTransferred`, `openJobCardsTab`, `previewSegments`, `previewTotals`, `issueGroupTexts`, `blockingCount`, `openTimeCardsTab`, `selectAllRowsCheckbox`) | exists, no change |

## Data

**New `b9` block in `src/data/journey-b/fixture.json`**, validated in `src/data/schemas/journeyBFixture.ts` and exported from `fixture.ts` as `B9_PAID_BREAK`. These are fixed rows, created on screen when missing and never deleted. The `^B\d{1,2} ` names are already protected (`cleanupTargets.ts:44`). All codes were checked free on dev on 2026-10-28; job codes 4201–4204 and 5002/5009 are taken.

| Record | Code | Name | Notes |
|---|---|---|---|
| Crew | `5109` | `B9 CREW` | B9's own crew. **Not B1 CREW**: on dev that crew carries a hand-made break rule (`Everyone` / `From Paid Break` / Auto Break Type `All` / intervals `"15 minutes"` / Preparation Job 4000-General / Exercise Job 4000-General 10 min / `includeInTransfer false`) of unknown origin. Its `All` auto-break type invites the injector into the day |
| Job | `4206` | `B9 WORK JOB` | `paymentType Time`, **`hourlyRate 1`**. `B1 HARVEST` (4201) has `hourlyRate null`, and a rate-less job is blocked at transfer ("No hourly rate available") |
| Job | `4205` | `B9 BREAK JOB` | `paymentType Time`, `hourlyRate 1`, **no default length**. The Job rung must stay empty so that the crew rung supplies the length |

Employee `6001 B1 PRESENT ONE` (B fixture) punches on `B9 CREW`. The import binds the card's crew from the record, and day −10 is B9's alone for 6001.

**Scenario `src/data/journey-b/b09-paid-break-rest-and-recovery.json`** (`JourneyBScenarioSchema`):
`workflow B9`, `label B9`, `dayOffset -10`, `envelope records`, `transport relay-ui`, `verification cards`, `cardType null`, `fixtureRowsOnScreen ["b9"]`.

- **dayOffset −10:** B uses 0…−9 and −17. C6 also uses −10, but with crew C6 and employees 7002–7005 and no transfer, and B9's analyze is crew-scoped.
- Records:
  - `{TimeCard, TI, BarcodeBadge, 6001, crew 5109, ranch 4001, field 4101, job 4206, 07:00}`
  - `{TimeCard, TI, …, job 4205, 09:00}`
  - `{TimeOut, TO, BarcodeBadge, 6001, crew 5109, 10:45}`
- `expected.envelope`:
  - `sections ["TimeCard","TimeOut"]`
  - `referenceParts ["TI","TI","TO"]`
  - `employeeSources {BarcodeBadge:3}`
  - `jobOccurrences {"4206":1,"4205":1}`
  - `absentTags ["BreakCard_Records","UnpaidBreakCard_Records"]`
- `expected.cards`:
  - record 0: Time In, job 4206, cardType 1
  - record 1: Time In, job 4205, cardType 1
  - record 2: Time Out, cardType 0, no job
- New optional block `paidBreak`:
  - `crewRule {createBreakCardFromTimeIn:"Everyone", autoPaidBreakType:"None", autoReturnFromBreak:"From Paid Break", breakLengthMinutes:10, includeInTransfer:true, timeEmployeesIncluded:false}`
  - `segments`, as `{kind, job ("workJob"|"breakJob"), start, end, minutes}`: 07:00–09:00 120 · 09:00–09:10 10 · 09:10–10:45 95
  - `totals {jobCards:3, employees:1, pieces:0}`
  - `totalMinutes 225`
  - `absentIssuePattern "closing punch|return from break|paid break"`
- `superRefine` checks for `paidBreak`:
  - `workflow B9` ↔ `dayOffset -10`
  - exactly one `break` segment, with `minutes === crewRule.breakLengthMinutes`
  - break start = record 1's time
  - contiguity: first start = record 0, last end = record 2
  - Σ minutes = `totalMinutes` = TO − first TI
  - the segment after the break has `job === workJob`
- `cleanup`:
  - `[{kind:"timeCards", employeeCodes:["6001"], crewCodes:["5109"], dayOffset:-10}]`
  - `{kind:"unremovable", entity:"paidBreakJob", reason:"restored to null by paidBreakJob.ts restore(), first after-step"}`

## Preconditions

- [ ] `seedOfficeFixture` (existing, `arrange` when missing) for the ranch, field and employee 6001.
- [ ] **On screen, through `ensureOnScreen`:** `B9 CREW`, then `B9 WORK JOB`, then `B9 BREAK JOB` (`fixtureRowsOnScreen: ["b9"]`, modelled on the `pieceJob` branch).
- [ ] **Crew rule on screen:** `pages.crew.gotoEditById(b9.crew.id)` → `setBreakAutomation(rule)`. This is a no-op when everything already matches. Then reopen from the menu (list filter → row) and assert the four labels plus an empty Exercise Job.
- [ ] Gates (read, fail by name, never skip), all from `GET preferences`:
  - `maximumDaysForTransferExport ≥ 10`
  - `requireReturnFromBreakTimeIn` must allow paid breaks (`FromPaidBreak`/`FromPaidBreakAndMeal`/null). The crew rung decides first in any case. Annotated as `preference-evidence`.
  - `defaultPaidBreakLength` is annotated as evidence only.
- [ ] Before-phase sweep of 6001's and `B9 CREW`'s cards on day −10 (`runCleanup` `timeCards`, `before` phase).

## API allowances

| Step / call | Endpoint | Allowance | Why | Proof on screen |
|---|---|---|---|---|
| fixture row existence | `GET ranches/fields/employees/crews/jobs` (+`/{id}`) | plumbing read | `seedOfficeFixture` / `ensureOnScreen` lookup by code | the New/Edit forms |
| fixture row missing / binned | `POST <entity>` (seedOfficeFixture) / `POST <entity>/{id}/restore` | arrange | reference data the workflow never creates, only when missing | — |
| preference gates + evidence | `GET preferences` | plumbing read | window gate, auto-return evidence, foreign-designation guard | — |
| Paid Break Job save landed | `GET preferences` (poll) | plumbing read | waits until the on-screen save is stored | Preferences ▸ Job reopened shows `B9 BREAK JOB` |
| device envelope push | relay `POST …/UploadFile` | device | the handheld | — |
| reference poll (ids for cleanup) | `GET time-cards?from&to` | plumbing read | records the 3 ids before any assertion | crew-scoped Transfer grid (`assertImportedRows`) |
| restore Paid Break Job | `PUT preferences {paidBreakJob: 0}` + `GET preferences` | cleanup | puts back what the test set on screen. Runs inside `withPreferencesLock` and before the lock release. `0` clears the FK; `null` is ignored by the partial PUT | — |
| before/after time-card teardown | `GET time-cards` → `DELETE time-cards/{id}` | cleanup | by id / crew-scoped day sweep | — |

The import click, crew rule, Paid Break Job designation, analyze, Work Crew filter and Job Cards tab are all on screen and have no row. The analyze POST is sent by the screen. Nothing is committed, so there are no job-card calls.

## Cleanup

| Phase | Step | How |
|---|---|---|
| before | sweep 6001 / `B9 CREW` cards on day −10 | `runCleanup` `timeCards` step (`before`). It self-heals a killed run |
| after, 1 | **restore `paidBreakJob` → null, then release the lock** | `designation.restore()`. It is called in the spec right after the preview assertions, and is also registered in `currentScope(testInfo)` at acquisition so a failure or timeout still restores. Idempotent. A failure is attached as `cleanup-warning-paidBreakJob` |
| after, 2 | the run's 3 time cards | `runCleanup` by id (`ctx.cards`), then the crew-scoped day sweep |
| — | fixture rows and crew rule | kept: B9's own permanent fixture |

Time cards have no name and are deleted by id only. No job cards are ever written.

## Files to change

1. `tests/web/journey-b-field/b09-paid-break-rest-and-recovery.spec.ts` — **new**.
2. `src/data/journey-b/b09-paid-break-rest-and-recovery.json` — **new**.
3. `src/data/journey-b/fixture.json`, `src/data/schemas/journeyBFixture.ts`, `src/data/journey-b/fixture.ts` — `b9` block and `B9_PAID_BREAK` export.
4. `src/data/schemas/journeyBScenario.ts`:
   - `fixtureRowsOnScreen` enum gains `'b9'`
   - optional strict `paidBreak` block, with the `superRefine` checks above
   - TimeOut records with `crewCode 5109` validate as they are
5. `src/utils/api/officeFixture.ts` — `OfficeFixture.b9?: { crew; workJob; breakJob }`.
6. `src/utils/journeys/journeyBFlow.ts`:
   - `runJourneyBScenario`: when `'b9'` is set, ensure the three rows on screen, set `office.b9`, and apply and re-read the crew rule on screen. Pass the records' crew id to `deliverAndVerifyCards` (`crewId`, used only by the substitute transport).
   - `resolveExpectedCards`: add the b9 jobs to `jobs`. `crewName` comes from a code→name map (`F.crew`, `b9.crew`) instead of the hard-coded `F.crew.name`.
   - `openCrewTransferCandidates(pages, run, opts?: { scopeAnalyze?: boolean })`: crew name comes from the records' crew code. `scopeAnalyze` calls `scopeToTimeCardCrew` before `analyzeCandidates`. The default behaviour is unchanged for B1–B12.
   - New `previewPaidBreakDay(pages, run)`: open from the menu, scope the day, Time Card Crew, analyze, filter, roster guard, Job Cards tab. Returns `previewClock(await previewSegments())`, the totals and the issue texts.
   - A timeout extension for the lock wait plus the extra forms (the D3 pattern, `journeyBTestTimeoutMs + 300_000`), applied in the flow. No inline literal in the spec.
7. `src/pages/setup/CrewPage.ts` — `BreakAutomation.exerciseJob` / `exerciseJobLengthMinutes` optional, with `null` clearing (see Screens).
8. `src/utils/sync/preferencesLock.ts`:
   - add `acquireFileLock(name, staleMs): Promise<() => void>`
   - `withFileLock` uses it
   - export `acquirePaidBreakJobLock()` (`'paid-break-job'`, 600 s)
9. `src/utils/journeys/paidBreakJob.ts` — **new, relocated from `journeyDFlow.designatePaidBreakJob`**. `designatePaidBreakJob(job: EnsuredRecord, { sessionApi, pages, testInfo, label }): Promise<{ restore(api?): Promise<void> }>`, which does:
   - acquire the lock
   - register the restore in the scope
   - foreign-value guard
   - on screen, under `withPreferencesLock`: Preferences → Job → `choose('paidBreakJob', job.name)` → `saveIfDirty`
   - reopen and assert `displayedValue('paidBreakJob') === job.name`
   - poll `GET preferences` until it equals `job.id`
   - `restore()`: under `withPreferencesLock`, the cleanup PUT 0 and a GET confirming null; release the lock in `finally`.
10. `src/utils/journeys/journeyDFlow.ts`:
    - `designatePaidBreakJob(run, opts)` becomes a thin wrapper that stores the handle on `run.preference`. `prepareJourneyD10` keeps `testInfo` on the run.
    - `finishCleanup` step 1 calls `handle.restore(api)` instead of the inline PUT.
    - Move `previewClock` / `clock` / `PreviewSegments` to `src/utils/journeys/transferPreview.ts`, re-exported from `journeyDFlow`.
    - **The D10 spec is unchanged.**
11. `src/data/runner/journey-b.csv` row `B9`:
    - `category api → workflow`
    - `jira PET-12647`
    - `enabled 0` until green; then `status automated`, `enabled 1`
    - `npm run runner:sync && npm run runner:check`

## Test case

| id | Title | Tags | Category | enabled |
|---|---|---|---|---|
| `B9` | Paid break (rest and recovery) | `regression` | `workflow` | 0 → 1 |

```ts
test.describe('B9 · Paid break (rest and recovery)', { tag: ['@JourneyB', '@B9'] }, () => {
    test('[Paid Break] Deliver a break start with no return punch and verify the transfer bounds it at the crew\'s break length and returns the worker to the prior job.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'B9' }],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

**Steps**
1. `loadScenario(JourneyBScenarioSchema, testInfo)`. Then `runJourneyBScenario`, which does: sweep; B9 rows on screen; crew rule on screen and re-read; gates; envelope; relay; on-screen Internet import; reference poll.
2. Envelope asserts (sections, parts, sources, job occurrences, absent break-card tags) and `send.success`.
3. `assertImportedRows(pages, run)`, then the per-row Type and Job of the break-start and time-out rows via `cardOf`.
4. `const designation = await designatePaidBreakJob(run.office.b9.breakJob, …)`. This waits on the lock if D10 holds it.
5. `previewPaidBreakDay(pages, run)`, then assert:
   - the roster equals own references
   - `selectAllRowsCheckbox` is not checked
   - `blockingCount() === 0`
   - jobs in order `[B9 WORK JOB, B9 BREAK JOB, B9 WORK JOB]`
   - the clock/gross/net boundaries equal `paidBreak.segments`
   - break minutes `=== crewRule.breakLengthMinutes`
   - contiguity and Σ = 225
   - totals `{3,1,0}`
   - no issue group matches `absentIssuePattern`
6. `await designation.restore()`. This releases the lock as early as possible.
7. `openTimeCardsTab()`. Every own reference is still a candidate and reads untransferred.
8. Teardown is the scope's `runCleanup` (time cards by id plus the crew sweep).

## Validation

- `npm run typecheck`, `npm run lint`, `npm run runner:sync && npm run runner:check`
- Locally with `UI_FIRST_GUARD=enforce`: `npm run test:dev -- tests/web/journey-b-field/b09-paid-break-rest-and-recovery.spec.ts`
- Regression for the shared edits:
  - `tests/web/journey-b-field/b08-crew-piece-out.spec.ts` and `b10-meal-start-end.spec.ts` (`openCrewTransferCandidates` / `resolveExpectedCards`)
  - `tests/web/journey-d-office/d10-exercise-and-auto-break-split.spec.ts` (relocated designation + lock)
- Afterwards, `GET preferences` reads `paidBreakJob: null`, and day −10 holds no 6001 / `B9 CREW` cards.

## Open questions for the tester

None blocking. For the record, not as questions:
- `B1 CREW` on dev carries a hand-entered break and preparation rule with Auto Break Type `All` and an unparseable interval `"15 minutes"`. B9 avoids that crew.
- The B9 device wire shape (TI on the break job) has no recording behind it. The choice is justified above from the importer, the engine and B10, and the catalog claim under test is program-side.
