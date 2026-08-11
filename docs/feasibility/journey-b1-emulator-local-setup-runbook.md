# Journey B1 — Local Emulator Setup & Reproduction Runbook (Plan Only)

**Date:** 2026-08-10
**Author trigger:** Amy Sandoval's demo video *"Journey B1 Crew Time In.mp4"*
([Google Drive](https://drive.google.com/file/d/1rTrcGLQRG8KpGMo2vuTTjfS63x5HJIIf/view), uploaded 2026-08-06)
**Catalog reference:** `docs/catalog/PET-Tiger-Workflow-Catalog.docx` — Journey B "Field harvest day
(mobile field capture)", workflow **B1 · Crew time-in** (depends on office setup A2–A5, A7).
**Companion:** `docs/feasibility/device-capture-automation.md` (2026-08-07). This runbook is the
executable expansion of that study's **section 3** and **Phase 2b**: reproduce Amy's rig once,
manually, before any automation is written.

**Chosen variants (confirmed 2026-08-10):** office side = **dev staging**
(app.ptdev.xyz / api.ptdev.xyz); APK = **built from source** (AndroidPET, debug variant).

---

## 1. What you are reproducing

### 1.1 Amy's toolchain — the answer to "what tool / which emulator"

There is **no exotic third-party tool**. Amy's rig, verified in the feasibility study against the
org repos:

| Piece | What it actually is | Source |
|---|---|---|
| The "emulator" | Standard **Android Studio AVD** (Android Virtual Device), using the org's own hardware profile for the real field device — CipherLab **RS35** (`Rs35Device.xml`); RS30 / Emdoor RD40T profiles also ship | `AndroidPET/Docs/ReadMeDebugger.md` |
| The app on it | **PET Pocket** — the native Android client (Java), repo **AndroidPET**. iOSPET is the iOS twin; not needed for this reproduction | `AndroidPET/app/build.gradle` |
| "Exporting the crew details" | Catalog **A7 · Export Setup to Scan Devices** — the office pushes crews/employees/jobs/fields to the device's mailbox. Not a separate exporter tool | Catalog A7; web-pet `apps/api/internal/connectivity/` |
| The transport | **OrangeMailWS "Post Office" relay** on Azure (`https://orangeenterprises.azurewebsites.net/webmail/v3|v6/OrangeMailService.svc`); each device owns a unique mailbox (`webMailAddress`) | web-pet `connectivity/webmail/` |
| Office side in her video | A **LAN-hosted web-pet** (`https://192.168.1.74/...`); she verifies the punches on **Transfer to Job Cards** (catalog D2) | video + feasibility §1 |

Her flow end to end:

```
Android emulator (PET Pocket, RS35 AVD profile)
      ── Import ──▶  setup data (crews, employees, jobs, fields)   [A7 export from office]
      ── capture ─▶  B1 crew time-in on-device (field + job + crew → roster → save)
      ── Sync ────▶  Post Office relay mailbox
                        └─▶ office Import Internet (D1) ─▶ Transfer to Job Cards review (D2)
```

Your reproduction is identical except the office side is **dev staging web-pet** instead of a LAN
host — the relay sits between device and office in both cases, so the rig differs only in where
web-pet runs.

### 1.2 Repo map (which repo matters for what)

| Repo | Role here |
|---|---|
| **AndroidPET** | You build PET Pocket from this. Contains the AVD profiles and debugger docs. |
| **web-pet** | The office side (dev staging runs this). Scan-device registration, export, import, transfer screens. |
| **PetTiger** | Legacy Delphi/Windows office app — the baseline being rebuilt. Not needed for this rig. |
| **iOSPET** | iOS twin of PET Pocket, same sync XML format. Out of scope for this reproduction. |

---

## 2. Prerequisites & access checklist (do this before touching anything)

### 2.1 Access you must have

- [ ] GitHub org access to **orangeenterprisesinc/AndroidPET** (the repos are private — verify you
      can clone before scheduling the day).
- [ ] A **dev staging web-pet login** (app.ptdev.xyz) with permissions for Setup screens and
      Connectivity (export/import) — plus `transfer.run`-level access to view Transfer to Job Cards.
- [ ] Workstation admin rights (emulator virtualization + Android Studio install).

### 2.2 DevOps confirmations (blocking — the relay is fail-closed without them)

These come verbatim from the feasibility study §5 Path-2 checklist. Without them, *Export to
Device* silently never leaves the API and the rig cannot work end to end:

- [ ] `WEBMAIL_LIVE_SEND_ENABLED` set on the **dev API**.
- [ ] `TigerMaster.dbo.ClientRelayRegistration` row with `LiveSendEnabled` for the dev client.
- [ ] A **disposable relay device mailbox** for you, following the `jendevice1@usesilo` convention
      (WEBPET-1044; on the test relay the password defaults to the account name). **Never reuse an
      existing device's `webMailAddress` — reuse causes data loss (catalog A7).**
- [ ] Which relay URL/version dev is wired to (v3 default vs v6 test relay).

### 2.3 Questions for Amy (removes guesswork; feasibility §9)

- [ ] Which **APK build variant** she demos with — specifically the communication flavor
      (`windowsPet` = classic relay client vs `cloudPet`). Default assumption for this runbook:
      **`windowsPet`**.
- [ ] Which **AVD profile** she uses (assumed RS35).
- [ ] Whether her LAN rig syncs via the **Azure relay** or an internal/LAN webmail mode — and
      confirmation that **dev staging** is relay-backed (this decides nothing for your build steps
      but explains any sync-path difference vs her video).

### 2.4 Workstation requirements

- Windows 10/11 with **virtualization enabled** (Hyper-V/WHPX, or AEHD) — the emulator is unusably
  slow without it.
- ~15 GB free disk (Android Studio + SDK + one system image + AVD).
- **JDK 17** (bundled with current Android Studio; the Gradle build may pin a version — check
  `AndroidPET` docs/`gradle.properties` after cloning).
- Network: outbound HTTPS to github.com, dl.google.com, the Azure relay, and *.ptdev.xyz.

---

## 3. Phase 1 — Workstation & emulator (est. 0.5–1 h)

1. Install **Android Studio** (current stable) + Android SDK + Android Emulator via the SDK
   Manager.
2. Enable virtualization: Windows Features → Hyper-V / Windows Hypervisor Platform, reboot.
   Verify with `emulator -accel-check` once the SDK is installed.
3. Clone AndroidPET (also needed for Phase 2):
   `git clone https://github.com/orangeenterprisesinc/AndroidPET.git`
4. Import the hardware profile: Device Manager → *Create device* → *Import hardware profiles* →
   select `AndroidPET/Docs/Rs35Device.xml` (CipherLab RS35 — the real field handheld). Screenshots
   of the intended AVD configuration are in the same `Docs/` folder (`ReadMeDebugger.md`).
5. Create the AVD on that profile with an **API 29** system image (Android 10 — matches the RS35;
   the debugger doc also mentions Android 11). x86_64 image for speed.
6. Boot it once and confirm it reaches the home screen.

*Checkpoint:* `adb devices` lists the running AVD.

## 4. Phase 2 — Build & install PET Pocket (est. 1–2 h incl. first Gradle sync)

1. Open the cloned AndroidPET in Android Studio and let Gradle sync (first sync downloads
   dependencies; expect several minutes).
2. Select the build variant **`fullPlayStoreWindowsPetDebug`** (flavor dimensions are
   `personal/full` × `playStore/fingerScanner/irisId` × `cloudPet/windowsPet` per
   `app/build.gradle`; `full` + `playStore` + `windowsPet` is the classic relay-communicating
   phone/handheld build, and **debug builds need no signing keystore**).
   - If Amy answers `cloudPet` to §2.3, switch the last dimension accordingly — but `cloudPet` may
     target the retired CloudPetMVP REST backend (feasibility risk 2), so `windowsPet` remains the
     safe default.
3. Build: `gradlew.bat assembleDebug` (or Run ▶ from Studio straight onto the AVD).
4. Install on the AVD if built from CLI:
   `adb install app\build\outputs\apk\fullPlayStoreWindowsPet\debug\<name>.apk`
5. Fallback if the build fights you: sideload the released APK from
   `tigerjill.com/download/AndroidPet/` and note the pinned version — don't burn the day on Gradle.

*Checkpoint:* PET Pocket launches on the emulator and shows its first-run configuration.

## 5. Phase 3 — Office-side data on dev staging (est. 1 h)

All in web-pet at app.ptdev.xyz. Use **run-unique names** (`ZZTEST_..._<yourToken>` convention) —
Employee/Validation names are unpurgeable on dev (WEBPET-1798), and barcodes must be unique
database-wide.

1. **A2** — create a test Ranch, and a Field under it (name, state, acres).
2. **A3** — create a Job (payment type *time* is enough for B1) and assign a job group the device
   will receive.
3. **A4** — create a Crew (name, department, supervisor, default job/ranch/field).
4. **A5** — create 3–5 Employees assigned to that home crew, each with a badge barcode.
5. **A7** — register the Scan Device under Setup → Scan Devices:
   - `webMailAddress` = **your fresh disposable mailbox** from §2.2 (never a reused one),
   - a 3-character **reference prefix** (tags every time-card reference from this device),
   - device type **Pocket/PDA**, `connectivityMethod = WebMail(4)`,
   - **scope** the device's data to your test crew/employees/job/field (keeps the export small and
     the run isolated).

*Checkpoint:* the Scan Device record exists and is scoped to exactly your test data.

## 6. Phase 4 — Point PET Pocket at the rig (est. 15 min)

First-run device setup in PET Pocket (the iOS twin names the same preferences
`webMailServerAddress`, `pktWebMailDeviceAddress`, `pktWebMailDevicePassword` — expect Android
equivalents):

1. Sync/server address → the relay endpoint dev uses (v3 vs v6 answer from §2.2).
2. Device webmail address + password → your disposable mailbox (test-relay password defaults to
   the account name).
3. Leave GPS on; the emulator can fake a fix later with `adb emu geo fix <lon> <lat>` if B1's GPS
   stamp matters to your verification.

## 7. Phase 5 — Export the crew details ("Amy's export") (est. 15 min)

1. In web-pet: **Export to Device** on your Scan Device record, or bulk via
   **Connectivity → Export → Setup to Scan Devices** (UI: `ExportToScanDevicesPage.tsx`,
   `usePushScanDevice.ts`).
2. If nothing arrives, this is the **fail-closed relay gate** (§2.2), not your config — go back to
   DevOps before debugging the device.
3. On the emulator: run **Import** in PET Pocket — it pulls crews, employees, jobs, and fields from
   the mailbox.

*Checkpoint:* your test crew and its roster are visible on the device. **This step *is* "the tool
Amy uses to export crew details."**

## 8. Phase 6 — Reproduce B1 on the device (est. 10 min)

Follow the catalog B1 steps exactly (and Amy's video as the visual reference):

1. On PET Pocket select **field, job, and crew**.
2. The device lists the **crew roster**.
3. **Uncheck one member** (play the absentee) — this is B1's distinguishing assertion.
4. Save the **crew time-in**: time, GPS, assignment, and participating roster are captured.

## 9. Phase 7 — Sync back and verify like Amy does (est. 20 min)

1. On the device run **Sync** (B15 — note: end-of-day Sync exports all records, imports setup, and
   **clears the device**; that's fine here since the run is disposable).
2. Office: **Connectivity → Import → Internet** (D1 Post Office pull). Import is an **async
   worker** (`received → processing → completed|partial|failed`) — wait/poll, don't assume it's
   instant.
3. Open **`/transfer-to-job-cards`** (D2) and confirm: one TimeIn row per *checked* roster member,
   none for the unchecked one, references carrying your 3-char device prefix.
4. Optional API cross-check: `GET /time-cards/...` on api.ptdev.xyz for the same assertion — this
   is exactly what the future automated spec will do.

**Success criterion (Phase 2b done):** a B1 crew punch performed on the emulator is visible on dev
staging's Transfer to Job Cards — the same verification Amy performs at the end of her video.

### While you're there — capture the golden XML

During Phase 7, save a copy of the device's uploaded sync XML (`TimeCardSync*.xml` /
`FromIphone*.xml` format). The feasibility study's **Path 3 (virtual device)** requires a real
captured payload as its golden template ("never hand-invent the XML") — this one manual run
produces it for free.

---

## 10. Troubleshooting map

| Symptom | Likely cause | Source |
|---|---|---|
| Export leaves office but device Import gets nothing | Relay gating: `WEBMAIL_LIVE_SEND_ENABLED` unset or `ClientRelayRegistration.LiveSendEnabled` off | feasibility risk 1 |
| Device data weirdness / records vanishing | Reused `webMailAddress` | catalog A7 step 2 |
| App builds but sync calls go nowhere | Wrong communication flavor (`cloudPet` vs `windowsPet`) | feasibility risk 2 |
| Emulator crawls | Virtualization not enabled (WHPX/Hyper-V) | §3.2 |
| Punch imported but not on Transfer screen | Import worker still `processing`, or looking at the wrong day/crew filter | D1 async |
| Dev staging UI missing something the repo has | Dev build lag — grep the deployed bundle before filing a bug | feasibility risk 6 |

## 11. Effort summary & where this leads

| Step | Estimate |
|---|---|
| §2 access + DevOps + Amy answers | ~1 day elapsed (mostly waiting on people) |
| §3–§4 workstation, AVD, APK build | 2–3 h |
| §5–§9 office data → export → B1 → sync → verify | 2–3 h |
| **Total hands-on** | **~1 day** once access is in hand (matches feasibility Phase 2b: 0.5–1 day) |

After this reproduction succeeds you have: (a) confirmed answers to feasibility open questions
1–4, (b) a golden sync XML for the Path 3 virtual device, and (c) the manual baseline against
which the Path 1 Playwright spec (`tests/web/journey-b-field-capture/b01-crew-time-in.spec.ts`,
runner row B1-001 in `src/data/runner/journey-b.csv`) will be validated. Automation work should
start only then — Path 1 first (no emulator needed), Path 3 next, Appium (Path 2) only if the team
decides to regression-test the app itself.

## 12. Sources

- Amy's video: [Journey B1 Crew Time In.mp4](https://drive.google.com/file/d/1rTrcGLQRG8KpGMo2vuTTjfS63x5HJIIf/view) (Drive, owner amy.sandoval@usesilo.com, 2026-08-06)
- `docs/catalog/PET-Tiger-Workflow-Catalog.docx` — Journeys A/B (A2–A5, A7, B1, B15, D1, D2)
- `docs/feasibility/device-capture-automation.md` (2026-08-07) — all repo-verified claims
  (AndroidPET flavors & AVD profiles, web-pet connectivity ports, relay endpoints, WEBPET-1044
  live round-trip, DevOps gating)
- Note: `github.com/orangeenterprisesinc/*` repos are private and were not directly readable from
  this session; repo facts above carry through the feasibility study's citations.
