# A5 · Employee setup

## Application Overview

Jira PET-12633 · recording `docs/media/a5-employee-setup-happy-path.webm` (WEBPET-1442 comment 101872, "Happy Path") · observations `.video-annotations/a5-employee-setup-happy-path/observations.md` (keyframes in `sheets/`, `dense/sheets/`).

**Scope rule (journey contract, overrides the planner's generic guidance):** one spec, one happy-path test, `testCaseId` = `A5`. No negative, edge, boundary, extra-positive or setup-only cases; no EARS; no `A5-R<n>` ids.

**Run identity:** su on dev staging (`npm run test:dev`), not QA Admin. The recording's client-3 lookups (Anthony Vineyard, 101 Carmen Melendrez, Agrivision, Packing House, 0 - Break - BP Packing, device "intuware phone Pocket") are swapped for su-tenant protected fixture rows (below). Everything in this plan was walked live on su on 2026-10-09 with a throwaway employee (id 1934, since deleted on screen; device membership removed on screen first).

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `A5` |
| Journey | `A`: Setup and configuration (office) |
| Segments | `all` |
| Modules | `Windows` |
| Surface | `ui` → `tests/web/journey-a-setup/a05-employee-setup.spec.ts` |
| Demo candidate | no |
| Catalog status | draft (runner row `A5` exists: `employeeSetup`, `regression`, enabled `0`, status `draft`, jira empty → set `PET-12633`) |

**Summary** (from the catalog)
> Create each employee with identity, badges, home crew, pay, meal waivers, and compliance data; the employee record is the most linked record in the system and the anchor for traceability. The record itself is core, while specific compliance fields unlock with their modules.

## Catalog steps

| # | Catalog step | What the recording / live form shows | Automatable? |
|---|---|---|---|
| 1 | Create the employee (name, gender, date of birth, home crew, export identifier, hire, release, and authorized-until dates) under Input → Setup → Employee. | Setup ▸ Employee ▸ "New Employee" (heading "New Employee", Active on). One scrolling form; left rail General / Additional Info / Contact / Identification (all sections are in the DOM at once, no tab switching needed). General: Name, Barcode (typed), Export Identifier, Last Name (= Name in the recording), Department, Crew (pre-filled `B1 CREW` on su), Hire Date pre-filled today, Release Date and Authorized to Work Until left empty. Additional Info ▸ Personal Details: Gender `Male`, Date of Birth `1996-06-11`. | yes |
| 2 | Set the Rate tab (hourly rate when above minimum, pay frequency) and the Time-card-defaults tab (default job, ranch, field). | General: Hourly Rate `25`, Pay Period `Hourly` (default, left as is). Identification ▸ Time Card Defaults: Default Ranch → Default Field → Default Job. | yes |
| 3 | Set Agreements-tab meal waivers (first meal waivable at six hours or less, second at twelve or less). | Identification ▸ Agreements & Waivers: switches "Waived First Meal" ON, "Waived Second Meal" ON. | yes (the toggles). The 6 h / 12 h pay rule is not automatable here |
| 4 | Record badges (barcode or RFID, language) and the Iris-tab biometric enrollment status; an employee may hold several badge types at once. | Barcode (General), Identification ▸ Cards: NFC Code, RFID Code. No Language field exists on the form. Iris section appears only on Edit ("Not enrolled" ×4). | yes for Barcode/NFC/RFID; Iris deferred (A6) |
| 5 | Capture Additional-tab W4 and I9 (and H2A or paid-sick fields) where those modules are enabled. | Not in the recording. Edit form shows an I-9 section ("I-9 document type not configured"). | deferred (module-gated, A13 territory) |
| 6 | Confirm day-start and earliest-start time (which blocks early clock-ins) and that the new record syncs to devices via the Post Office. | Day Start Time shows default `00:00`, Earliest Start Time empty (not touched). Save → toast "Employee created" → "Edit Employee: <name>". Device sync: Scan Device ▸ Employee section ▸ "— Add Employee —" ▸ Add ▸ Save (toast "Scan device saved") ▸ "Push to Device" → panel "Push succeeded / Destination: <mailbox>" + "Download file". | yes (sync on screen + read-only export read-back). Early-clock-in blocking: not automatable here |
| 7 | (recording) Employees list filtered by Hire Date = today, reopen the record | Row present, values retained. | reopen: yes (reload check). Grid row: not asserted (grid renders surname-first; the record is proven by reload + GET) |
| 8 | (recording / comment) teardown | Not shown. | teardown via `runCleanup` |

## Safety constraint

- Lookup rows (`Guerrero`, `B1 CREW`, `B1 RANCH`, `B1 FIELD`, `B1 HARVEST`) are protected fixture rows owned by Journey B and A4. A5 only **selects** them; never click the `Add …` / `Edit …` buttons next to a picker.
- Department combobox is *creatable* ("Search or add new Department…"): pick by anchored label (`PickerComponent.labelPattern`) so a typo never mints a department.
- Device 1308 "Guka Phone Pocket" is a **shared** fixture (also A9's export target). A5 adds exactly one employee row and the cleanup removes exactly that id (never restores the whole list, so a concurrent writer is not clobbered). Deleting the employee alone does **not** undo the membership: verified live, a deleted employee stays in `employeeIds` and renders as a dangling `#<id>` row (rows `#52`, `#53`, `#54` on 1308 today are exactly that; GET employees/52 → 404).
- **Push makes the open device form stale.** After Push to Device, a second Save on the same page returns 409 and the form shows "This record was modified by another user. Please reload and try again." (push bumps the row's version). The spec never saves the device again after pushing; any later device edit must `gotoEdit` first.
- Push to Device sends the setup file to the device's mailbox `gukaphone2@petb1` (Gukan's su phone). A9 already pushes there via the API; see Open questions.

## Expected outcomes

- When the New Employee form is saved with Name, Barcode, Export Identifier, Last Name, Department, Crew, Hourly Rate, Gender, Date of Birth, Default Ranch/Field/Job, NFC Code, RFID Code and both meal waivers on, PET Tiger creates the employee, shows the success toast "Employee created", moves to `/setup/employees/<id>`, and titles the page "Edit Employee: <name>".
- Hire Date defaults to today and Pay Period defaults to Hourly without being touched.
- After a full reload of `/setup/employees/<id>` the form shows every saved value: Name, Barcode, Export Identifier, Last Name, Department `Guerrero`, Crew `B1 CREW`, Pay Period `Hourly`, Hourly Rate `25`, Hire Date = the value displayed right after save (today), Gender `Male`, Date of Birth `1996-06-11`, Default Ranch `B1 RANCH`, Default Field `B1 FIELD`, Default Job `B1 HARVEST`, NFC Code, RFID Code, Waived First Meal on, Waived Second Meal on, Active on.
- `GET /employees/{id}` (read allowance) returns `name`, `code`, `exportIdentifier`, `lastName`, `nfcCode`, `rfidCode` as typed; `rate` `25`; `payPeriod` `0` (Hourly); `gender` `0` (Male); `dateOfBirth` `"1996-06-11"`; `hireDate` = the browser's local today as `YYYY-MM-DD`; `releaseDate` `null`; `waivedFirstMeal` `true`; `waivedSecondMeal` `true`; `active` `true`; non-null `departmentCounter`, `crewCounter`, `defaultRanchCounter`, `defaultFieldCounter`, `defaultJobCounter`. Wire values verified live 2026-10-09 on employee 1934 (they were 1 / 231 / 162 / 99 / 221; the names behind them are proven by the reload check, so the read-back does not pin ids).
- Adding the employee to the device's Employee section and saving shows the row `<exportIdentifier> : <name>` and the toast "Scan device saved".
- Push to Device shows "Push succeeded" and a "Destination: …" line (took ~22 s live).
- The setup file that push produced (read back by run id, read allowance) carries an `<Employee>` in `Employee_Records` with `<Code>` = barcode, `<Name>`, `<ExportIdentifier>`, `<LastName>`, `<RfidCode>`, `<Crew>B1 CREW</Crew>`, `<DefaultJob>B1 HARVEST</DefaultJob>` (verified live: export run 375).
- NFC Code, meal waivers, gender, DOB and default ranch/field are **not** in the device export. _not asserted in the export: the office does not serialize them (observed in run 375); they are asserted on screen and on the wire instead._
- That the waivers change meal-penalty pay (6 h / 12 h rules). _not automatable here: pay-calc behaviour belongs to Journey E._
- That Earliest Start Time blocks early clock-ins on the device. _not automatable here: device-side behaviour (Journey B); the field is left at its default._
- Iris / face enrollment status. _deferred: A6 (biometric enrollment); the Edit form shows "Not enrolled" ×4 for a fresh employee._
- W4 / I-9 / H2A / paid-sick fields. _deferred: module-gated, A13 territory; not in the recording._
- Language badge. _not automatable: no Language field exists on the dev form._
- Employees list row filtered by Hire Date. _not asserted: the grid renders surname-first and virtualizes past 100 rows; the record is verified by reload + GET (EmployePage class note)._
- Badge print. _deferred: report surface, not a catalog step._
- The "Unsaved changes" bar on the New form and on-blur validation. _(POM: `SetupScreenPage.submitForm`)_
- Employee delete and device-membership removal. _teardown via `runCleanup`, not a catalog step._

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Employee list + New/Edit Employee | `Setup ▸ Employee` (`/setup/employees`, `/setup/employees/new`, `/setup/employees/<id>`) | `src/pages/setup/EmployeePage.ts` (`pages.employee`) extends `SetupScreenPage` | exists. Extend with the locators below |
| Scan Device edit | `File ▸ Administration ▸ Scan Devices & Boards` → device (`/setup/scan-devices/<id>`) | `src/pages/setup/ScanDevicePage.ts` (`pages.scanDevice`) extends `BasePage` | exists. Add the Employee-section methods below |

**EmployeePage: locators (all verified live on `/setup/employees/new` and `/<id>`, su, 2026-10-09):**

| Field (screen label) | Locator | Control / driving notes |
|---|---|---|
| Name * | `#name` (existing `nameInput`) | text; fill **last** (on-blur validity, existing pattern) |
| Barcode | `#code` (existing) | text; always typed (auto-barcode counter wedge). 10-digit value accepted |
| Export Identifier | `#exportIdentifier` | text; 10-digit value accepted |
| Last Name | `#lastName` (existing) | text |
| Department | `input#departmentCounter` | Combobox, **creatable** (placeholder "Search or add new Department…"). `pickers.pickCombobox`, anchored label |
| Crew | `#crewCounter` (existing `crewCombobox`) | Combobox; **arrives pre-filled `B1 CREW` on su**. Pick explicitly anyway (`pickCombobox` overwrites) |
| Pay Period | `button#payPeriod` | base-ui Select; default trigger text `Hourly` (hidden value `0`). Read only |
| Hourly Rate | `input#rate` | `type=number` spinbutton; `fill('25')`, reads back `25` |
| Hire Date | `page.getByRole('button', { name: 'Hire Date', exact: true })` | date-picker trigger; text = today (`10/09/2026` on 2026-10-09). Read only. (Edit form's Employment History also has a "Hire Date" *label + textbox*, not a button, so the role+exact name is unique) |
| Release Date | `getByRole('button', { name: 'Release Date', exact: true })` | trigger text "Pick a date" when empty. Not touched |
| Day Start Time | `input#dayStartTime` | `type=time`, default `00:00`. Read only |
| Gender | `button#gender` | Select; options Male / Female / Non-Binary. **Use an exact option match**: "Male" is a case-insensitive substring of "Female" |
| Date of Birth | `input#dateOfBirth` | **`type=date`**: `fill('1996-06-11')`, `inputValue()` reads `1996-06-11` (the recording's `11-06-1996` is just the recorder's locale rendering) |
| Default Ranch | `button#defaultRanchCounter` | Select (`pickers.pickSelect`). Pick **before** Default Field. Near-duplicate `B1 Test Ranch` exists: exact/anchored match |
| Default Field | `input#defaultFieldCounter` | Combobox filtered by the chosen ranch (only `B1 FIELD` offered for `B1 RANCH`). Read the combobox, never its sibling hidden JSON textbox |
| Default Job | `input#defaultJobCounter` | Combobox |
| NFC Code | `#nfcCode` | text |
| RFID Code | `#rfidCode` | text |
| Waived First Meal | `page.getByRole('switch', { name: 'Waived First Meal' })` | `span[role=switch]`, state in `aria-checked`; mirrored by hidden `input#waivedFirstMeal`. Click only when `aria-checked` is `"false"` |
| Waived Second Meal | `page.getByRole('switch', { name: 'Waived Second Meal' })` | same; hidden `input#waivedSecondMeal` |
| Active | existing `activeSwitch` (header) | on by default |
| Created toast | `page.locator('[data-sonner-toast][data-type="success"]', { hasText: 'Employee created' })` | |
| Edit heading | `page.getByRole('heading', { level: 1, name: 'Edit Employee: <name>' })` | New form heading is "New Employee" |
| Delete (reference only) | `getByRole('button', { name: 'Delete' })` → `getByRole('alertdialog', { name: 'Delete "<name>"?' })` → `Delete` → toast "Employee deleted", back to `/setup/employees` | not used by the spec |

New EmployeePage members (fill only; keep `setHomeCrew` / `readHomeCrew` untouched, Journey B depends on them):
- Extend `NewEmployeeData` with optional `exportIdentifier`, `department`, `hourlyRate`, `gender`, `dateOfBirth`, `defaultRanch`, `defaultField`, `defaultJob`, `nfcCode`, `rfidCode`, `waivedFirstMeal`, `waivedSecondMeal`. Extend `fillForm` to set them in screen order (General → Additional Info → Identification; Ranch before Field), keeping `assertCodeEditable` first and Name last. `createEmployee` keeps going through `createOnScreen` → `submitForm`.
- `readEmployeeForm()`: one object of every displayed value in the reload expectation (Select triggers by `innerText`, comboboxes by `inputValue()` matched with `PickerComponent.labelPattern`, switches by `aria-checked`, Hire Date by the button text).
- `createdToast`, `editHeading(name)` locators.

**ScanDevicePage: new Employee-section members (verified live on device 1308):**

| Element | Locator | Notes |
|---|---|---|
| Section | `page.locator('section#employee')` | heading "Employee", switch "Include Employee" (on for 1308) |
| Add picker | `page.locator('input#add-Employee')` (role combobox, name "— Add Employee —") | type the employee name to filter; the listbox is portaled: pick `page.getByRole('option', { name: '<exportIdentifier> : <name>', exact: true })` |
| Add button | `section#employee` → `getByRole('button', { name: 'Add', exact: true })` | disabled until an option is picked |
| Row | `section#employee` → `getByRole('row').filter({ hasText: '<exportIdentifier> : <name>' })` | each row has a `Remove` button; a deleted employee renders as `#<id>` |

- `addEmployee(label: string)`: scroll section into view, fill/type into `#add-Employee`, click the exact option, click Add, expect the row visible.
- `employeeRow(label)`: locator above.
- Save with the existing `save(deviceId)` (waits for `PUT /api/scan-devices/<id>`). `SCAN_DEVICE_STRINGS.savedToast` "Scan device saved" is now **verified** on dev (2026-10-09); update the class note.
- `pushToDevice()`: existing; "Push succeeded", "Destination: gukaphone2@petb1" and "Download file" all verified. Extend `PushToDeviceOutcome` with `runId: number`, captured by a `page.waitForResponse` on `POST …/connectivity/export/scan-devices/<id>` (the response body is `{ runId }`, the same body `pushSetupExport` already reads) registered before the click. Passive observation of the UI's own request, not a test write. B15 keeps working (additive field).
- Document the post-push 409 trap in the class note (see Safety constraint).

## Data

- **Scenario file**: `src/data/journey-a/a05-employee-setup.json`, validated by a new `EmployeeSetupCaseSchema` in `src/data/schemas/journeyAScenario.ts` (`.strict()`, same style as `CrewSetupCaseSchema`):
  - `employee`: `{ codeOffset: 51, exportIdentifierOffset: 52, nfcCodeOffset: 53, rfidCodeOffset: 54, department: "Guerrero", crew: "B1 CREW", hourlyRate: "25", gender: "Male", dateOfBirth: "1996-06-11", defaultRanch: "B1 RANCH", defaultField: "B1 FIELD", defaultJob: "B1 HARVEST", waivedFirstMeal: true, waivedSecondMeal: true }` (offsets must be distinct: schema refine, as journeyBScenario does)
  - `device`: `{ pocketDeviceType: 0, missingMessage: "it needs an active pocket-class scan device to push the new employee to" }` (same selection rule as A9)
  - `expected`: `{ createdToast: "Employee created", editHeadingPrefix: "Edit Employee: ", payPeriod: "Hourly", deviceSavedToast: "Scan device saved", pushSucceeded: "Push succeeded", wire: { rate: 25, payPeriod: 0, gender: 0, nonNullKeys: ["departmentCounter", "crewCounter", "defaultRanchCounter", "defaultFieldCounter", "defaultJobCounter"] }, export: { section: "Employee_Records", crew: "B1 CREW", defaultJob: "B1 HARVEST" } }`
  - `cleanup`: `[{ "kind": "delete", "entity": "employee", "name": "{employeeName}" }, { "kind": "restore", "target": "deviceEmployeeMembership" }]`
- **Generated values** (flow only, never in the JSON):
  - Name `E2EEmp_<RUN_TOKEN>_<seq>` via a new `src/data/generated/employeeFactory.ts` `makeEmployeeName()` (copy `crewFactory.ts`; prefix from `cleanupTarget('employee')`'s `factory` token `E2EEmp_`, already in `cleanupTargets.ts`, order 10) and export it from `src/data/generated/index.ts`. ~15 chars, fits Last Name's 20-char limit. Last Name = Name (as the recording).
  - Barcode `runUniqueCode(51)`, Export Identifier `runUniqueCode(52)`, NFC `runUniqueCode(53)`, RFID `runUniqueCode(54)` (`src/data/generated/scanDeviceFactory.ts`). Offsets in use today: B15 1/2/3, A4 41 → 51–54 are free. 10-digit numeric values were accepted for all four fields live.
- **Uniqueness rules**: Barcode unique across the database (and soft-deleted employees keep theirs, WEBPET-1798); Name unique per screen; Export Identifier / NFC / RFID treated as unique (run-unique anyway).

## Preconditions

- [ ] Authenticated `su` session on dev staging (`npm run test:dev`).
- [ ] Lookup rows exist and are active for su (client 1). Verified live 2026-10-09 through the pickers and their hidden record JSON: Department `Guerrero` (1, active); Crew `B1 CREW` (231, code 5001, active); Ranch `B1 RANCH` (162); Field `B1 FIELD` (99, ranch 162, active); Job `B1 HARVEST` (221, code 4201, active). Near-duplicates `B1 Test Ranch` exist: anchored labels. No arrange step creates them; a missing row fails in the picker by name.
- [ ] Barcode editable on New Employee (`assertCodeEditable`). True for su.
- [ ] An active pocket-class (type 0) scan device: `findPocketDevice(sessionApi, 0)` (A9's helper, read) resolves to **1308 "Guka Phone Pocket"** (Web, mailbox `gukaphone2@petb1`, Include Employee on, 18 employee rows) — the first active type-0 device in list order, the same one A9 exports. Push on su verified live: "Push succeeded / Destination: gukaphone2@petb1".

## API allowances

| Step / call | Endpoint | Allowance | Why |
|---|---|---|---|
| pick the device | `GET scan-devices` via existing `findPocketDevice` (journeyAFlow) | read | same device A9 uses; never minted |
| read-back after save | `GET employees/{id}` via a new `readEmployee(api, id)` in `src/utils/journeys/journeyAFlow.ts` wrapping a new `getEmployee` in `src/utils/api/employeesApi.ts` (none exists today) | read | proves the wire stored what the screen showed |
| export read-back after push | `GET connectivity/export/scan-devices/runs/{runId}` + `GET connectivity/export/runs/{runId}/sends/{sendId}/content` via a new read-only `readSetupExportSend(api, runId, deviceId)` in `src/utils/api/setupExportApi.ts` (extract the GET half of `pushSetupExport`; leave `pushSetupExport` for A9) exposed through journeyAFlow | read | proves the record synced; the push itself is the on-screen click |
| after-phase teardown | `DELETE employees/{id}` via `runCleanup` delete step `{employeeName}` | cleanup | soft delete (WEBPET-1798) |
| after-phase teardown | `GET` + `PUT scan-devices/{deviceId}` with the minted employee id removed from `employeeIds` (read-modify-write carrying `version`, like `setCrewNotifyUser`) via new restorer `deviceEmployeeMembership` | cleanup | deleting the employee leaves a dangling `#<id>` row on the shared device |
| run-start / run-end residue sweep | prefix `E2EEmp_` (already registered) | cleanup | reclaims an employee left by a killed run |

The employee, the device membership and the push are all done on screen. No preference writes.

## Cleanup

| Entity | Prefix | Id source | Route |
|---|---|---|---|
| `employee` | `E2EEmp_` (factory token, `cleanupTargets.ts`, order 10) | `pages.employee.savedIdFromUrl()` right after the first save, recorded before any assertion | `runCleanup` delete-by-name `{kind:'delete', entity:'employee', name:'{employeeName}'}` |
| device membership | — (no name) | device id from `findPocketDevice` (before the screen writes), employee id from the save URL | `runCleanup` `{kind:'restore', target:'deviceEmployeeMembership'}`; restorer removes **only** that employee id, and is a no-op when the id is absent |

- Restorer wiring: add `deviceEmployeeMembership` to `RESTORERS` in `src/utils/cleanup/runCleanup.ts`. The flow owns the snapshots Map (A9 pattern): `prepareEmployeeSetup` puts `{ deviceId }` under the target once the device is found, and `run.recordEmployeeId(id)` adds `employeeId` right after save. The after phase only restores when the Map has the target (existing branch); no 'before' phase is needed. After-phase order is already right: delete (rank 110) then restore (900); removing a dangling id is fine.
- The PUT body shape for `scan-devices/{id}` has no API precedent in the repo (B15 deletes whole devices). Generator: verify once that echoing the GET body with `employeeIds` filtered is accepted (the UI's own PUT is the reference), or fall back per Open question 3.
- Known gap: a run killed after the device save but before teardown leaves a dangling row; the residue sweep deletes the employee but not the membership. Acceptable (precedent rows #52–#54 already exist); not worth a sweep extension now.

## Flow helper

`src/utils/journeys/journeyAFlow.ts`:
- `prepareEmployeeSetup(scenario, sessionApi, testInfo)` (async; mirrors `mintCrewSetup` + `preparePieceOutConfig`): mints name and the four codes, `substituteTokens(scenario, { employeeName })`, finds the device with `findPocketDevice(sessionApi, scenario.device.pocketDeviceType)` and fails with `missingMessage` when null, seeds the snapshots Map, registers `runCleanup(..., { phase: 'after', snapshots })` via `register(testInfo, 'A5 employee-setup cleanup', …)`. Returns `{ scenario, employee: NewEmployeeData, device: { id, name }, recordEmployeeId(id), cleanup }`.
- `readEmployee(api, id)`, `readSetupExportSend(api, runId, deviceId)`: read-only wrappers. Specs may not import `@utils/api/*`.
- `employeeInExport(xml, code)` in `src/utils/export/setupExportXml.ts`: returns the `<Employee>` element (as a tag→text record) inside `Employee_Records` whose `<Code>` matches, or undefined.
- `testInfo.slow()` in the flow: the push alone took ~22 s.

## Test case

`src/data/runner/journey-a.csv` row `A5` already exists (`employeeSetup`, `regression`, enabled `0`, status `draft`); fill `jira` = `PET-12633`. Orchestrator flips `enabled`/`status` after green, then `npm run runner:sync && npm run runner:check`.

```ts
test.describe('A5 · Employee setup', { tag: ['@JourneyA', '@A5'] }, () => {
    test('[Employee Setup] End-to-end: create an employee with identity, pay, time-card defaults, badges and meal waivers, verify it persists, and push it to a scan device.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'A5' }],
    }, async ({ page, pages, sessionApi }, testInfo) => { … });
});
```

## Risks for the Healer

- A9 pushes to the same device via the API. If it lands between A5's `gotoEdit(1308)` and its device Save, the Save returns 409 ("modified by another user"). Load the device immediately before `addEmployee`; a 409 here is environment contention, not a product bug.
- Hire Date "today" is computed by the browser; read the expected ISO date in the page (`page.evaluate(() => new Date().toLocaleDateString('en-CA'))`), never from the Node clock. A run straddling midnight can disagree; not mitigated.

## Open questions for the tester

Resolved by the orchestrator on 2026-10-09:

- [x] **Home crew.** Keep `B1 CREW`, the pre-fill. Assert it on reload and on the wire. Picking another journey's crew would make the run's employee a member of that journey's crew punches.
- [x] **Pay frequency.** Set Pay Period = Hourly only, as in the recording.
- [x] **Push target.** Accept device 1308 (`gukaphone2@petb1`). A9 already pushes setup exports there on every run.
- [x] **Membership cleanup.** Use the API restorer, under the cleanup allowance. The recording ends at "Push succeeded", so the spec stops there too.

## Test Scenarios

### 1. A5 · Employee setup

**Seed:** `tests/seed.spec.ts`

#### 1.1. [Employee Setup] End-to-end: create an employee with identity, pay, time-card defaults, badges and meal waivers, verify it persists, and push it to a scan device.

**File:** `tests/web/journey-a-setup/a05-employee-setup.spec.ts`

**Steps:**
  1. Load the scenario with `loadScenario(EmployeeSetupCaseSchema, testInfo)` and call `prepareEmployeeSetup(scenario, sessionApi, testInfo)`. This mints `E2EEmp_<RUN_TOKEN>_<n>` and the four run-unique codes (`runUniqueCode(51..54)`), finds the pocket device (read GET; 1308 "Guka Phone Pocket" today) and registers the after-phase cleanup (employee delete + device-membership restore).
    - expect: The scenario validates; `run.employee.name` starts with `E2EEmp_`
    - expect: Barcode, Export Identifier, NFC and RFID are numeric, distinct, no leading zero
    - expect: `run.device.id` is set (else fails with `device.missingMessage`)
  2. Catalog steps 1-4: `pages.employee.createEmployee({ name, code, exportIdentifier, lastName: name, department: 'Guerrero', crew: 'B1 CREW', hourlyRate: '25', gender: 'Male', dateOfBirth: '1996-06-11', defaultRanch: 'B1 RANCH', defaultField: 'B1 FIELD', defaultJob: 'B1 HARVEST', nfcCode, rfidCode, waivedFirstMeal: true, waivedSecondMeal: true })`. Goes Setup ▸ Employee ▸ New Employee ▸ fill (Name last) ▸ Save. Immediately `employeeId = pages.employee.savedIdFromUrl()` and `run.recordEmployeeId(employeeId)`, before any assertion.
    - expect: `createEmployee` returns `'created'`
    - expect: Success toast "Employee created" is visible
    - expect: URL matches `/setup/employees/<employeeId>` and the h1 reads "Edit Employee: <name>"
  3. Reload: `pages.employee.gotoEditById(employeeId, name)` (full navigation; waits until Name holds the record's value), then `pages.employee.readEmployeeForm()`. Read today's ISO date in the browser: `page.evaluate(() => new Date().toLocaleDateString('en-CA'))`.
    - expect: Name, Barcode, Export Identifier, Last Name = minted values
    - expect: Department `Guerrero`, Crew `B1 CREW`, Pay Period `Hourly`, Hourly Rate `25`
    - expect: Hire Date button shows today (not typed; non-empty and equal to the wire date in the next step)
    - expect: Gender `Male`, Date of Birth `1996-06-11`
    - expect: Default Ranch `B1 RANCH`, Default Field `B1 FIELD`, Default Job `B1 HARVEST`
    - expect: NFC Code and RFID Code = minted values
    - expect: Waived First Meal and Waived Second Meal switches `aria-checked=true`; Active on
  4. Read-back: `readEmployee(sessionApi, employeeId)` (read allowance, `GET employees/{id}`).
    - expect: `name`, `code`, `exportIdentifier`, `lastName`, `nfcCode`, `rfidCode` match the minted values
    - expect: `rate` = 25, `payPeriod` = 0, `gender` = 0, `dateOfBirth` = '1996-06-11'
    - expect: `hireDate` = the browser's local today (YYYY-MM-DD); `releaseDate` is null
    - expect: `waivedFirstMeal` and `waivedSecondMeal` are true; `active` is true
    - expect: `departmentCounter`, `crewCounter`, `defaultRanchCounter`, `defaultFieldCounter`, `defaultJobCounter` are non-null
  5. Catalog step 6 (device sync, on screen): `pages.scanDevice.gotoEdit(run.device.id)`, `waitForEditReady()`, `addEmployee('<exportIdentifier> : <name>')` (Employee section ▸ "— Add Employee —" ▸ exact option ▸ Add), then `pages.scanDevice.save(run.device.id)`.
    - expect: Row `<exportIdentifier> : <name>` is visible in the Employee section
    - expect: `save` resolves on a 2xx `PUT /api/scan-devices/<id>` (POM)
    - expect: Toast "Scan device saved" is visible
  6. Push: `const { destination, runId } = await pages.scanDevice.pushToDevice()` (clicks "Push to Device" and captures `runId` from the UI's own POST response). Do not save the device form again afterwards (post-push 409).
    - expect: "Push succeeded" is visible
    - expect: `destination` starts with "Destination:" and is non-empty
    - expect: `runId` is a positive number
  7. Export read-back: `readSetupExportSend(sessionApi, runId, run.device.id)` (read allowance) and `employeeInExport(xml, code)`.
    - expect: The export has an `Employee_Records` section containing an `<Employee>` whose `<Code>` = barcode
    - expect: That element's `Name`, `ExportIdentifier`, `LastName`, `RfidCode` equal the minted values
    - expect: Its `Crew` = 'B1 CREW' and `DefaultJob` = 'B1 HARVEST'
  8. Teardown (automatic): the cleanup registered by `prepareEmployeeSetup` runs after the test, pass or fail: delete step `{employeeName}`, then restorer `deviceEmployeeMembership` removes the employee id from device `employeeIds`.
    - expect: Employee removed and device membership restored (not asserted; the `E2EEmp_` residue sweep is the backstop for the employee)
