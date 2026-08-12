# Journey B automation — status, findings and next actions

> **Superseded in part, 2026-08-12.** The team moved Journey B to XML-based automation: the specs
> build the device's own export envelope and deliver it through the relay (`src/utils/relay/`),
> then work the office through the web UI the way Amy's recording shows — sidebar ▸ Connectivity ▸
> Import ▸ Internet (the relay pull), then Transfer to Job Cards with the date range
> (`src/pages/connectivity/ImportInternetPage.ts`; `IMPORT_TRANSPORT=single-folder` keeps the
> direct importer-API path). Appium/device automation is deferred and lives on
> `feature/appium-journey-video-wip`. What still holds below: the relay facts, the office API
> contracts, and the WEBPET-1830 storage blocker. What is deferred: everything about driving the
> app, the emulator toolchain, and the CI device workflow.

**Last updated:** 2026-08-10 · Written as a session handoff: read this first, then
`test-plans/journey-b/*.md` for per-workflow detail.

---

## 1. Where things stand in one paragraph

Journey B (field capture) is automated **inside this Playwright framework** — Appium drives the real
PET Pocket Android app from inside a Playwright test, so one test covers both surfaces and produces
one report. **B1 (crew time-in) and B2 (crew move) pass end to end**: device capture → export →
office landing → **Transfer to Job Cards in the browser**, with the emulator MP4, the browser video
and a Transfer screenshot on the same report entry. Both recordings (B1 and B2) have been watched
frame by frame and the specs reconciled against them. The one caveat: on dev staging there is no object storage
(WEBPET-1830), so the device→office import cannot work and the specs **fail at the import step by
default** — a green run must mean the import was proven. `OFFICE_TRANSPORT_SUBSTITUTE=1` opts into
the substituted transport (punches created via `POST /time-cards/crew-time-in`, run annotated
`office-transport-substituted`). Nothing is committed yet.

```powershell
npm run test:device          # both specs — currently 3 passed (auth-setup + B1 + B2)
npm run test:device -- --grep '@B1'
npm run test:report
```

## 2. What is built

| Area | Files |
|---|---|
| Appium-in-Playwright fixture | `src/fixtures/device.fixture.ts` |
| Device page objects | `src/pages/device/PetPocketMainMenuPage.ts`, `PetPocketCrewInPage.ts` |
| Device helpers | `src/utils/device/{adb,deviceSeed,deviceDb,screenRecorder,exportCapture}.ts` |
| Device fixture data | `src/data/device/{petPocketFixture.ts,pet-prefs.xml}` (+ generated `*.db`, gitignored) |
| Office helpers | `src/utils/api/{setupEntitiesApi,officeFixture,connectivityImportApi,timeCardsApi,officeVerification}.ts` |
| Transfer screen | `src/pages/processing/TransferToJobCardsPage.ts` (registered in `pages.fixture.ts`) |
| Specs | `tests/web/journey-b-field/{b01-crew-time-in,b02-crew-move}.spec.ts` |
| Test plans | `test-plans/journey-b/{b01-crew-time-in,b02-crew-move-and-job-change}.md` |
| Runner rows | `src/data/runner/journey-b.csv` → `B1-001`, `B2-001` (enabled, category `workflow`) |
| Toolchain scripts | `scripts/device/{setup-android-sdk.ps1,build-apk.ps1,make-golden-db.ts,install-appium-driver.mjs,inspect-db.js}` |
| CI (untested) | `.github/workflows/journey-b-device.yml` |

Config: an **opt-in `device` project** in `playwright.config.ts` (`DEVICE=1` or `--project=device`,
`workers: 1`, 900 s timeout, Appium started via `webServer`, `chromium` project ignores the folder).
The default `npx playwright test` still collects 11 tests in 3 files.

Stack: `appium@^2.19` + `appium-uiautomator2-driver@4.2.3` (5.x needs the Appium 3 server) +
`webdriverio@^9.30`, all TypeScript. SDK/AVD/Gradle live on **D:** (`ANDROID_HOME=D:\Android\Sdk`,
`ANDROID_AVD_HOME=D:\Android\avd`, `GRADLE_USER_HOME=D:\Android\gradle-home`) because C: is full;
`playwright.config.ts` defaults these so any shell works.

## 3. Hard-won facts — do not re-discover these

