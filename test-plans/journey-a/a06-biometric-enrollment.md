# A6 · Biometric enrollment

## Application Overview

Jira PET-12634 · reference re-test WEBPET-1443 (QA Gukan, 2026-10-13, client 3; test cases `docs/test-cases/WEBPET-1443-biometric-enrollment-xml.csv` A6-02/03/04/06/07/10 are this happy path) · recording `a6-iris-enrollment-happy-path-2026-10-13.webm` and screenshots `a6-iris-enrolled-employee-21223.png`, `a6-rfid-code-on-employee-21223.png`, `a6-internet-import-log-iris-and-finger.png`, `a6-setup-export-rfid-and-iris-templates-21223.png` on WEBPET-1443.

**Scope rule (journey contract, overrides the planner's generic guidance):** one spec, one happy-path test, `testCaseId` = `A6`. No negative, edge, boundary, extra-positive or setup-only cases; no EARS; no `A6-R<n>` ids.

**Run identity:** su on dev staging (`npm run test:dev`), not QA Admin. There is no reader: the device side is replayed by a run-built IrisID device file (`OrangeExportFile` with `Employee_Records`), uploaded on screen through Single Folder. Everything the recording did on client-3 fixtures (employee 21223, device 51 `qairis1443@petwebbeta`) is done here on a run-scoped employee and a run-scoped IrisID scan device, both created on screen. Live checks were read-only on su on 2026-10-13.

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `A6` |
| Journey | `A`: Setup and configuration (office) |
| Segments | `pack-house\|nursery\|perennial-grower` |
| Modules | `Bio-Identification\|Connectivity` (su: `BioIdentification: true`) |
| Surface | `device` → runner category **`ui`** (every user step is on screen, the device is a file) → `tests/web/journey-a-setup/a06-biometric-enrollment.spec.ts` |
| Demo candidate | yes (row `demo=1`) |
| Catalog status | draft (runner row `A6`: `api`, `biometricEnrollment`, `regression`, demo `1`, jira empty, `draft`, enabled `0`) |

**Summary** (from the catalog)
> Enroll employees on iris or face (preferred) or fingerprint so kiosks can identify them, with card or badge fallback for those who cannot enroll. The detailed enrollment-capture sequence is library-limited.

## Catalog steps

| # | Catalog step | What the re-test / live app shows | Automatable? |
|---|---|---|---|
| 1 | Open enrollment on a biometric device and capture iris/face (or fingerprint). | No reader. The reader's own export (`From-IrisId.xml`: `Employee_Records` → `<Employee>` with `UpdateTime`, `Code`, `Picture`, `IrisTemplateLeft`, `IrisFaceTemplate`, `IrisTemplateRight`) is imported through Tools ▸ Connectivity ▸ Import ▸ Single Folder (`/connectivity/import/single-folder`): Browse Files → Selected files lists it → Import ("Importing...") → Import Results: file + "Completed" chip + "1 imported, 0 failed". Internet Import Log (`/connectivity/import/log`), Source = Folder upload: row with Status Completed, Records imported 1, Records failed 0. | Capture: **no** (hardware). Device → office: **yes**, run-built IrisID file + on-screen import. Fingerprint: **out of scope** (WEBPET-3777) |
| 2 | Confirm status on the employee Iris tab. | Setup ▸ Employee ▸ edit: General ▸ "Face-Iris Template" panel chips go "Face / Left iris / Right iris: Not enrolled" → "Enrolled", with a "Clear template" button. Photo goes from placeholder avatar to the device picture. Iris section "Iris / Face Enrollment": Iris (Left), Iris (Right), Iris Face → Enrolled; Face stays Not enrolled. Name, crew, pay period and hire date unchanged. | yes |
| 3 | Issue RFID/badge fallback where enrollment fails. | Identification ▸ Cards ▸ "RFID Code" → type → footer "Unsaved changes" + Save. | yes (office half). Card enrolment on the reader ("Card Timed Out"): **no** |
| 4 | Verify recognition / siting. | Substitute: scan device "QA IrisId" (Device Type IrisID, Web, mailbox) ▸ Employee section ▸ Include Employee on ▸ "— Add Employee —" ▸ Add ▸ Save ▸ "Push to Device" → "Push succeeded", "Destination: <mailbox>", "Download file". The pushed file's `Employee_Records` has the employee with `<RfidCode>`, `<IrisFaceTemplate>`, `<IrisTemplateLeft>`, `<IrisTemplateRight>`, so a kiosk loaded from the cloud can recognise them. | Push + file content: **yes**. Recognition at the kiosk and siting: **no** |

## Safety constraint

- **The run creates everything it touches**: the employee (`E2EEmp_…`) and the IrisID scan device (`ZZTEST_IR_…`, a new prefix; see Data). No shared device or employee is edited. `B1 CREW` is only *selected* (the New form's pre-fill) and never edited.
- **Push makes the open device form stale** (ScanDevicePage class note): after Push to Device, never Save the device again in the same page.
- **Import is not reversible**: the import run is a permanent audit row in the Internet Import Log. The data it wrote (templates and photo on the run's employee) leaves with the employee's soft delete.
- **`updateBioDevicesOnEmpChange` = true on su**: saving the employee (RFID step) may queue a background export to bio devices. That is product behaviour. The read-back is keyed by the push's own `runId`, so it cannot pick up that export.

## Expected outcomes

- Creating the employee on screen (Name, Barcode, Export Identifier, Last Name, Crew `B1 CREW`) shows "Employee created" and moves to `/setup/employees/<id>`.
- Creating the scan device on screen with Device Type "IrisID IT100" (value `18`), Connectivity Web and IP / Email Address = the run mailbox succeeds and returns a `deviceCounter`.
- Before the import, the employee shows Iris (Left), Iris (Right), Iris Face and Face all "Not enrolled"; the Face-Iris Template chips read "Face: Not enrolled", "Left iris: Not enrolled", "Right iris: Not enrolled"; and the Photo shows no image (Photo ▸ Clear disabled).
- After Browse Files picks the run's device file, "Selected files" lists its file name and Import becomes enabled.
- Import shows the file under Import Results with a "Completed" chip and "1 imported, 0 failed".
- With Source = "Folder upload" and File filtered to the file name, the Internet Import Log row shows Source "Folder upload", Status "Completed", Records imported `1`, Records failed `0`, and Run = the run id the upload created.
- After a full reload, the employee shows the Face-Iris Template chips "Face: Enrolled", "Left iris: Enrolled", "Right iris: Enrolled" and a "Clear template" button.
- The Photo shows the picture from the device file: an `<img>` renders at the synthetic picture's pixel size and Photo ▸ Clear is enabled. This works because `faceIdPicturesOverwriteEmployeePictures` is true and the header's `DeviceWebMail` resolves to the run's device.
- The Iris section shows Iris (Left), Iris (Right) and Iris Face "Enrolled", and Face "Not enrolled". The file carries no plain face template.
- Name, Barcode, Crew, Pay Period and Hire Date are unchanged by the import (equal to the pre-import read).
- Typing an RFID Code and saving persists it: after reload, the RFID Code field holds the minted value and the Iris section still shows the three Enrolled rows.
- Adding the employee to the device's Employee section (Include Employee on) shows the row `<exportIdentifier> : <name>`, and Save shows "Scan device saved".
- Push to Device shows "Push succeeded", a "Destination: <run mailbox>" line and a "Download file" button.
- The pushed setup file (read back by run id) has, in `Employee_Records`, an `<Employee>` whose `<Code>` is the barcode, `<Name>` is the name, `<RfidCode>` is the minted RFID, and `<IrisTemplateLeft>`, `<IrisFaceTemplate>`, `<IrisTemplateRight>` equal the bytes the device file sent (compared with whitespace removed).
- Live capture on the reader. _not automatable: needs IrisID hardware. Replaced by importing the reader's own file format._
- Fingerprint enrollment (FingerScanner `<FingerprintTemplate>` / `<EnrollmentScore>`). _out of scope: WEBPET-3777. The employee form has no Finger Template section, so there is nothing on screen to assert; the builder takes that variant as a one-line addition later._
- Recognition at the kiosk, and siting / lighting. _not automatable: device-side. Substituted by the pushed file carrying the templates._
- Enrolling an RFID card on the reader ("Card Timed Out" in Amy's 08-27 run). _not automatable: needs reader + card. The office half (RFID Code → push) is asserted._
- Face-Iris glyphs (eye / smiley). _not asserted: icon-only, no text or label._
- `<Picture>` in the pushed file. _deferred: whether IrisID exports carry the picture (`exportPicturesToFaceIdDevices` = true on su) is unverified, and the catalog step is about templates._
- Clear template (Cancel discards, Save clears). _deferred: not the happy path (CSV A6-11/A6-12)._
- Audit-trail masking of templates. _deferred: not a catalog step (CSV A6-15)._
- Unknown-badge import failure (PET-12763). _excluded: negative case, outside the journey contract._
- The transient "Importing..." / "Pushing..." labels. _not asserted: too fast to observe reliably (POM, same reasoning as `pushToDevice`)._
- The "Unsaved changes" bar on the RFID edit. _(POM: `SetupScreenPage.saveEdit` waits for it to hide)._
- The Download file contents. _not asserted through the browser download: the same file is read back by run id (read allowance)._
- Employee and device delete. _teardown via `runCleanup`, not a catalog step._

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| New/Edit Employee | `Setup ▸ Employee` (`/setup/employees/new`, `/<id>`) | `src/pages/setup/EmployeePage.ts` (`pages.employee`) | exists; extend |
| Scan Device new/edit | `File ▸ Administration ▸ Scan Devices & Boards` (`/setup/scan-devices/new`, `/<id>`) | `src/pages/setup/ScanDevicePage.ts` (`pages.scanDevice`) | exists; extend |
| Single Folder import | `Connectivity ▸ Import ▸ Single Folder` (`/connectivity/import/single-folder`) | `src/pages/connectivity/ImportSingleFolderPage.ts` (`pages.importSingleFolder`) | **to write** (extends `BasePage`; sibling of `ImportInternetPage`) |
| Internet Import Log | `Connectivity ▸ Import ▸ Import Log` (`/connectivity/import/log`; h1 "Internet Import Log") | `src/pages/connectivity/ImportLogPage.ts` (`pages.importLog`) | **to write** (extends `BasePage`) |

Register both new pages in `src/fixtures/pages.fixture.ts` (`readonly importSingleFolder`, `readonly importLog`, lazy getters like `importInternet`).

**ImportSingleFolderPage** (live-verified unless marked):

| Member | Locator / behaviour |
|---|---|
| `pageUrl` | `/connectivity/import/single-folder`; `heading` = `getByRole('heading', { level: 1, name: 'Single Folder' })` |
| `browseButton` | `getByRole('button', { name: 'Browse Files' })` |
| `fileInput` | `main input[type=file]` (accept `.xml,.txt,.csv,.json,.zip`, multiple). Reference only: drive the chooser |
| `importButton` | `getByRole('button', { name: /^Import$\|^Importing/ })`; disabled until a file is selected |
| `selectedFiles` | `getByRole('region', { name: 'Selected files' })`; empty state "No files selected." |
| `selectedFile(name)` | `selectedFiles.getByText(name, { exact: true })` |
| `results` | `getByRole('region', { name: 'Import Results' })`. Confirm on first run; the recording shows heading "Import Results" (fallback: the heading's parent section) |
| `resultRow(name)` | `results.getByRole('listitem').filter({ hasText: name })`. Holds the status chip ("Completed") and the summary "1 imported, 0 failed". Confirm markup on first run |
| `selectFiles(paths)` | `const chooser = page.waitForEvent('filechooser'); await browseButton.click(); (await chooser).setFiles(paths)`; then expect each `selectedFile` visible |
| `importSelected(): Promise<{ runId: number }>` | registers `waitForResponse(POST …/connectivity/import/single-folder)` before clicking Import (passive, the UI's own request; body carries `runId ?? id`, as `importDeviceExport` reads it); fails with status + body on non-2xx |
| `waitForResult(name, timeout = IMPORT_RESULT_TIMEOUT_MS)` | `expect(resultRow(name)).toContainText(/Completed\|Failed/)` within the budget; returns the row's text. Budget 180 s (env-overridable): the import worker can take minutes to claim a file on dev |

**ImportLogPage**:

| Member | Locator / behaviour |
|---|---|
| `pageUrl` | `/connectivity/import/log`; h1 "Internet Import Log" |
| `grid` | `getByRole('grid', { name: 'Internet Import Log' })`; count `getByTestId('data-grid-count')` ("Total N rows") |
| `sourceSelect` | `getByRole('combobox', { name: 'Source' })`. **Defaults to "Webmail"**; options "All sources" / "Webmail" / "Folder upload" / "Unknown" (values `__all__`/`webmail`/`upload`/`unknown`) |
| `fileFilter` | `grid.getByRole('row').nth(1).getByRole('columnheader').nth(1).getByRole('textbox')` (filter row; placeholder "Filter…"). Column index by header name, not a literal |
| `filterBySource(label)` | open `sourceSelect`, click `getByRole('option', { name: label, exact: true })`, expect trigger text = label |
| `filterByFile(name)` | `fileFilter.fill(name)` |
| `row(name)` | `grid.getByRole('row').filter({ hasText: name })` |
| `readRow(name): Promise<Record<string,string>>` | header texts from row 0 → index map; returns `{ File, Source, Owner, Status, Message, 'Records imported', 'Records failed', Run, … }` from the row's `cell`s |

**EmployeePage** additions (keep `fillForm`, `readEmployeeForm`, `setHomeCrew` untouched):

| Member | Locator / behaviour |
|---|---|
| `faceIrisLabel` | `page.locator('section#general').getByText('Face-Iris Template', { exact: true })`. Hidden on su today (no IrisID device); expected once the run's IrisID device exists (WEBPET-2415 gate). Confirm on first run |
| `faceIrisChip(slot: 'Face' \| 'Left iris' \| 'Right iris')` | `section#general.getByText(new RegExp('^' + slot + ': (Enrolled\|Not enrolled)$'))` |
| `readFaceIrisChips(): Promise<Record<slot, string>>` | status part of each chip |
| `clearTemplateButton` | `getByRole('button', { name: 'Clear template' })`. Never clicked |
| `photoGroup` | `section#general [data-slot=label]` with text `Photo`, then `..` (label + avatar + Load/Capture/Clear). Verified: no-photo state is an SVG with `Clear` **disabled** |
| `photoClearButton` | `photoGroup.getByRole('button', { name: 'Clear', exact: true })` (scoped: Crew and Hire Date also have "Clear" buttons) |
| `photoImage` / `readPhotoSize()` | `photoGroup.locator('img')`; `naturalWidth`/`naturalHeight` once `complete`. Picture endpoint `GET /api/employees/{id}/picture?v=…` (404 when none) |
| `irisSection` | `page.locator('section#iris')` (heading "Iris / Face Enrollment"; `dl > div` of `dt` label + `dd` badge) |
| `readIrisEnrollment(): Promise<Record<string,string>>` | `{ 'Iris (Left)': 'Not enrolled', 'Iris (Right)': …, 'Iris Face': …, 'Face': … }` from `dt`/`dd` innerText. Exact label keys: "Face" is a substring of "Iris Face" |
| `readProfileSummary()` | `{ name, code, exportIdentifier, lastName, crew, payPeriod, hireDate, rfidCode, active }`. Light read reusing the existing locators. `readEmployeeForm()` waits 10 s per empty picker, too slow here |
| `setRfidCode(code)` | `rfidCodeInput.fill(code)` → expect `unsavedChangesBar` visible → `saveEdit()` (existing; waits for `PUT employees/{id}` and re-opens) |

**ScanDevicePage** additions (B15 and A5 callers unchanged):

- `DEVICE_TYPE` gains `irisId: '18'` (option text "IrisID IT100", verified).
- `createDevice(general, deviceType: string = DEVICE_TYPE.generic)`: additive parameter, passed to `selectOption(...)`.
- `includeEmployeeSwitch` = `employeeSection.getByRole('switch', { name: /^Include Employees?$/ })` ("Include Employee" verified on device 1308; the device-51 recording reads "Include Employees"). `setIncludeEmployee()` clicks only when `aria-checked="false"`, then expects `"true"`.
- `addEmployee(label)`, `save(id)`, `savedToast`, `pushToDevice()` (`{ destination, runId }`), `pushDownloadFile`: existing, reused as is.

## Data

- **Scenario**: `src/data/journey-a/a06-biometric-enrollment.json`, validated by a new `BiometricEnrollmentCaseSchema` in `src/data/schemas/journeyAScenario.ts` (`.strict()`, offsets refined distinct, A5 style):
  - `annotations`: `[{ type: "out-of-scope", description: "Fingerprint enrollment: WEBPET-3777 (no Finger Template section on the employee form)" }, { type: "not-automatable", description: "Live capture, kiosk recognition/siting and card enrolment on the reader need IrisID hardware" }]`, pushed onto `testInfo` by the flow (A9 pattern).
  - `employee`: `{ codeOffset: 61, exportIdentifierOffset: 62, rfidCodeOffset: 63, crew: "B1 CREW" }`. Offsets in use: B15 1–3, A4 41, A5 51–54, so 61–63 are free.
  - `device`: `{ prefix: "ZZTEST_IR_", referenceLead: "I", type: "irisId" }`
  - `deviceFile`: `{ fileStem: "From-IrisId", templateBytes: { irisTemplateLeft: 540, irisFaceTemplate: 2151, irisTemplateRight: 540 }, picture: { width: 96, height: 96 } }`. 540 → 720 base64 chars and 2151 → 2868 chars, the real file's lengths.
  - `preferenceGate`: `{ key: "faceIdPicturesOverwriteEmployeePictures", expected: true, message: "the device picture only replaces the employee photo when faceIdPicturesOverwriteEmployeePictures is on" }`
  - `expected`: `{ createdToast: "Employee created", notEnrolled: "Not enrolled", enrolled: "Enrolled", faceIrisSlots: ["Face","Left iris","Right iris"], irisEnrolled: ["Iris (Left)","Iris (Right)","Iris Face"], irisNotEnrolled: ["Face"], importStatus: "Completed", importSummary: "1 imported, 0 failed", log: { source: "Folder upload", status: "Completed", recordsImported: "1", recordsFailed: "0" }, deviceSavedToast: "Scan device saved", pushSucceeded: "Push succeeded" }`
  - `cleanup`: `[{ "kind": "delete", "entity": "employee", "name": "{employeeName}" }, { "kind": "delete", "entity": "scanDevice", "name": "{deviceName}" }]`
- **Generated values** (flow only):
  - Employee name `makeEmployeeName()` (`E2EEmp_`). Barcode `runUniqueCode(61)` (also the file's `<Code>`). Export Identifier `runUniqueCode(62)`, which makes the device picker label `<exportIdentifier> : <name>` deterministic. RFID `runUniqueCode(63)`. Last Name = Name.
  - Device: `makeScanDevice('ZZTEST_IR_', 'I')` → name `ZZTEST_IR_<RUN_TOKEN>`, reference prefix `I<last 2>`, mailbox `ZZTEST_IR_<RUN_TOKEN>@silo`. Add an optional `referenceLead = 'Z'` parameter to `makeScanDevice` (B15 unchanged) and `six('ZZTEST_IR_')` to the `scanDevice` prefixes in `cleanupTargets.ts`. **Why a new prefix**: B15's `ZZTEST_SD_<RUN_TOKEN>` would collide with A6 on name, reference prefix and mailbox whenever both run in the same worker.
  - Device file name `From-IrisId-<RUN_TOKEN>-a<retry>.xml`, written to `testInfo.outputPath(name)` and attached.
  - Templates: `crypto.randomBytes(n).toString('base64')` per run, at `templateBytes` lengths.
  - Picture: a synthetic `width×height` JPEG drawn per run on a browser canvas (random-colour gradient + ellipse, `canvas.toDataURL('image/jpeg', 0.85)`, prefix stripped) via `page.evaluate`. The repo has no JPEG library. **No real biometric data or face photo is committed.**
- **Envelope builder** (`src/utils/relay/exportEnvelope.ts`, beside `buildCodeHistorySection`):
  - Extract the duplicated header into a private `envelopeHeader(deviceAddress, iso)`, used by `buildCrewTimeInEnvelope`, `buildEnvelope` and the new builder. **Both existing outputs must stay byte-identical**: compare a built envelope before and after.
  - `DEVICE_SCHEMA.biometric = { tags: { picture: 'Picture', irisTemplateLeft: 'IrisTemplateLeft', irisFaceTemplate: 'IrisFaceTemplate', irisTemplateRight: 'IrisTemplateRight' } }`. Reuse `grid.employee`, `grid.code`, `grid.lookupEmployeeByCode`, and `tags.updateTime`.
  - `export interface BiometricEnrollment { employeeCode: string; picture?: string; irisTemplateLeft?: string; irisFaceTemplate?: string; irisTemplateRight?: string }`
  - `const BIOMETRIC_FIELDS: ReadonlyArray<readonly [keyof BiometricEnrollment, string]>` in the real file's order (Picture, IrisTemplateLeft, IrisFaceTemplate, IrisTemplateRight). A FingerScanner row (`fingerprintTemplate`, `enrollmentScore`) is one schema tag plus one array entry later.
  - `export function buildBiometricEnrollmentEnvelope({ deviceAddress, at = new Date(), enrollments }): { xml: string }` emits `<OrangeExportFile>` + header + `<Employee_Records LookupContents="Employee:Code"><Employee><UpdateTime/><Code/>…fields present…</Employee></Employee_Records>`. Absent fields are omitted, not emitted empty. `UpdateTime` = now, so it is newer than the employee row created moments earlier.
- **Uniqueness rules**: Barcode unique across the DB (soft-deleted employees keep theirs, WEBPET-1798). Device Name / Reference Prefix are run-unique. The importer resolves the device by exact `DeviceWebMail` == `WebMailAddress` (Deleted=0), and the employee by `<Code>` (a missing code fails with Name NULL).

## Preconditions

- [ ] Authenticated `su` session on dev staging (`npm run test:dev`).
- [ ] `faceIdPicturesOverwriteEmployeePictures` = true (read, verified 2026-10-13). The flow fails with `preferenceGate.message` otherwise. No preference write.
- [ ] `BioIdentification` module on for su (session/me, verified). Not re-read by the spec: the Iris section renders regardless.
- [ ] Crew `B1 CREW` exists (A5 precondition; the New Employee form pre-fills it on su).
- [ ] Everything else (employee, IrisID device, device file) is created by the test on screen or in code.

## API allowances

| Step / call | Endpoint | Allowance | Why |
|---|---|---|---|
| preference gate | `GET preferences` via `readPreferenceGate` (journeyAFlow) | plumbing read | fails the scenario by key before anything is created; the screens prove every outcome |
| device file | none: built in code, written to `testInfo.outputPath` | device | the reader's export; the import itself is the on-screen click |
| pushed file | none: the screen's own "Download file" saved with `ScanDevicePage.downloadPushedFile`, parsed by `readPushedEmployee(path, code)` | none (on screen) | proves the kiosk would receive the templates + RFID |
| after-phase teardown | `DELETE employees/{id}` via `runCleanup` `{employeeName}` | cleanup | soft delete |
| after-phase teardown | `DELETE scan-devices/{id}` via `runCleanup` `{deviceName}` (existing `scanDevice` kind) | cleanup | run-scoped device |
| after-phase teardown | relay `drainMailbox(relay.url, device mailbox)` (relay, not the app API) | cleanup | the push queued a file for a mailbox nothing will ever pull (B15 acks for the same reason) |
| run-start / run-end residue sweep | prefixes `E2EEmp_` (registered), `ZZTEST_IR_` (**add**) | cleanup | reclaims a killed run's rows |

The employee create, device create, Single Folder import, RFID save, device Employee add/Save and Push are all on screen. No preference writes.

## Cleanup

| Entity | Prefix | Id source | Route |
|---|---|---|---|
| `employee` | `E2EEmp_` (`cleanupTargets.ts`, order 10) | `pages.employee.savedIdFromUrl()` right after create, recorded before any assertion | `runCleanup` delete `{employeeName}` |
| `scanDevice` | `ZZTEST_IR_` (**new** `six(...)` entry, order 15) | `createDevice` return (POST response `deviceCounter`) | `runCleanup` delete `{deviceName}` |
| relay mailbox | n/a | device mailbox | `drainMailbox` in the registered cleanup, before `runCleanup` |
| import run | n/a | n/a | not removable: permanent audit row in Internet Import Log |

- Order: the employee goes first (10), then the device (15). Deleting an employee a device still lists is accepted (A5, verified live 2026-10-09); the device delete then removes the membership with it.
- No new cleanup kind or restorer is needed.

## Flow helper

`src/utils/journeys/journeyAFlow.ts` (specs reach `@utils/api|relay|cleanup` only through here):

- `prepareBiometricEnrollment(scenario: BiometricEnrollmentCase, sessionApi: APIRequestContext, testInfo: TestInfo): Promise<BiometricEnrollmentRun>`
  - Pushes `scenario.annotations` and calls `testInfo.slow()`.
  - Reads the preference gate and throws `preferenceGate.message` on mismatch.
  - Mints the name, the three codes and the device.
  - Calls `substituteTokens(scenario, { employeeName, deviceName })`.
  - Registers `register(testInfo, 'A6 biometric-enrollment cleanup', async (api) => { await drainMailbox(relayConfig().url, device.webMailAddress).catch(() => undefined); await runCleanup(scenario.cleanup, api, testInfo, { phase: 'after' }); })`.
  - Returns `{ scenario, employee: NewEmployeeData /* name, code, exportIdentifier, lastName, crew */, rfidCode, device: ScanDeviceGeneral, deviceType: DEVICE_TYPE.irisId, deviceLabel /* `${exportIdentifier} : ${name}` */, cleanup }`.
- `writeBiometricDeviceFile(run, page: Page, testInfo): Promise<BiometricDeviceFile>`
  - Generates the templates and the canvas JPEG.
  - Calls `buildBiometricEnrollmentEnvelope({ deviceAddress: run.device.webMailAddress, enrollments: [{ employeeCode: run.employee.code, picture, ...templates }] })`.
  - Writes the file to `testInfo.outputPath(fileName)` and attaches it (`application/xml`).
  - Returns `{ path, fileName, templates: Record<'irisTemplateLeft'|'irisFaceTemplate'|'irisTemplateRight', string>, picture: { width, height } }`.
  - Payload generators live in a new `src/utils/relay/biometricPayload.ts` (`randomTemplate(bytes)`, `syntheticPortraitJpeg(page, w, h)`).
- `readPushedEmployee(api, runId, deviceId, code): Promise<PushedEmployee | undefined>`
  - Calls `readSetupExportSend` + `employeeInExport(xml, code)` and attaches the xml.
  - Returns `{ fields, templates }`, where `templates` are keyed like `BiometricDeviceFile.templates`, mapped through `DEVICE_SCHEMA.biometric.tags`, with whitespace stripped, so the spec never writes a literal tag.
- `employeeInExport` (`src/utils/export/setupExportXml.ts`) already copes: `[^<]*` matches multi-kilobyte base64 including line breaks. It only reads attribute-less flat children (fine for these tags). Values are `.trim()`med; the flow strips inner whitespace.

## Test case

`src/data/runner/journey-a.csv` row `A6` flips to: `category` **`ui`**, `jira` **`PET-12634`**, `status` **`automated`**, `enabled` **`1`** after green. Keep `demo=1`, so the test **must carry `@Demo`** (`scripts/runner/check.js`). Tags stay `regression`. Then `npm run runner:sync && npm run runner:check`.

| id | Title | Tags | enabled |
|---|---|---|---|
| `A6` | Biometric enrollment | `regression` (+ `@Demo`) | 0 → 1 after green |

```ts
test.describe('A6 · Biometric enrollment', { tag: ['@JourneyA', '@A6'] }, () => {
    test('[Biometric Enrollment] End-to-end: import an IrisID enrollment for a new employee, confirm it on the employee, issue an RFID fallback and push both to the IrisID device.', {
        tag: ['@Regression', '@Demo'],
        annotation: [{ type: 'testCaseId', description: 'A6' }],
    }, async ({ page, pages, sessionApi }, testInfo) => { … });
});
```

**Steps:**

1. `loadScenario(BiometricEnrollmentCaseSchema, testInfo)` → `prepareBiometricEnrollment(scenario, sessionApi, testInfo)`.
   - expect: the scenario validates; the preference gate passes (read)
   - expect: `run.employee.name` starts with `E2EEmp_`, `run.device.name` with `ZZTEST_IR_`; Barcode, Export Identifier and RFID are numeric and distinct
2. Create the employee on screen: `pages.employee.createEmployee({ name, code, exportIdentifier, lastName: name, crew: 'B1 CREW' })`; immediately `employeeId = pages.employee.savedIdFromUrl()`.
   - expect: `createEmployee` returns `'created'`; toast "Employee created"; URL `/setup/employees/<employeeId>`
3. Create the IrisID device on screen: `deviceId = await pages.scanDevice.createDevice(run.device, run.deviceType)` (Device Type "IrisID IT100", Web, IP / Email Address = run mailbox).
   - expect: `deviceId` is a positive number
4. Baseline: `pages.employee.gotoEditById(employeeId, name)`; `before = readProfileSummary()`; `readIrisEnrollment()`; `readFaceIrisChips()`.
   - expect: Iris (Left), Iris (Right), Iris Face, Face all "Not enrolled"
   - expect: Face-Iris chips Face / Left iris / Right iris all "Not enrolled"
   - expect: Photo ▸ Clear is disabled (no picture yet)
5. Build the device file: `file = await writeBiometricDeviceFile(run, page, testInfo)`.
   - expect: `file.templates` lengths are 720 / 2868 / 720 base64 chars
6. Catalog step 1 on screen: `pages.importSingleFolder.goto()`; `selectFiles([file.path])`; `{ runId } = importSelected()`; `waitForResult(file.fileName)`.
   - expect: "Selected files" lists `file.fileName`; Import is enabled before the click
   - expect: Import Results row for `file.fileName` shows "Completed" and "1 imported, 0 failed"
7. Import log: `pages.importLog.goto()`; `filterBySource('Folder upload')`; `filterByFile(file.fileName)`; `readRow(file.fileName)`.
   - expect: Source "Folder upload", Status "Completed", Records imported "1", Records failed "0", Run = `runId`
8. Catalog step 2: `pages.employee.gotoEditById(employeeId, name)` (full reload).
   - expect: Face-Iris chips Face / Left iris / Right iris all "Enrolled"; "Clear template" button visible
   - expect: Photo `<img>` visible with natural size `file.picture.width × height`; Photo ▸ Clear enabled
   - expect: Iris (Left), Iris (Right), Iris Face "Enrolled"; Face "Not enrolled"
   - expect: `readProfileSummary()` name, code, crew, payPeriod, hireDate equal `before`
9. Catalog step 3: `pages.employee.setRfidCode(run.rfidCode)`, then `gotoEditById(employeeId, name)`.
   - expect: "Unsaved changes" appears before Save (POM); after reload the RFID Code field = `run.rfidCode`
   - expect: Iris section still shows the three "Enrolled" rows
10. Device sync on screen: `pages.scanDevice.gotoEdit(deviceId)`; `waitForEditReady()`; `setIncludeEmployee()`; `addEmployee(run.deviceLabel)`; `save(deviceId)`.
    - expect: Include Employee switch `aria-checked="true"`; row `<exportIdentifier> : <name>` visible
    - expect: toast "Scan device saved"
11. Catalog step 4 (substitute): `{ destination, runId: pushRunId } = await pages.scanDevice.pushToDevice()`. Do not save the device again.
    - expect: "Push succeeded"; `destination` contains `run.device.webMailAddress`; "Download file" visible; `pushRunId` > 0
12. Read-back: `pushed = await readPushedEmployee(sessionApi, pushRunId, deviceId, run.employee.code)`.
    - expect: `pushed` defined (Employee_Records carries `<Code>` = barcode)
    - expect: Name = run name; RfidCode = `run.rfidCode`
    - expect: IrisTemplateLeft, IrisFaceTemplate, IrisTemplateRight each equal `file.templates` (whitespace-stripped)
13. Teardown (automatic, pass or fail): drain the device mailbox, then `runCleanup` deletes the employee (`{employeeName}`) and the scan device (`{deviceName}`).
    - expect: not asserted; the `E2EEmp_` / `ZZTEST_IR_` residue sweeps are the backstop

## Confirmed on the first green runs (2026-10-13, su, dev staging)

- The importer accepts random template bytes and the builder's `26.01.22` header version: 1 imported / 0 failed.
- The Face-Iris Template panel renders once the run's IrisID device exists.
- The photo keeps its 96×96 natural size, and the pushed file carries the imported template bytes unchanged.
- The left sidebar has its own "Import" button, so the Single Folder locators are scoped to `main`.

## Risks for the Healer

- **Import worker latency**: dev can leave an uploaded file at `received` for minutes. A `waitForResult` timeout with the chip still pending is environment trouble, not a product bug. Check the Import Log row / `GET connectivity/import/runs/{runId}` before touching anything.
- **Face-Iris panel gate**: hidden on su until an IrisID device exists. If it stays hidden after the device is created, report the gate (WEBPET-2415). Do not drop the assertions; the Iris section carries the same truth.
- **Synthetic templates**: if the importer validates template structure and fails the row, that is a finding to report, not a reason to commit real biometric data.
- **Header version**: the real IrisID file says `18.00.24`; the builder sends `DEVICE_VERSION` (`26.01.22`). The importer requires only `<Version>1</Version>`. Confirm on first run.
- **Photo size**: if the server re-encodes the picture, the natural-size equality fails. Report it; do not weaken the check to "any image".
- **Post-push 409**: never Save the device after Push in the same page.

## Open questions for the tester

None blocking. Items marked "confirm on first run" above are verification points for the Generator/Healer, not open questions.
