# Device Capture Automation — Feasibility Study (Journeys B & C)

**Date:** 2026-08-07
**Trigger:** Amy Sandoval's demo video *"Journey B1 Crew Time In.mp4"* (Google Drive,
[link](https://drive.google.com/file/d/1rTrcGLQRG8KpGMo2vuTTjfS63x5HJIIf/view), uploaded 2026-08-06)
**Scope:** Journey B "Field harvest day (mobile field capture)" and Journey C "Pack-house day
(fixed-site kiosk capture)" from `docs/catalog/PET-Tiger-Workflow-Catalog.docx`.

Every claim below carries its source (a repo path, catalog workflow id, or a live check).
Items that only Amy or the web-pet/DevOps team can answer are collected in section 9 —
they are clearly separated from verified facts.

---

## 1. Journey B1 recap and what the video shows

Catalog **B1 · Crew time-in**: a supervisor clocks an entire crew into a field and job from one
screen, unchecking anyone absent; time, GPS, assignment, and the participating roster are captured,
then the data syncs to the office. B1 depends on office setup from **A2** (ranch/field), **A3**
(job), **A4** (crew), **A5** (employees), and **A7** (scan device registration + data scoping).

From the video (user-confirmed): Amy's office side is a **web-pet instance on a LAN IP** —
`https://192.168.1.74/transfer-to-job-cards` — and the crew punches are verified on the
**Transfer to Job Cards** screen (catalog **D2**; web-pet
`apps/web/src/features/transfer/v2/TransferToJobCardsPageV2.tsx`, route registered at
`apps/web/src/app/router/AppRouter.tsx:1251`).

Her rig end to end:

```
Android emulator (PET Pocket)  →  sync  →  LAN-hosted web-pet
        →  Post Office import (D1)  →  Transfer to Job Cards review (D2)
```

## 2. Amy's toolchain (the answer to "what emulator / how is crew data exported")

- **The app is PET Pocket** — the native mobile client:
  [AndroidPET](https://github.com/orangeenterprisesinc/AndroidPET) (Java; flavor dimensions
  `personal/full` × `playStore/fingerScanner/irisId` × `cloudPet/windowsPet`, see
  `AndroidPET/app/build.gradle`) and [iOSPET](https://github.com/orangeenterprisesinc/iOSPET)
  (Objective-C; schemes include "PetPocket Cloud").
- **Correction (2026-08-10, after watching the recording): Amy uses a REAL handheld, not an
  emulator.** The video is a screen-share call whose second participant is literally titled
  "RS35's screen" — a physical CipherLab **RS35**, with the app running in **Spanish** (*Hora de
  Entrada de la Cuadrilla*) and signed in as device **`S34@jensilo`**. The office side is her
  LAN-hosted web-pet at `https://192.168.1.74`. The earlier assumption that she demoed on an AVD was
  inferred from the repo, not from the video, and is wrong.
- **The emulator is still the right choice for automation** — and the org supplies the profiles for
  it: `AndroidPET/Docs/ReadMeDebugger.md` ships AVD hardware profiles as XML for those same field
  devices — CipherLab **RS30** (`Rs30Device.xml`), **RS35** (`Rs35Device.xml`), Emdoor **RD40T**
  (`Rd40tDevice.xml`), FingerScanner, IrisID. The automation runs the RS35 profile, so it mirrors
  Amy's hardware without needing the hardware.
- **"Exporting the crew details" is catalog A7 "Export Setup to Scan Devices"**, not a separate
  tool. The office pushes crews/employees/jobs/fields to the device through the **OrangeMailWS
  "Post Office" relay** (Azure SOAP/REST:
  `https://orangeenterprises.azurewebsites.net/webmail/v3|v6/OrangeMailService.svc`). web-pet has
  ported the office side: `apps/api/internal/connectivity/` (`device_export_run.go`,
  `device_import_orchestrator.go`, the `webmail/` REST client) and the UI
  (`scan-device/usePushScanDevice.ts`, `connectivity/export/ExportToScanDevicesPage.tsx`).
- **A sanctioned live relay round-trip already exists**:
  `apps/api/internal/connectivity/webmail/live_roundtrip_test.go` (WEBPET-1044) drives the real
  client against the live relay using disposable test mailboxes (`jenserver@usesilo` server,
  `jendevice1@usesilo` device; on the test relay the password defaults to the account name).
  Gated by `WEBMAIL_LIVE_TEST=1`, never run in CI. Our device mailbox should copy this convention.
- Device onboarding in web-pet: **Setup → Scan Devices** (device carries `webMailAddress`,
  3-char `referencePrefix`, `connectivityMethod=WebMail(4)`) plus Reports → **"Install PET
  Pocket"** (`DeviceInstallCards` Crystal-proxy report printing per-device install cards).

## 3. Manual setup runbook (reproduce Amy's rig)

1. **Workstation** — Android Studio + SDK. Import `AndroidPET/Docs/Rs35Device.xml` as an AVD
   hardware profile (Android 10/11, API 29 — matches CipherLab RS35). Enable virtualization
   (WHPX/Hyper-V on Windows).
2. **APK** — clone AndroidPET and build `gradlew.bat assembleDebug` for the
   `fullPlayStoreWindowsPetDebug` variant (debug builds need no signing keystore), or sideload the
   released APK from `tigerjill.com/download/AndroidPet/`.
3. **Office side — two variants:**
   - *Amy's rig (video):* web-pet hosted on the LAN (`https://192.168.1.74/...`), emulator and
     office on the same network.
   - *Our target:* dev staging web-pet (app.ptdev.xyz / api.ptdev.xyz), reachable from anywhere.

   In either: create a Scan Device under Setup → Scan Devices — **unique `webMailAddress`**
   (reuse causes data loss, per catalog A7 step 2), 3-char reference prefix, type Pocket/PDA,
   scope crews/employees/jobs. Use a disposable relay mailbox following the `jendevice1@usesilo`
   convention (WEBPET-1044).
4. **Device app config** — first-run setup: point PET Pocket at the sync target plus the device
   webmail address/password (the iOS docs name these preferences `webMailServerAddress`,
   `pktWebMailDeviceAddress`, `pktWebMailDevicePassword`). **Open question (Phase 2b):** whether
   Amy's LAN rig syncs via the Azure relay (`DeviceConnectivityMethod=WebMail(4)`) or directly to
   the office server (`InternalWebMail(5)` / `InternalOrWeb(6)` — the enum is ported in web-pet's
   `webmail/config.go`, but no inbound device-facing HTTP endpoint was found in web-pet's API, so
   internal mode may still be relay-backed or not yet ported).
5. **Export setup** — push crews/employees/jobs/fields to the device (Export to Device, or bulk
   Connectivity → Export → Setup to Scan Devices). Import on the device pulls them in.
6. **Run B1** — select field + job + crew → the roster lists → uncheck absentees → save the crew
   time-in.
7. **Sync back + verify (as in the video)** — device Sync → office Post Office import (D1,
   Connectivity → Import → Internet) → open `/transfer-to-job-cards` and confirm the crew's
   punches appear for review (D2); programmatically, assert via `GET /time-cards/...`.

## 4. Can PET Pocket run "as a URL in a browser"? — No (verified)

- AndroidPET is a **native Java/Kotlin app**. Code search across the repo finds **zero** embedded
  HTTP servers and zero web routes. Its only WebView usage renders generated report/log HTML
  *inside* the app (`report/WebReportActivity.kt`, `res/layout/web_view_logs.xml`, time-sheet
  views) — not a hosted UI.
- The `cloudPet` flavor is **sync plumbing**, not a web wrapper: an Android SyncAdapter + account
  authenticator + `OrangeRESTClient` (`app/src/cloudPet/`, `sync/SyncManager.java`).
- Consequence: no browser — and therefore no Playwright — can ever drive the APK. Automating the
  real app requires a native driver (Appium 2 / Maestro / Espresso) on an emulator or device.

## 5. Automation feasibility — three paths

### Path 1 — Playwright on web-pet's Scan Mode (dev staging; executable now)

web-pet reimplements the device capture screens as web routes (`/scan/:segment`, 25 routes).
`apps/web/src/features/scan-crew-time-in/ScanCrewTimeInPage.tsx` is a direct port of the legacy
device screen `ScanCrewIn.cs` and writes `POST /time-cards/crew-time-in` — that **is** B1 in a
browser.

**Verified deployed on dev staging** (grep of the live bundle
`app.ptdev.xyz/assets/index-ka9OzEKH.js`, 2026-08-07): the `/scan/crew-time-in` route, the
`time-cards/crew-time-in` API call, and `/transfer-to-job-cards` are all present. Our WP-0341 /
WP-0355 route smoke tests passing corroborates. **No DevOps dependency.**

Test shape (B1):

1. API-seed crew/employees/job/ranch/field (run-unique names).
2. Drive `/scan/crew-time-in`: select crew → roster loads → uncheck absentees → save.
3. Capture the `POST /time-cards/crew-time-in`; assert one TimeIn row per checked member via
   `GET /time-cards/...` (mirror `tests/webpet/equiv/scan-time-in-equivalence.spec.ts`).
4. Verify the rows appear on `/transfer-to-job-cards` — Amy's own verification step.

Fits the existing journey suite: spec at
`tests/web/journey-b-field-capture/b01-crew-time-in.spec.ts` (pattern:
`tests/web/journey-a-setup/a01-user-setup.spec.ts`); runner row **B1-001 `crewTimeIn`** is already
stubbed in `src/data/runner/journey-b.csv` (draft/disabled — flip via CSV, never JSON). Page
object: reuse `ScanScreenPage` and add `ScanCrewScreenPage`; its surface is known from web-pet's
shared `ScanCrewScreen.tsx` (crew Select — also barcode-resolvable, optional crew-table select,
per-employee Checkbox roster via `useCrewTimeInEmployees`, Ranch/Field/Job context, Save, status).
Optionally run under Playwright mobile emulation (`devices['Pixel 7']`) to simulate the handheld
form factor.

**Limits:** does not exercise the APK, offline capture, device sync, GPS stamping, or barcode
hardware.

### Path 2 — Appium 2 emulator/simulator E2E (the real apps; gated on DevOps)

Mandatory tooling — no browser option exists for the native apps (section 4):

| Driver | Verdict |
|---|---|
| **Appium 2 + UiAutomator2 (Android) / XCUITest (iOS) + WebdriverIO (TypeScript)** | Recommended: one harness, team's language, full assertions, hybridizes with API verification against api.ptdev.xyz in the same spec. Lives in a new top-level folder (e.g. `mobile/`) — NOT under `tests/` (keeps `runner:sync` untouched). |
| **Maestro** | Cheapest spike (YAML flows, drives both Android and iOS) to de-risk selectors before committing to Appium. |
| **Espresso in AndroidPET / XCUITest target in iOSPET** | Belongs to the mobile team/repos; out of scope for this suite. (Note iOSPET already ships a `PetPocketUITests/` target — a head start if the mobile team owns this.) |

**Platform matrix — Journey B is client-equivalent on both platforms.** iOSPET carries the same
crew screens (`PetPocket/PetPocket/ViewController/Crew/`: `CrewTimeInViewController` = B1,
`CrewJobCardViewController` = B2, `CrewPiecesInViewController` = B8, `CrewBreakViewController` =
B9/B10, `CrewTimeOutViewController` = B11) and emits the **same sync XML** (iOSPET README: "the
data format is shared"). Consequences:
- Paths 1 and 3 already validate iOS-originated data with no extra work — the office side cannot
  tell the clients apart.
- App-level testing (this path) must cover **each platform customers actually field**, because the
  codebases are independent (Objective-C vs Java) and can regress independently. Prioritize by the
  real device mix — open question 7 for Amy.
- iOS cost delta: simulators require **macOS runners** (GitHub-hosted macOS ≈ 10× Linux minutes),
  Xcode signing/provisioning, XCUITest driver; simulator covers GPS (GPX fixtures) but not
  barcode/NFC hardware. Kiosk flavors (`irisId`/`fingerScanner`) are Android-only, so Journey C
  device coverage stays Android regardless.

**Where it runs:** GitHub-hosted `ubuntu-latest` +
`reactivecircus/android-emulator-runner` (KVM available; the relay and api.ptdev.xyz are both
public) — recommended. The self-hosted Windows runner is a fallback only: it runs as a Windows
service (session 0, no display), so the emulator would have to run headless.

**Test shape (B1):** API-seed as Path 1 + Scan Device registration → Appium boots the AVD (RS35
profile), installs the APK, configures relay creds → device Import pulls setup (assert the roster
arrived) → drive crew time-in on-device → device Sync → Post Office import (D1) → the same API +
`/transfer-to-job-cards` assertions as Path 1. This also seeds the Journey D runner rows
(`src/data/runner/journey-d.csv` D1-001/D2-001).

**DevOps checklist (blocking — ask before building anything):**

- [ ] `WEBMAIL_LIVE_SEND_ENABLED` set on the dev API (the transport is fail-closed without it)
- [ ] `TigerMaster.dbo.ClientRelayRegistration` row with `LiveSendEnabled` for the dev client
- [ ] A disposable relay device mailbox (`jendevice1@usesilo` convention)
- [ ] Which relay URL/version dev uses (v3 default vs v6 test relay)

### Path 3 — protocol-level "virtual device" (mock the device via API; no emulator)

The device's entire contribution to the system is data: XML sync files (`FromIphone*.xml` /
`TimeCardSync*.xml`; formats documented in iOSPET's README) uploaded to its Post Office mailbox and
pulled by the office via Import Internet (D1). Both ends are callable without hardware:

- web-pet's import engine is fixture-tested with exactly these XMLs
  (`apps/api/internal/connectivity/importengine/testdata/`), and
- the relay mailbox is plain REST (`POST /UploadFile`; envelope + headers ported in
  `webmail/rest.go`; WEBPET-1044 proves the live round-trip).

A small `VirtualDevice` helper in this suite (Playwright request context) can upload a
crew-time-in payload as if a device synced it; the spec then triggers import and asserts the same
D1/D2 outcomes as the emulator path.

**Covers:** the import pipeline, crew-populate (`importmap/timecard_crewpopulate.go`), exception
flags, undefined-employee reconciliation (B7), transfer inputs — all office-visible Journey B/C
outcomes.
**Does not cover:** the PET Pocket app itself (roster UI, on-device duplicate range, offline
behavior) — the only remaining justification for Path 2.

**Golden-template rule (green-but-wrong guard):** never hand-invent the XML. Sources, best first:
web-pet's own fixtures (`importengine/testdata/jobcard_partial_device.xml`,
`pet-setup-header.xml`); a real capture from Amy's rig; a ticket attachment (iOSPET docs cite
PET-12198-style `FromIphone-*.xml` bundles). Parameterize only the variable fields
(employee/crew counters, timestamps, references). Validate once against a real import before
trusting it in CI.

**Two transport variants (both verified in web-pet):**

1. *Direct file import* — Connectivity Import accepts uploaded files/folders
   (`connectivity/import/SingleFolderPage.tsx`, `ScanDevicesPage.tsx`; durable
   `ImportRun`/`ImportFile` per upload batch, worker state machine
   `received → processing → completed|failed|partial`, `import_run.go` WEBPET-755).
   Exercises the same import engine with **zero DevOps dependency** — the recommended starting
   point.
2. *Relay round-trip* — full D1 fidelity via the mailbox (`InternetPage.tsx` pull); needs the
   Path 2 DevOps checklist.

### Emulator hardware coverage (applies to Paths 2)

| Capability | Emulator? |
|---|---|
| GPS | ✔ mockable (`adb emu geo fix`) |
| Keyboard-wedge barcode | ✔ send keystrokes |
| Camera barcode | ~ virtual scene, fragile |
| Sticker rolls, RFID/NFC, biometrics, printers | ✘ hardware-only — manual/bench devices |

## 6. Data strategy — deterministic, not random

- **Deterministic, run-unique fixtures:** a fixed seed set (crew, employees, job, ranch/field)
  created via the app API each run; identifying fields carry a per-run token (the
  `ZZTEST_..._<runToken>` pattern the equiv specs already use). This gives reproducible failures,
  exact assertions, and cleanup-by-prefix.
- **Run-unique is mandatory; randomness is not the mechanism.** Tokens must be collision-safe
  across 2 parallel workers + retries. Employee/Validation names are unpurgeable on dev
  (WEBPET-1798), so every run needs fresh names. A `webMailAddress` must never be reused across
  devices (data loss).
- **Controlled punch timestamps** (fixed times "today") so transfer/overtime/meal-penalty
  assertions are deterministic; no `Date.now()`-style randomness in asserted values.

## 7. Risks & blockers

1. **Relay send gating on dev** — `WEBMAIL_LIVE_SEND_ENABLED` kill-switch + per-client
   `ClientRelayRegistration.LiveSendEnabled`. Without them, Export-to-Device never leaves the API.
   → First DevOps confirmation; Path 1 and Path 3 (file variant) are unaffected.
2. **`cloudPet` vs `windowsPet` flavor** — confirm which communication flavor talks to the relay
   web-pet dev uses (`windowsPet` is the classic relay client; `cloudPet` may target the retired
   CloudPetMVP REST). → Ask mobile team / Amy.
3. **Emulator flakiness in CI** — AVD snapshot caching, retries, and keep the mobile job
   advisory, never a gate (same reasoning as ADR-0001 and the advisory-E2E decision).
4. **APK provenance** — building in CI needs AndroidPET checkout (org PAT); sideloading pins a
   released version. Pick per phase.
5. **Data hygiene** — device sync inserts real TimeCards on dev; run-unique names + existing API
   cleanup conventions; never reuse a `webMailAddress`.
6. **Dev staging build lag** — app.ptdev.xyz can serve a bundle missing commits already in
   source; grep the deployed bundle before filing a red as a product bug.

## 8. Journey C (pack-house kiosk day) — handling the biometrics

### Org repo map (verified across github.com/orangeenterprisesinc)

| Repo | Role in Journey C |
|---|---|
| **AndroidPET** | The kiosk software IS PET Pocket, built with the `irisId` flavor (Iris ID **iT100**, pkg `…androidpet.irispet`) or `fingerScanner` flavor (Accutime **TETON P8303**, **Stride80**). Kiosks are Android devices. |
| **IrisInstall** | .NET endpoint (`pettiger.net/ir`) that installs/updates PET Pocket on Iris ID kiosks; APKs must be **signed by Iris ID** (codesign.irisid.com). |
| **BioDeviceConnectivityTester** | Bench tool to test connectivity to biometric hardware (Handpunch, FaceId, FingerTec) without a PET Tiger install. |
| **web-pet** | Office side: biometric device folders + mailbox-family device commands already ported (gather-logs / request-partial-data / set-timezone, WEBPET-865/877); employee Iris tab; web Scan Mode screens for the same punch types. |
| **OrangeMailWS** | The mailbox carrying kiosk commands and sync (same Post Office as Journey B). |
| **Onboarding** | .NET MAUI app (Win/Android/iOS) — the "onboarding device" for enrollment/forms (A6/A13 periphery). |
| **PetTiger** + **windows-automation-mcp** | Legacy office baseline; parity baselines via FlaUI scripts (`biometric-device-commands.yaml`). |

(iOSPET is not part of the kiosk story — kiosks are Android.)

### The hard constraint (documented in-repo, not an assumption)

`AndroidPET/Docs/FingerScanner.md` states for both kiosk AVD profiles: *"The device will not be
able to run the FingerScanner API."* The biometric capture uses **vendor SDKs bound to hardware**
(Iris ID / Accutime), not the emulator-fakeable Android biometric API; iT100 APKs additionally
require Iris ID signing. **The biometric identification step itself cannot be automated in any
emulator or CI.** No tool choice changes this.

### Strategy — test each layer where it's testable

1. **Biometric matching (iris/face/finger)** — treat as vendor-certified hardware behavior;
   verify manually on a bench kiosk (real iT100/Stride80 on LAN; `BioDeviceConnectivityTester`
   proves reachability). Out of automated scope — recorded here deliberately.
2. **Kiosk workflow minus the biometric identity** — the catalog provides the seam: C1/C2 accept
   **badge/card fallback**. The kiosk app runs in an AVD (profiles committed for exactly this),
   so the Path 2 rig can drive kiosk clock-in/out, meal enforcement (C3), and button layouts
   (C10) via the badge path on the `fingerScanner`-flavor emulator (unsigned installs work via
   adb; the iT100 signing constraint makes the `irisId` flavor bench-only).
3. **Kiosk business rules on the web (now)** — meal start/end + enforcement, timeout questions,
   and sub-crew capture have web Scan Mode equivalents (`/scan/meal`, `/scan/time-in`, …) —
   Playwright on dev staging, same pattern as Journey B Path 1. Runner rows are stubbed in
   `src/data/runner/journey-c.csv`.
4. **Office-side biometric device admin — already automated in this suite**:
   `tests/webpet/equiv/biometric-device-commands-equivalence.spec.ts` (mailbox-family commands;
   fail-closed without `WEBMAIL_LIVE_SEND_ENABLED=true` — the same DevOps item as Journey B's
   relay). Direct-IP commands have **no web backend by design** (a cloud backend cannot reach a
   LAN reader — deferred at epic level, WEBPET-876): a product topology decision, not an
   automation gap.
5. **Downstream processing** — kiosk punches are ordinary time cards after import;
   penalties/meal rules are Journey D office logic, testable via API/UI with no biometrics.

## 9. Open questions (for Amy / web-pet / DevOps)

1. Which APK flavor does Amy run (`windowsPet` vs `cloudPet` communication flavor)?
2. Which AVD profile does she use?
3. How does her LAN-hosted web-pet (`192.168.1.74`) receive device syncs — Azure relay mailbox or
   internal/LAN webmail — and is dev staging wired the same way?
4. Does a dev relay mailbox pool exist beyond the `jen*@usesilo` pair?
5. Who owns AndroidPET test hooks (testIDs/accessibility ids) if Path 2 proceeds?
6. Can we get a copy of her local web-pet setup so the rig is reproducible on our side?
7. What is the real field device mix for the target customers (CipherLab/Emdoor Androids,
   iPhones/iPads, personal devices)? This decides the Phase 4 platform priority — Android-only,
   iOS-only, or both.

## 10. Phased recommendation

| Phase | What | Effort | Dependency |
|---|---|---|---|
| **1** | Playwright B1 on dev staging: `b01-crew-time-in.spec.ts` + `ScanCrewScreenPage`; enable B1-001 in `journey-b.csv`; then B2/B11 | 2–3 days | none |
| **2a** | DevOps + Amy confirmations (sections 5.2 checklist, 9) | ~1 day of asking | people |
| **2b** | Manual emulator runbook execution once — a B1 punch from the emulator visible on `/transfer-to-job-cards` | 0.5–1 day | 2a |
| **3** | Virtual device via API: `VirtualDevice` helper + golden-template XML; device-format crew-time-in lands through import into `/transfer-to-job-cards` (start with the file-import transport — zero DevOps) | 3–5 days | 2b for the golden capture |
| **4** | **DONE for B1 (2026-08-10, decided: Appium first)** — Appium 2 + WebdriverIO TS harness in `mobile/`: app-launch smoke + **B1 crew time-in green** on the `fullPlayStoreWindowsPetDebug` APK (26.01.22) in an RS35-profile AVD, offline (seeded prefs + `petdb.db`, no relay). See `mobile/README.md` and §12. Next: B2/B11 on the same rig; iOS via XCUITest on macOS runners if crews field iPhones (open question 7); relay-connected variant + CI job follow the DevOps checklist; then B15 offline sync, GPS, barcode wedge, kiosk badge-fallback (C1–C3, C10) | B1 took ~1 day incl. toolchain; further B-workflows ~½ day each | none for offline specs; 2a/2b only for the relay leg |

**Bottom line:** Journey B's business logic is automatable today with the tools this suite already
uses (Path 1). The sync pipeline is automatable without any emulator (Path 3). The emulator+Appium
rig is only required to test the PET Pocket app itself, and Journey C's biometric identification
step is hardware-bound by design — cover it manually on bench devices and automate every layer
around it.

---

## 11. Journey-by-journey automation risk register (A–F)

Verdicts: 🟢 automatable with current tools · 🟡 automatable with caveats/extra rig · 🔴 not
automatable (hardware/product boundary). Workflow ids reference the catalog.

### Journey A — Setup and configuration (office) · 🟢 mostly, two 🔴 islands

Standard web CRUD, largely proven (A1 user setup is automated and green; the webpet suite covers
the setup screens' patterns). Risks:

1. **A1 licensing** 🔴 — serials come from the legacy Delphi *PET Setup* generator, outside the web
   app. Treat license/module state as an environment precondition, never a test subject.
2. **A6 biometric enrollment** 🔴 — hardware capture (see Journey C).
3. **A7 device registration** 🟡 — the form is covered (`ScanDeviceFormPage`), but *Export to
   Device* effects are relay-gated (section 5, Path 2 checklist); the known edit-save double-PUT
   quirk needs tolerant request assertions.
4. **A8 GPS boundary mapping** 🟡 — canvas map drawing is Playwright-drivable but brittle
   (coordinate clicks, no DOM for the shape); needs the Mapping module on dev. Assert the saved
   region via API, not pixels.
5. **A13 onboarding forms** 🟡/🔴 — separate MAUI app + support-gated form mappings; catalog parks
   it for Anthony. Defer.
6. **Data hygiene (all of A)** — barcode global uniqueness, unpurgeable Employee/Validation names
   (WEBPET-1798), Save-disabled-until-dirty form quirks → run-unique tokens + on-blur-aware fills.

### Journey B — Field harvest day (mobile capture) · 🟡 (sections 1–7)

Top risks, consolidated: native app unreachable by browser (Appium-only for the APK); relay
live-send gating on dev; offline sync/duplicate-range semantics live on-device; sticker/barcode
hardware (B4–B7) partially or not emulatable; two independent client codebases (Android + iOS);
Amy's LAN sync method unconfirmed. Mitigations: Path 1 (web Scan Mode) + Path 3 (virtual device)
cover the business logic and pipeline now; Path 2 only for the apps.

### Journey C — Pack-house kiosk day · 🟡 around a 🔴 core (section 8)

Top risks: vendor-SDK biometric matching (🔴, hardware-bound by the org's own docs); iT100 APKs
require Iris ID signing (`irisId` flavor bench-only); **direct-IP device functions have no web
backend by design** (WEBPET-876 — a release-scope decision, not a test gap); C4 multi-kiosk meal
handoff needs ≥2 devices + a Scan Device Group + `Server Notifies Other Devices=No` (device-pair
rig); C5 photo fallback needs the Picture Verification module. Mitigation: 5-layer strategy in
section 8.

### Journey D — Daily office processing (the engine) · 🟢 with data-dependency caveats

The heart of the product (D4 transfer) and highly automatable — it's all office web/API — but
every workflow **consumes device-shaped data**, so coverage quality depends on Path 3:

1. **D1 Post Office sync** 🟡 — needs device-originated records: virtual device (file-import
   variant first) or relay. Import is an async worker (`received → processing → …`) — poll, don't
   assume synchronous completion.
2. **D2/D3 exception review + fixes** 🟢 — but the *fixtures must contain deliberate exceptions*
   (piece-out without time-in, missing meal return, duplicate) — exactly what the golden-template
   virtual device can inject deterministically.
3. **D4 transfer & gross pay** 🟡 — the assertion oracle is the risk: RT/OT/DT splits, night-shift
   crossing midnight, decimal precision. Needs hand-computed golden datasets with controlled
   punch times; permission `transfer.run`.
4. **D5 reverse / D6 recalculate / D7 multi-edit / D8 recycle-restore** 🟢 — state-heavy;
   isolation via run-unique crews + reverse-as-cleanup. D8 restore is one-record-at-a-time (slow
   loops); some entities have no purge (WEBPET-1798).
5. **D9 group piece-out distribution / D10 exercise & auto-break splits** 🟡 — rule engines fed by
   crew config (A4) + crew piece totals (B8 via virtual device); strong API-equivalence
   candidates.

### Journey E — Weekly payroll close and export · 🟡 high value, oracle- and data-heavy

Two very different halves:

1. **E1–E7 calculation rules** 🟡 — regular-rate averaging, CA daily OT (8/10), weekly OT
   interaction (no double-count), the *circular* break-premium recalculation (E4 iterates until
   stable), weekly minimum-wage top-up, decimal-rounding reconciliation (E6), meal penalties +
   waivers (E7). Risks: **(a) the oracle problem** — expected pay must be independently computed
   (golden weekly datasets, one per rule interaction); **(b) week-spanning fixtures** — each
   scenario needs 5–7 days of punches per employee → seed via API/virtual device, never UI;
   **(c) rule-config matrix** (state minimums per field, department/multi-state E13). Start with
   single-rule golden cases, then layered interactions.
2. **E8–E11 export to accounting** 🟢 — already partially covered
   (`tests/webpet/export-to-accounting*.spec.ts` incl. export-run, retry, recent-exports).
   Remaining risks: the per-customer format matrix (Famous/ADP/DataTech/QuickBooks/Paychex),
   test-file preview parsing, export-identifier mismatch (E10) and reverse-export (E11) state
   cleanup — reversal doubles as test cleanup.
3. **E12 H2A** — module off for the beta scope; park.

### Journey F — Analysis and monitoring · 🟡 hinges on the report engine

1. **F1/F2/F5 dashboards** 🟢/🟡 — live auto-refreshing web pages: Playwright-native. Risks:
   refresh-interval timing (assert on data change, not sleep); F2 needs Mapping + A8 boundaries;
   shared links are unauthenticated pages (assert the *intended* exposure, flag anything more).
   Note the currently-reported dashboard bug (View Crews links dead) — dashboards are live on dev
   and already surfacing defects.
2. **F7 report generation** 🟡 — the big one: reports are **Crystal Reports husks** proxied by the
   Go API (`REPORT_ENGINE=crystal` → `proxyToCrystal`; under the default Go engine many render an
   **empty PDF by design**, e.g. `RunDeviceInstallCardsReport`). Content assertions therefore
   depend on the dev stack running the Crystal proxy — confirm before writing any
   report-content test; prefer "Spreadsheet Data Only" outputs (parseable) over PDF scraping.
3. **F4 daily notification emails** 🟡 — needs an email sink (test inbox/webhook) and a way to
   trigger the send without waiting for the daily schedule; cron only fires from real time.
4. **F6 season-over-season** 🟡 — multi-season history can't be seeded per-run; use a static
   read-only dataset snapshot and assert against known historical totals.
5. **F3 cost-vs-price** — Cost Accounting off for the beta scope; park.

### Cross-journey top risks (ranked)

1. **Hardware boundary** (B4–B7 stickers/barcode, C biometrics, A6/A8 partially) — automate around
   it; scripted bench UAT for the core.
2. **Relay live-send gating** (A7, B, C commands, D1) — one DevOps checklist unblocks four
   journeys.
3. **Computation oracle** (D4, E1–E7) — golden datasets with hand-verified pay math are a work
   item of their own; without them "green" is meaningless.
4. **Crystal-proxy report engine** (F7, F1 underneath, plus any report-based verification in D/E)
   — verify the dev stack's `REPORT_ENGINE` before writing report assertions.
5. **Device-shaped data dependency** (D, parts of E) — the Path 3 virtual device is the enabler
   for two whole journeys, not just B.
6. **Data hygiene** — unpurgeable names (WEBPET-1798), barcode uniqueness, webMailAddress reuse,
   2-worker parallelism → run-unique tokens everywhere.
7. **Dev staging module/config matrix** — Mapping, Piece Payment, Traceability, H2A, Cost
   Accounting on/off states decide which workflows are even testable on dev; snapshot the module
   config as a fixture precondition.
8. **Dev staging build lag** — grep the deployed bundle before filing any red as a product bug.

---

## 12. Build log: what the Appium B1 implementation actually proved (2026-08-10)

The Path 2 rig was built and **B1 crew time-in passes on the emulator** (`mobile/`, twice
consecutively and alongside the smoke spec). Findings that revise this study:

### The relay is NOT required to test the device app — a real scope reduction

Path 2 was written up as blocked on the DevOps relay checklist. It isn't, for capture specs. The
app can be driven fully offline by seeding two files via `adb run-as` on a **debug** build:

1. `shared_prefs/…_preferences.xml` — four keys unlock offline operation (details in
   `mobile/README.md`). Most importantly `PktWebMailDeviceAddress` makes the app self-create a
   dummy sync account and **skip the sign-in dialog** that otherwise needs a live backend, and
   `UseEmpHomeCrewDefVal=true` makes the crew roster come from the seeded employee table instead
   of from time cards that don't exist yet on a fresh device.
2. `databases/petdb.db` — a golden setup DB built programmatically from the app's own schema.

Consequence: **the relay checklist now gates only the sync/round-trip specs** (device → Post
Office → web-pet import → Transfer to Job Cards), not device-app regression testing. Risk #2 in
§7 shrinks accordingly.

### Corrections to earlier assumptions in this document

| Assumed | Actual |
|---|---|
| App launches to the main menu | Launches to a **sign-in dialog**; Cancel exits the app |
| A manual XML import (or a team-supplied capture) is needed for the golden DB | The DB is buildable **programmatically** — the schema is in `DBRecordsLayer.java` and the app creates it on first launch; no relay, no manual import |
| Crew/job pickers are Spinners | They are **Buttons** opening pick dialogs (despite `spinner_*` ids) and auto-fill when one record exists |
| Menu buttons merely hidden when unlicensed | Alias-gated to `GONE`; a replaced prefs file must re-declare every alias it wants visible |
| Setup records cross-reference by code | They cross-reference by **name** (`Employee_Records.CREW` = crew *Name*) |

### Environment notes worth reusing

- Emulator acceleration (WHPX) works on this Windows host; cold boots ~15–20 s, a B1 run ~7 s.
- The toolchain does **not** fit on a full C: — SDK, AVD and Gradle caches were relocated to D:
  (`ANDROID_HOME`, `ANDROID_AVD_HOME`, `GRADLE_USER_HOME`).
- `appium-uiautomator2-driver` 5.x requires the Appium **3** server; pin 4.x for Appium 2.
- Bind Appium and the WDIO client both to `127.0.0.1` — "localhost" can split across IPv6/IPv4
  and surface as a false "driver not running" error.
- Never pipe `adb exec-out` binary through PowerShell redirection, and note that in-shell
  redirection to `/sdcard` under `run-as` silently writes 0 bytes.