**PET Pocket (device)**
- Four prefs make offline capture possible (`src/data/device/pet-prefs.xml`):
  `PktWebMailDeviceAddress` (skips the sign-in dialog; **effective only from the 2nd launch**),
  `UseCrewMode=true`, `CrewTimeInAlias`, `UseEmpHomeCrewDefVal=true` (else the roster is built from
  time cards that don't exist yet → *"No Employee belongs to this Crew"*). The file replaces prefs
  wholesale, so every alias whose button must stay visible has to be re-declared.
- `spinner_field/job/crew` are **display slots** (`clickable=false`) — select by **barcode scan**
  (`input text <code>` + Enter). One record of a type pre-fills automatically.
- **EXPORT opens a confirmation dialog**; skipping it silently serializes nothing.
- The export cannot be intercepted: `OrangeRESTClient` force-upgrades `http://`→`https://` and the app
  trusts only system CAs. The envelope is captured from the app's own log (`exportCapture.ts`).
- The wire format references records **by Code** (`LookupContents="…Employee:Code…"`); the device's
  local tables link **by Name** (`Employee_Records.CREW` = crew name).
- A crew **move updates the existing punch in place** (same row, same reference) — no second punch,
  no time-out row. 4 members + 1 move = **4 rows, not 7**.
- Screen recording can starve the emulator and drop a tap — `confirmRoster()` verifies the dialog
  closed and retries once.

**Office API (verified live on dev staging)**
- `POST ranches|fields|crews|employees|jobs` **honour a chosen `code`**; omit it and the server mints
  one. Jobs need `overtimeRulesCounter` = a `jobTypeCounter` from `GET overtime-rules`.
- Delete pattern: `GET {path}/{id}` for `version` → `DELETE {path}/{id}` with `{rowversion}`.
- Query imported punches with `GET time-cards?from&to&cardType=1`; match on `reference`.
- `sessionApi` **cannot post multipart** (it pins `Content-Type: application/json`, which discards the
  boundary) — uploads need their own context (`createUploadContext()`).
- The importer resolves employees through a **nine-rung fallback ladder** (declared column → `Name` →
  `AlternateCode` → … → the "Undefined Employee" row), so a wrong code can still return a non-null
  `employeeCounter`. **Assert id equality, never just non-null.**
- QA fixture records now exist on dev staging and are discovered-not-recreated: codes
  `4001` ranch, `4101`/`4102` fields, `4201`/`4202` jobs, `5001` crew, `6001`-`6004` employees.

**From Amy's B1 recording (watched 2026-08-10)**
- She uses a **real CipherLab RS35 handheld** screen-shared into a call — *not* an emulator. App in
  **Spanish**, device account **`S34@jensilo`**, office = LAN web-pet at `https://192.168.1.74`.
- Flow: Crew In → **"Empleado Selection"** roster dialog (absentees unchecked) → save → **EXPORTAR** →
  ~20 s later the punches are already in the office DB → she only re-applies the **date range** on
  Transfer to Job Cards, which then shows **11 records / 11 warnings**.
- **She never imports a file.** Her office ingests from the relay automatically. Our Single-Folder
  upload is therefore a *substitute transport* that exercises the same importer, not her actual path.
- The 11 warnings are *"No corresponding Time-Out/Piece-Out"* — normal for time-in-only data. Never
  treat warnings as a failure.
- Her roster showed more members than she selected and some already unchecked, so the "all
  pre-checked" behaviour our fixture sees may depend on crew size or prior state.

## 4. Blocked — one DevOps ask

**Dev staging has no object storage**, so Connectivity import cannot work there at all:
`POST /connectivity/import/single-folder` records the file `failed` with **"could not store uploaded
file"** and the run stays `received` forever (the worker only claims files whose bytes exist).
`/connectivity/import/internet` fails the same way with *"could not store pulled file"*.

Ask: set **`S3_ENDPOINT`** + bucket/credentials on the dev API. This is already ticketed as
**WEBPET-1830** (employee documents + avatars); the import case should be **appended** there — same
fix, and it widens the impact from "two upload screens" to "the whole device→office pipeline".

`PT_TRANSFER_ANALYZE_ENABLED` is **already on** for dev (probed: analyze returns 200) — do not ask
for it.

Until storage exists, `verifyImportInOffice()` **fails the test** with a message citing WEBPET-1830
(decided 2026-08-11: a pass must mean the import was proven). `OFFICE_TRANSPORT_SUBSTITUTE=1` opts
into the office-API transport substitution instead, which keeps the office half verified and
annotates the run `office-transport-substituted`.

## 5. Action items, highest value first

1. **Prove the import transport.** The office half now runs on every test (transport substituted on
   dev — see §1), but the device→office **import** itself has never executed successfully. Run
   against the **localhost stack** (MinIO) or wait for `S3_ENDPOINT` on dev (WEBPET-1830). When it
   works, the same test flips to `transport: 'device-import'` automatically and asserts
   `programCreated=true`.
   *Known intermittent:* one B1 failure on 2026-08-11 did not reproduce across four subsequent runs
   and its artifacts were overwritten before diagnosis — unexplained, not understood. CI retries and
   the wedge runbook (§7) are the current mitigations; if it recurs, capture `artifacts/results`
   before re-running.
2. **File the bugs** (content drafted in the session, evidence on disk):
   - append the import case to **WEBPET-1830** — evidence in `artifacts/bug-evidence/WEBPET-1830/`
     (video, screenshots, `network.json` showing 6 polls stuck at `received`, sample export XML);
   - new ticket: **dashboard "View …" links do nothing** (`/dashboard`; all are `<button>` with no
     `href`, clicking *View crews* leaves the URL unchanged) — verified, unrelated to storage;
   - optional AndroidPET ticket: **every failed export reports "Missing body tag"**
     (`OrangeRESTClient.getServerError()` reads a `Body` element that only exists in the *download*
     envelope, per `SyncResponse.MESSAGE_FILE_NAME`), plus a latent NPE two lines above at
     `getFirstChild().getNodeValue().equals("true")`. Project is probably `PET`, not `WEBPET`.
3. **Commit.** Nothing is committed. The branch also carries unrelated pending changes
   (`src/data/runnerList.json`, `inviestgate/`), so agree a branch/commit split first.
4. **Device → relay delivery is SOLVED — no provisioning, no DevOps** (verified 2026-08-10).
   The relay has **no accounts at all**: `OrangeMailService.svc.cs` → `ValidateUser()` only null-checks
   credentials ("Validate tokens in a future version"), so a mailbox address is just a queue key
   created on use. Nothing to request from anyone.
   The real cause of the failing export was a **missing destination**: the device sends *to* the
   office's mailbox from `server_address_preference`, which our fixture never set, so the relay
   answered *"To Address cannot be Empty"* — surfaced uselessly as "Missing body tag".
   Setting two prefs made a real export succeed (`is push file success: true`, every row stamped with
   an `ExportTime`):
   ```
   DEVICE_RELAY_SERVER=b1office@petb1
   DEVICE_RELAY_URL=https://orangeenterprises.azurewebsites.net/webmail/v6/OrangeMailService.svc
   ```
   The verified run used `qaserver@usesilo`; the office address moved to `@petb1` to match the
   device's own `b1device@petb1` and stay off the shared `@usesilo` test pool (`jenserver@usesilo`,
   `jendevice1@usesilo`), where a name collision would silently share another queue rather than
   error. Safe by construction — the relay creates a mailbox on use — but **not itself re-verified**
   against the live relay.
   Both env vars are now **set in `.env.dev`** (2026-08-11 — the unset-by-default guard meant every
   dev run re-showed the export error), and `attachAndAssertSendResult()` asserts delivery whenever
   `DEVICE_RELAY_SERVER` is set; blank both to run offline. Note the URL version matters: unset, the
   app defaults to **v1**; web-pet uses v3 and its live test v6.
   **What remains for a true end-to-end** is only the office side: web-pet must *pull* from that
   mailbox (`Connectivity ▸ Import ▸ Internet`), which needs object storage (item 1) plus the
   office-side relay config pointing at the same server address.
