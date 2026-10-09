# A4 · Crew setup

## Application Overview

Jira PET-12632 · recording `docs/media/a4-crew-setup-happy-path.webm` (WEBPET-1441 comment 101631, "Happy Path") · observations `.video-annotations/a4-crew-setup-happy-path/observations.md` · manual script `deelte later/A4-crew-setup-manual-script.md`.

**Scope rule (journey contract, overrides the planner's generic guidance):** one spec, one happy-path test, `testCaseId` = `A4`. No negative, edge, boundary, extra-positive or setup-only cases; no EARS; no `A4-R<n>` ids.

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `A4` |
| Journey | `A`: Setup and configuration (office) |
| Segments | `all` |
| Modules | `Windows`, `Department`, `Notification` |
| Surface | `ui` → `tests/web/journey-a-setup/a04-crew-setup.spec.ts` |
| Demo candidate | no |
| Catalog status | draft (runner row `A4` already exists: `regression`, enabled `0`, status `draft`) |

**Summary** (from the catalog)
> Define each crew with its department, supervisor, badge color, defaults, and the auto-break, exercise, and notification behavior that shapes capture and pay. Crew-level settings override global preferences.

## Catalog steps

| # | Catalog step | What the recording / live form shows | Automatable? |
|---|---|---|---|
| 0 | (implicit: "crew-level settings override global preferences") | File ▸ Administration ▸ Preferences (`/settings/preferences`): Paid-break Length Minutes = 10 (section **Job**), Notification Threshold = 3 (section **Inspection**), Auto Return from Break = "From Paid-Break and Meal" (section **Time Cards**). | yes. **Read on screen** from `PreferencesPage`, never hard-coded |
| 1 | Create the crew (name, barcode, department, supervisor, badge color, default job, ranch, field) under Input → Setup → Crew. | Setup ▸ Crew ▸ New Crew, section "Crew & Badge": Name, Barcode, Badge Color swatch `#22c55e`, Supervisor `C6 SUPERVISOR`, Department `Guerrero`; section "Time Card Defaults": Default Ranch `B1 RANCH`, Default Field `B1 FIELD`, Default Job `B1 HARVEST` (in the comment and script; the take skipped them). Save → toast "Crew created", URL `/setup/crews/<crewCounter>`, heading "Edit Crew: <name>". | yes |
| 2 | Set auto-break (all / piece-only / time-only) and the auto-return-from-break duration. | Section "Break & Automation": Auto Break Type (`#autoPaidBreakType`, labelled **"Auto Break Type"** on screen) = `Time Employees Only`; Auto Return from Break = `From Paid Break`; Break Lengths (min, comma-separated) = `15,15`. Save. | yes |
| 3 | Set the auto exercise rule. | Same section: Exercise Job = `D10 EXERCISE JOB`, Exercise Job Length = `10`. (Saved together with step 4 in the recording.) | yes |
| 4 | Set break and meal notification thresholds and the notification user. | Same section: Break & Meal Notification = `7`, User to Notify for Break & Meal = `Automation su`. Save. | yes |
| 5 | Set the day-start definition for crews whose shift spans midnight. | Section "Day Boundaries": Day Start From `06:00 PM`, Day Start To `02:00 AM`, Day Start Fixed Time `07:00 PM`. Save. | yes |
| 6 | (recording) Reload and compare | F5 → every value retained; crew values differ from the globals. Comment: values also on `GET /crews/{id}`. | yes |
| 7 | (recording) Delete ▸ confirm | Teardown in the recording, not a catalog step. | teardown via `runCleanup` (API, cleanup allowance) |

Variation (pack-house crews split into sub-crews / "tables") is C6's territory and is out of scope here.

## Safety constraint

- The spec **reads** the global Preferences and never writes them: no `PreferencesPage.save()`, no `putPreferences`. A4 creates exactly one crew and touches no shared record.
- Lookup rows (`C6 SUPERVISOR`, `Guerrero`, `B1 RANCH`, `B1 FIELD`, `B1 HARVEST`, `D10 EXERCISE JOB`, `Automation su`) are protected fixture rows owned by Journeys B, C and D and by the suite login. A4 only **selects** them and never edits them. The `Add …` / `Edit …` buttons next to each picker must not be clicked.
- The Department combobox is *creatable* ("Search or add new Department…"). Pick the existing option by anchored label (`PickerComponent.labelPattern`) so a typo never mints a new department.

## Expected outcomes

- When the New Crew form is saved with Name, Barcode, Badge Color, Supervisor, Department, Default Ranch, Default Field and Default Job, PET Tiger creates the crew, shows the toast "Crew created", moves to `/setup/crews/<id>`, and titles the page "Edit Crew: <name>".
- Export Identifier auto-fills with the crew Name on the New form.
- Each later section save (auto-break, exercise + notification, day start) commits a `PUT /crews/{id}` and clears the "Unsaved changes" bar. _(POM: `SetupScreenPage.saveEdit`)_
- After a full browser reload of `/setup/crews/<id>`, the form shows every saved value: Name, Barcode, Badge Color `#22c55e`, Supervisor `C6 SUPERVISOR`, Department `Guerrero`, Default Ranch `B1 RANCH`, Default Field `B1 FIELD`, Default Job `B1 HARVEST`, Auto Break Type `Time Employees Only`, Auto Return from Break `From Paid Break`, Break Lengths `15,15`, Exercise Job `D10 EXERCISE JOB`, Exercise Job Length `10`, Break & Meal Notification `7`, User to Notify `Automation su`, Day Start From `18:00`, Day Start To `02:00`, Day Start Fixed Time `19:00`.
- The crew's own values differ from the global preferences read on screen at the start of the test:
  - Auto Return from Break `From Paid Break` ≠ the global `requireReturnFromBreakTimeIn` label. Compare after normalising hyphens and case: the global label reads "From Paid-Break and Meal" while the crew option reads "From Paid Break and Meal", so a raw string compare would pass even if the values were semantically equal.
  - Every Break Lengths entry (`15`, `15`) ≠ global `defaultPaidBreakLength`.
  - Break & Meal Notification `7` ≠ global `notificationThreshold` (see Open questions on whether that is the right counterpart).
- `GET /crews/{id}` (read allowance) returns `name`, `code`, `exportIdentifier` = name, `badgeColor` `#22c55e`, `autoPaidBreakType` `2`, `autoReturnFromBreak` `1`, `breakLengthMinutesCommaSeparated` `"15,15"`, `exerciseJobLengthMinutes` `10`, `breakAndMealNotification` `"7"` (a string on the wire), `dayStartFrom` `"18:00"`, `dayStartTo` `"02:00"`, `dayStartFixedTime` `"19:00"`, and **non-null** `supervisorCounter`, `departmentCounter`, `defaultRanchCounter`, `defaultFieldCounter`, `defaultJobCounter`, `exerciseJobCounter`, `userToNotifyBreakAndMeal`. The names behind those counters are proven by the reload check, so the read-back does not re-resolve ids. Wire values verified live 2026-10-09 on a throwaway crew.
- The crew badge preview renders name and barcode. _not asserted: decorative SVG; the badge colour is asserted on the trigger and the wire._
- Print Badge output. _deferred: report/PDF surface, not part of the catalog step._
- That crew settings actually override the globals at capture or transfer time (auto-break cards, exercise split, missed-break email). _not automatable here: behavioural effect belongs to D10 (exercise/auto-break split, already automated) and B12 (notification); A4 proves the configuration persists._
- Deleting the crew on screen (Delete ▸ alertdialog `Delete "<name>"?` ▸ Delete → back to `/setup/crews`). _deferred: teardown, not a catalog step. Removal goes through `runCleanup`._

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Preferences | `File ▸ Administration ▸ Preferences` (`/settings/preferences`) | `src/pages/admin/PreferencesPage.ts` (`pages.preferences`) | exists. Add one read helper |
| Crew list + New/Edit Crew form | `Input ▸ Setup ▸ Crew` (`/setup/crews`, `/setup/crews/new`, `/setup/crews/<id>`) | `src/pages/setup/CrewPage.ts` (`pages.crew`) extends `SetupScreenPage` | exists. Extend with the locators below |

**PreferencesPage: read only, no new section types needed.** Every field is in the DOM at once (class note), so read by id via `field(id)`:

| Global | Field id = API key | Control | Section | Dev value 2026-10-09 |
|---|---|---|---|---|
| Paid-break Length Minutes | `defaultPaidBreakLength` | `INPUT` number | Job | 10 |
| Notification Threshold | `notificationThreshold` | `INPUT` number | Inspection | 3 |
| Auto Return from Break | `requireReturnFromBreakTimeIn` | `BUTTON[role=combobox]` (base-ui Select) | Time Cards | "From Paid-Break and Meal" (wire `FromPaidBreakAndMeal`) |

Add `PreferencesPage.displayedValue(fieldId): Promise<string>`: `inputValue()` for an INPUT, trimmed `innerText()` for a Select trigger. Wait for `saveButton` (as `gotoPreferences` does) before reading. The search box (`getByRole('searchbox', { name: 'Search preferences…' })`) is what the recording used visually; the spec does not need it.

**CrewPage: new locators (all verified live on `/setup/crews/new`, 2026-10-09):**

| Field (screen label) | Locator | Control / driving notes |
|---|---|---|
| Export Identifier | `#exportIdentifier` | text; auto-mirrors Name |
| Badge Color | `page.locator('div.space-y-1', { has: page.locator('label[for="badgeColor"]') }).locator('button[data-slot="popover-trigger"]')` | Popover trigger (no stable id; `label for="badgeColor"` points at nothing). Accessible name = current hex or "None". Popover: `getByRole('dialog')` → swatch `getByRole('button', { name: '#22c55e', exact: true })`, or hex textbox `getByRole('textbox', { name: '#rrggbb' })`; then `getByRole('button', { name: 'Close' })`. Read back: trigger text `#22c55e`. |
| Supervisor | `input#supervisorCounter` | Combobox, server-backed (`employees/lookup?limit=101`). `pickers.pickCombobox` types to filter. |
| Department | `input#departmentCounter` | Combobox, **creatable**, and **disabled until `/departments` loads**: `expect(...).toBeEnabled()` first. |
| Default Ranch | `button#defaultRanchCounter` | **Select** (`pickers.pickSelect`). Pick **before** Default Field. |
| Default Field | `input#defaultFieldCounter` | Combobox **filtered by the chosen Default Ranch** (only `B1 FIELD` is offered once `B1 RANCH` is set). Its sibling hidden textbox holds the whole record as JSON: read the combobox, never the sibling. |
| Default Job | `input#defaultJobCounter` | Combobox |
| Auto Break Type | `button#autoPaidBreakType` (existing `autoPaidBreakTypeSelect`) | Select; options None · All · Time Employees Only · Piece Employees Only. Screen label is "Auto Break Type". |
| Auto Return from Break | `button#autoReturnFromBreak` (existing) | Select; options Never · From Paid Break · From Meal · From Paid Break and Meal. Use exact option match: "From Paid Break" is a prefix of the last option. |
| Break Lengths | `input#breakLengthMinutesCommaSeparated` (existing) | text |
| Exercise Job | `input#exerciseJobCounter` (existing) | Combobox; placeholder "Loading..." until jobs land (existing caveat in `setBreakAutomation`) |
| Exercise Job Length | `input#exerciseJobLengthMinutes` (existing) | number |
| Break & Meal Notification | `input#breakAndMealNotification` | **text** input (wire value is a string) |
| User to Notify for Break & Meal | `input#userToNotifyBreakAndMeal` (existing `notifyUserCombobox`) | Combobox |
| Day Start From / To / Fixed Time | `input#dayStartFrom`, `input#dayStartTo`, `input#dayStartFixedTime` | **`type=time`**: `fill('18:00')` (24h `HH:mm`), and `inputValue()` reads back `18:00`. Do not type `0600PM`. |
| Delete (reference only) | `getByRole('button', { name: 'Delete' })` → `getByRole('alertdialog', { name: 'Delete "<name>"?' })` → `Delete` | not used by the spec |

New CrewPage methods (fill only; the spec calls the existing public `saveEdit()` after each, matching the recording's one-save-per-section rhythm):
- Extend `NewCrewData` with optional `badgeColor`, `supervisor`, `department`, `defaultRanch`, `defaultField`, `defaultJob`, and extend `fillForm` to set them in screen order (Ranch before Field). `createCrew` keeps going through `createOnScreen` → `submitForm`, which already blurs, waits for Save and returns `'created' | 'rejected'`. `fillForm` keeps `assertCodeEditable`.
- `fillAutoBreak({ autoPaidBreakType, autoReturnFromBreak, breakLengths })`.
- `fillExerciseAndNotification({ exerciseJob, exerciseJobLengthMinutes, breakAndMealNotification, notifyUser })`.
- `fillDayStart({ from, to, fixedTime })`.
- `readCrewForm()`: one object of every displayed value above, for the reload check. Selects read from trigger `innerText`; comboboxes read from `inputValue()` matched with `PickerComponent.labelPattern`, which tolerates the `"<exportId> : <name>"` label form. Await `exerciseJobCombobox` not having placeholder `/^Loading/` before reading.
- `createdToast` locator: `page.locator('[data-sonner-toast][data-type="success"]', { hasText: 'Crew created' })`, or the same shape `UsersPage.userCreatedToast` uses.
- Leave `setBreakAutomation` / `setNotifyUser` untouched: D10 and B12 depend on them.

## Data

- **Scenario file**: `src/data/journey-a/a04-crew-setup.json`, validated by a new `CrewSetupCaseSchema` in `src/data/schemas/journeyAScenario.ts` (`.strict()` objects, same style as `UserSetupCaseSchema`):
  - `crew`: `{ codeOffset: 41, badgeColor: "#22c55e", supervisor: "C6 SUPERVISOR", department: "Guerrero", defaultRanch: "B1 RANCH", defaultField: "B1 FIELD", defaultJob: "B1 HARVEST" }`
  - `autoBreak`: `{ autoPaidBreakType: "Time Employees Only", autoReturnFromBreak: "From Paid Break", breakLengths: "15,15" }`
  - `exerciseAndNotification`: `{ exerciseJob: "D10 EXERCISE JOB", exerciseJobLengthMinutes: 10, breakAndMealNotification: "7", notifyUser: "Automation su" }`
  - `dayStart`: `{ from: "18:00", to: "02:00", fixedTime: "19:00" }`
  - `globals`: `{ paidBreakLength: "defaultPaidBreakLength", notificationThreshold: "notificationThreshold", autoReturnFromBreak: "requireReturnFromBreakTimeIn" }` (field ids, which are also the API keys)
  - `expected`: `{ createdToast: "Crew created", editHeadingPrefix: "Edit Crew: ", wire: { autoPaidBreakType: 2, autoReturnFromBreak: 1 } }`
  - `cleanup`: `[{ "kind": "delete", "entity": "crew", "name": "{crewName}" }]`
- **Generated values** (flow only, never in the JSON):
  - Name `E2ECrew_<RUN_TOKEN>_<seq>` via `uniqueName(...)`, with the prefix taken from `cleanupTarget('crew')`'s `factory` prefix (copy `src/data/generated/crewTableFactory.ts` into a new `crewFactory.ts` `makeCrewName()`), so the residue sweep can date and reclaim it. The recording's `E2ECrew_A40735` form is **not** decodable by the sweep.
  - Barcode `runUniqueCode(scenario.crew.codeOffset)` (`src/data/generated/scanDeviceFactory.ts`): numeric, ≥4 digits, no leading zero, run-unique. Use offset `41`, distinct from B15's 1/2/3 in the same run. This replaces the manual script's `9<HHMM>`, which has only 1440 values and repeats daily. A 9-digit barcode was accepted live.
- **Uniqueness rules**: Barcode unique across the database; Name unique per screen (`rejectionMessage` already matches "already exists|in use"); Export Identifier mirrors Name, so it is unique too.

## Preconditions

- [ ] Authenticated `su` session (`.auth/user.json`) on dev staging (`npm run test:dev`).
- [ ] Lookup rows exist and are active for su (client 1). Verified by read-only GETs 2026-10-09: Supervisor `C6 SUPERVISOR` (employee 1823, code 7005); Department `Guerrero` (1); Ranch `B1 RANCH` (162); Field `B1 FIELD` (99, ranch B1 RANCH); Job `B1 HARVEST` (221); Job `D10 EXERCISE JOB` (2275); User `Automation su` (1433). Beware near-duplicates `B1 Test Ranch` / `B1 Test  FIELD`: pick by anchored label. No arrange step creates them. If one is missing the picker fails by name (`PickerComponent` lists what it offered), which points at the owning journey's fixture.
- [ ] Barcode editable on New Crew (`assertCodeEditable`, setup-identifier gate). True for su.

## API allowances

| Step / call | Endpoint | Allowance | Why |
|---|---|---|---|
| read-back after the last save | `GET crews/{id}` (via a new `readCrew(api, id)` in `src/utils/journeys/journeyAFlow.ts` wrapping `getCrew` from `src/utils/api/crewsApi.ts`) | read | proves the wire stored what the screen showed |
| after-phase teardown | `DELETE crews/{id}` via `runCleanup` delete step `{crewName}` | cleanup | registered by `mintCrewSetup`, so it runs even when an assertion fails |
| run-start / run-end residue sweep | prefix `E2ECrew_` (`cleanupTargets.ts`, already registered) | cleanup | reclaims a crew left by a killed run |

Global preferences are read **on screen** (no API row). The crew and every value on it are created on screen.

## Cleanup

| Entity | Prefix | Id source | Route |
|---|---|---|---|
| `crew` | `E2ECrew_` (factory token, already in `src/data/static/shared/cleanupTargets.ts`, order 40) | `crewPage.savedIdFromUrl()` right after the first save (URL `/setup/crews/<id>`), recorded before any assertion | `runCleanup` delete-by-name step `{kind:'delete', entity:'crew', name:'{crewName}'}`, registered by `mintCrewSetup` |

Note: a pre-existing residue crew named exactly `E2ECrew` (id 2213, barcode 90548, Guerrero, `#14b8a6`) is on dev. It does not decode under the factory token, so the sweep will never reclaim it. It does not collide with A4's minted names.

## Flow helper

`src/utils/journeys/journeyAFlow.ts`:
- `mintCrewSetup(scenario, sessionApi, testInfo)` mirrors `mintUserSetup`. It mints `{ name, code }`, runs `substituteTokens(scenario, { crewName })`, and registers `runCleanup(..., { phase: 'after' })` via `register(testInfo, 'A4 crew-setup cleanup', …)`. It returns `{ scenario, crew: NewCrewData, cleanup }`.
- `readCrew(api, id)`: read-only wrapper over `getCrew`. Specs may not import `@utils/api/*`.

## Test case

`src/data/runner/journey-a.csv` row `A4` already exists (`crewSetup`, `regression`, enabled `0`, status `draft`). Keep the tags; the orchestrator flips `enabled`/`status` after green, then `npm run runner:sync && npm run runner:check`.

```ts
test.describe('A4 · Crew setup', { tag: ['@JourneyA', '@A4'] }, () => {
    test('[Crew Setup] End-to-end: create a crew with defaults, set break, exercise, notification and day-start overrides, and verify they persist and differ from the global preferences.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'A4' }],
    }, async ({ pages, sessionApi }, testInfo) => { … });
});
```

## Open questions for the tester

Resolved by the orchestrator on 2026-10-09 from Gukan's own A4 sign-off (WEBPET-1441, comment 101631):
"crew-level values differ from the global preferences and are retained (auto return from break,
break length, notification threshold)".

- [x] **Notification counterpart.** Keep Inspection ▸ Notification Threshold. It is the global the sign-off compares against.
- [x] **Paid-break length vs Break Lengths.** Keep this pair, as in the sign-off.
- [x] **Label drift.** Normalise and compare. No ticket is raised from automation; WEBPET writes are out of scope here.
- [x] **Environment-dependent "differs" checks.** Hard-fail, and the message names the global field id. A silent gate would hide the override claim.
- [x] **Barcode source.** `runUniqueCode(41)` is accepted. It saves and previews fine.

## Test Scenarios

### 1. A4 · Crew setup

**Seed:** `tests/seed.spec.ts`

#### 1.1. [Crew Setup] End-to-end: create a crew with defaults, set break, exercise, notification and day-start overrides, and verify they persist and differ from the global preferences.

**File:** `tests/web/journey-a-setup/a04-crew-setup.spec.ts`

**Steps:**
  1. Load the scenario with `loadScenario(CrewSetupCaseSchema, testInfo)` and call `mintCrewSetup(scenario, sessionApi, testInfo)`. This mints the run-unique name `E2ECrew_<RUN_TOKEN>_<n>` and barcode `runUniqueCode(41)` and registers the after-phase cleanup.
    - expect: The scenario validates; `run.crew.name` starts with `E2ECrew_`; `run.crew.code` is numeric with no leading zero
  2. `pages.preferences.gotoPreferences()` (File ▸ Administration ▸ Preferences). Read `displayedValue('defaultPaidBreakLength')`, `displayedValue('notificationThreshold')` and `displayedValue('requireReturnFromBreakTimeIn')` into `globals`. No save.
    - expect: All three values are non-empty (on dev today: 10, 3, "From Paid-Break and Meal"; read, never hard-coded)
  3. Catalog step 1: `pages.crew.createCrew({ name, code, badgeColor: '#22c55e', supervisor: 'C6 SUPERVISOR', department: 'Guerrero', defaultRanch: 'B1 RANCH', defaultField: 'B1 FIELD', defaultJob: 'B1 HARVEST' })`. This goes List ▸ New Crew ▸ fill Crew & Badge + Time Card Defaults ▸ Save. Immediately record `crewId = pages.crew.savedIdFromUrl()`.
    - expect: `createCrew` returns `'created'`
    - expect: Toast "Crew created" is visible
    - expect: URL matches `/setup/crews/<crewId>` and the heading reads "Edit Crew: <name>"
    - expect: Export Identifier (`#exportIdentifier`) equals the name
  4. Catalog step 2: `pages.crew.fillAutoBreak({ autoPaidBreakType: 'Time Employees Only', autoReturnFromBreak: 'From Paid Break', breakLengths: '15,15' })`, then `pages.crew.saveEdit()`.
    - expect: The save commits (`saveEdit` waits for `PUT crews/<crewId>` and the Unsaved-changes bar to hide) (POM)
  5. Catalog steps 3–4: `pages.crew.fillExerciseAndNotification({ exerciseJob: 'D10 EXERCISE JOB', exerciseJobLengthMinutes: 10, breakAndMealNotification: '7', notifyUser: 'Automation su' })`, then `pages.crew.saveEdit()`.
    - expect: The save commits (POM)
  6. Catalog step 5: `pages.crew.fillDayStart({ from: '18:00', to: '02:00', fixedTime: '19:00' })` (`type=time` inputs, 24h fill), then `pages.crew.saveEdit()`.
    - expect: The save commits (POM)
  7. Reload: `page.reload()` on `/setup/crews/<crewId>` (or `gotoEditById(crewId, name)` after a reload). Wait for hydration: Name has the value, and the Exercise Job placeholder is no longer "Loading...". Then `pages.crew.readCrewForm()`.
    - expect: Name = minted name; Barcode = minted code; Badge Color trigger shows `#22c55e`
    - expect: Supervisor `C6 SUPERVISOR`, Department `Guerrero`, Default Ranch `B1 RANCH`, Default Field `B1 FIELD`, Default Job `B1 HARVEST`
    - expect: Auto Break Type `Time Employees Only`, Auto Return from Break `From Paid Break`, Break Lengths `15,15`
    - expect: Exercise Job `D10 EXERCISE JOB`, Exercise Job Length `10`, Break & Meal Notification `7`, User to Notify `Automation su`
    - expect: Day Start From `18:00`, Day Start To `02:00`, Day Start Fixed Time `19:00`
  8. Compare the crew values with the globals read in step 2.
    - expect: normalise("From Paid Break") ≠ normalise(globals.autoReturnFromBreak), where normalise = lower-case with '-' replaced by ' '
    - expect: Each Break Lengths entry (15, 15) ≠ Number(globals.paidBreakLength)
    - expect: Number('7') ≠ Number(globals.notificationThreshold)
    - expect: Each expect message names the global field id, so a drifted environment reads as config, not product failure
  9. Read-back: `readCrew(sessionApi, crewId)` (read allowance, `GET crews/{id}`).
    - expect: `name`, `code` match; `exportIdentifier` = name; `badgeColor` = '#22c55e'
    - expect: `autoPaidBreakType` = 2, `autoReturnFromBreak` = 1, `breakLengthMinutesCommaSeparated` = '15,15'
    - expect: `exerciseJobLengthMinutes` = 10, `breakAndMealNotification` = '7'
    - expect: `dayStartFrom` = '18:00', `dayStartTo` = '02:00', `dayStartFixedTime` = '19:00'
    - expect: `supervisorCounter`, `departmentCounter`, `defaultRanchCounter`, `defaultFieldCounter`, `defaultJobCounter`, `exerciseJobCounter`, `userToNotifyBreakAndMeal` are all non-null
  10. Teardown (automatic): the cleanup registered by `mintCrewSetup` runs the `{kind:'delete', entity:'crew', name:'{crewName}'}` step after the test, pass or fail.
    - expect: Crew removed (not asserted; the residue sweep on `E2ECrew_` is the backstop)