5. **Test the CI workflow.** `journey-b-device.yml` has never run: needs an `ANDROIDPET_TOKEN` secret
   (private repo checkout for the APK build) and one `workflow_dispatch`.
6. **Watch the B2 recording** (`docs/media/` — B1 is there; add B2) to confirm the crew *move* really
   is a second Crew In as the code suggests. Frame-extraction recipe: Playwright's bundled ffmpeg has
   **no H.264 decoder**, so drive installed Chrome (`chromium.launch({ channel: 'chrome' })`), open the
   `file://` URL, seek `video.currentTime` and screenshot — frames land in `artifacts/video-frames/`.
7. **Extend the journey**: B11 (crew-out) and B3 (individual time-in) reuse this rig; B4-B7
   (stickers/barcode hardware) and Journey C biometrics stay manual — see
   `device-capture-automation.md` §11 for the per-journey risk register.
8. **iOS**, only if crews actually field iPhones (open question 7): same harness, XCUITest driver,
   macOS runners.

## 6. Conventions that bite

- Runner rows: tier tags only (`@Regression`/`@HighLevel`/`@Smoke`) plus `@Demo` — **`@Workflow` is
  not a selectable tag**. `demo=1` requires `@Demo` on the test. Requirement ids must exist in a
  `test-plans/**` table and the spec's `requirement` annotation must match the row's `req` exactly.
  Always `npm run runner:sync && npm run runner:check` after editing the CSV.
- The runner gate **skips** any test whose row has `enabled=0` — a "passed" run with a skip is often
  just a disabled row.
- `artifacts/` is gitignored, so evidence must be attached to tickets manually.

## 7. When a device run misbehaves

- **`WebDriverError: operation was aborted due to timeout … POST /session`** — the emulator or its
  UiAutomator2 server is wedged, not a code fault. It happens after hours of use or a lot of manual
  `adb` poking; runs also crawl (a 25 s spec taking minutes) just before it gives out. Cold restart
  fixes it:
  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'appium' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  D:\Android\Sdk\platform-tools\adb.exe emu kill;  D:\Android\Sdk\platform-tools\adb.exe kill-server
  Start-Process D:\Android\Sdk\emulator\emulator.exe -ArgumentList '-avd','petpocket_rs35','-no-boot-anim'
  ```
  Expect ~1 min per spec on a freshly booted emulator versus ~25 s once warm.
- A **stale Appium server keeps its old environment** (`reuseExistingServer: true`). If a run fails
  with "no driver for automationName 'UiAutomator2'" or an SDK-path error after you changed env vars,
  kill the server with the command above and let Playwright start a fresh one.
- `npx playwright show-report` binds **9323** and fails with `EADDRINUSE` when an earlier report
  server is still up — just open `http://localhost:9323`, or pass `--port 9324`.
