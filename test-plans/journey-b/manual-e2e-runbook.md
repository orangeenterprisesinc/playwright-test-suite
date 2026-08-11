# Journey B manual E2E runbook — B1 crew time-in · B2 crew move (dev staging)

Execute the real pipeline by hand, no Appium/Playwright involved:

```
PET Pocket (phone or emulator) → EXPORT → Post Office relay → app.ptdev.xyz import → Transfer to Job Cards
```

| Reference | Path |
|---|---|
| Recordings | `docs/media/Journey B1 Crew Time In.mp4`, `Journey B2 Crew Move and Job Change.mp4` |
| Automated specs | `tests/web/journey-b-field/b01-crew-time-in.spec.ts`, `b02-crew-move.spec.ts` |
| Detailed plans | `test-plans/journey-b/b01-crew-time-in.md`, `b02-crew-move-and-job-change.md` |

> **Known break point (until WEBPET-1830 is fixed):** dev staging's API has no object
> storage, so EVERY import route records the file `failed` with *"could not store
> uploaded file"* and the run stays `received`. Steps 1–6 below work today; step 7
> breaks there **by environment, not by product bug**. Capture the evidence and stop.

## Prerequisites

- Android phone with USB debugging authorized (`adb devices` shows `device`, not
  `unauthorized`), or the `petpocket_rs35` AVD from `npm run device:setup:sdk`.
- `apps-device/petpocket-debug.apk` — build with `npm run device:build:apk`
  (needs the AndroidPET checkout). Must be the **debug** variant: seeding uses `adb run-as`.
- Dev-staging `su` credential — from the team credSheet. Never write it in this file.
- The office fixture records below already exist on dev staging (created 2026-08-10,
  discovered-not-recreated). If one is missing, run the automated spec once
  (`npm run test:device`) — its arrange phase re-creates them — or add it by hand
  with the same code AND name.

## Barcode / fixture table

| Entity | Code (scan this) | Name |
|---|---|---|
| Ranch | `4001` | B1 RANCH |
| Field (B1) | `4101` | B1 FIELD |
| Job (B1) | `4201` | B1 HARVEST |
| Field (B2 destination) | `4102` | B2 FIELD EAST |
| Job (B2 destination) | `4202` | B2 PRUNING |
| Crew | `5001` | B1 CREW |
| Employees present | `6001` `6002` `6003` | B1 PRESENT ONE/TWO/THREE |
| Employee absent | `6004` | B1 ABSENTEE FOUR |

## 1 · Install and seed the device (PowerShell, no Appium)

The app must be seeded before it is usable offline: prefs skip the sign-in screen and
enable crew mode; the golden DB holds the records the barcodes resolve against.

```powershell
$adb    = "D:\Android\Sdk\platform-tools\adb.exe"
$pkg    = "com.orangesoftware.androidpet"
$serial = "<from `adb devices`>"

& $adb -s $serial install -r apps-device\petpocket-debug.apk

# Prefs: base file + relay destination. Manual runs send to their OWN mailbox
# (b1manual@petb1) so they never pollute the b1office@petb1 queue the automation
# (and a future Import ▸ Internet pull) reads. The relay creates any mailbox on
# first use — nothing to provision.
$prefs = Get-Content src\data\device\pet-prefs.xml -Raw
$prefs = $prefs -replace '</map>', "    <string name=`"RestWebAddress`">https://orangeenterprises.azurewebsites.net/webmail/v6/OrangeMailService.svc</string>`n    <string name=`"server_address_preference`">b1manual@petb1</string>`n</map>"
$tmp = New-TemporaryFile
Set-Content $tmp $prefs -Encoding ascii

& $adb -s $serial shell am force-stop $pkg
& $adb -s $serial push $tmp /data/local/tmp/pet-prefs.xml
& $adb -s $serial push src\data\device\golden-petdb.db /data/local/tmp/petdb.seed.db

# One run-as call per command. Do NOT combine with sh -c "a && b" — the quoting
# is eaten between PowerShell, adb and the device shell and mkdir sees two args.
& $adb -s $serial shell run-as $pkg mkdir -p shared_prefs
& $adb -s $serial shell run-as $pkg cp /data/local/tmp/pet-prefs.xml "shared_prefs/${pkg}_preferences.xml"
& $adb -s $serial shell run-as $pkg mkdir -p databases
& $adb -s $serial shell run-as $pkg cp /data/local/tmp/petdb.seed.db databases/petdb.db
& $adb -s $serial shell run-as $pkg rm -f databases/petdb.db-journal databases/petdb.db-wal databases/petdb.db-shm
```

Launch **twice** — `PktWebMailDeviceAddress` only takes effect from the second launch
(the sign-in-skipping sync account is created after the check that reads it):

```powershell
& $adb -s $serial shell monkey -p $pkg -c android.intent.category.LAUNCHER 1
Start-Sleep 3
& $adb -s $serial shell am force-stop $pkg
& $adb -s $serial shell monkey -p $pkg -c android.intent.category.LAUNCHER 1
```

**Expected:** main menu, no sign-in dialog, a **Crew In** button. 📸 *screenshot*

## 2 · B1 — capture the crew time-in

1. Tap **Crew In**. The field/job/crew slots are display-only (not tappable) — fill
   each by **typing the barcode + Enter** (hardware-keyboard scan path). With this
   fixture: ranch `4001`, field `4101`, job `4201`, crew `5001`.
2. **SAVE** → the *Employee Selection* dialog lists the roster, all pre-checked.
   📸 *screenshot — note whether extra members appear or any arrive pre-unchecked
   (Amy's real handheld showed both; the emulator fixture does not)*
3. **Uncheck** `B1 ABSENTEE FOUR` (6004).
4. Confirm. **Expected:** a toast naming exactly `6001, 6002, 6003`. 📸

## 3 · B1 — export

1. Back to the main menu → **EXPORT** → a confirmation dialog appears — **confirm it**
   (dismissing it serializes nothing).
2. **Expected:** no error dialog. "Missing body tag" here means the relay destination
   pref didn't land — re-run step 1's prefs block. 📸 *export result*

Save the exported envelope for the office upload (the app logs exactly what it sent):

```powershell
& $adb -s $serial logcat -d -v raw |
  Select-String -Pattern '<OrangeExportFile>.*</OrangeExportFile>' |
  Select-Object -Last 1 | ForEach-Object { $_.Line } |
  Set-Content device-export-b1.xml -Encoding utf8
```

Sanity-check the file: it must contain `<Employee>6001|6002|6003</Employee>` rows,
**no** `6004`, and `LookupContents="…Employee:Code…"`.

## 4 · B2 — move the crew (optional second pass)

1. **Crew In** again — same crew `5001`, but scan destination field `4102` and job
   `4202`.
2. In *Employee Selection*, **uncheck the member staying behind** (use `6004`'s row if
   following the automated spec: it leaves `6001-6003` moving).
3. Save. A move **updates the existing punches in place** — same rows, same
   references; 4 members + 1 move = **4 rows, not 7**.
4. **EXPORT** once, confirm, and capture the envelope as in step 3
   (`device-export-b2.xml`). It must show movers on `4102`/`4202` and the stayer on
   `4101`/`4201`.

## 5 · Office — login

`https://app.ptdev.xyz` → login `su` + credSheet password.
⚠️ 5 failed logins in 15 min = in-process lockout (429). Don't retry a doubtful
password; verify it with one attempt.

## 6 · Office — import

Two routes; try Single Folder first (Internet additionally needs office-side relay
config that is not set up yet):

- **Single Folder:** Connectivity ▸ Import ▸ Single Folder → choose
  `device-export-b1.xml` → Import. 📸 *before/after*
- **Internet (Amy's real path):** Connectivity ▸ Import ▸ Internet — one button, the
  pull happens server-side and always answers HTTP 200; read the **message**, not the
  status code (`status: "warning"` + `runId: 0` means a gate is closed). Needs
  WEBPET-1830 **plus** these server-side gates (verified in web-pet source):
  - `WEBMAIL_LIVE_SEND_ENABLED=true` env on the dev API (fail-closed kill switch);
  - a `TigerMaster.dbo.ClientRelayRegistration` row for this client with
    `LiveSendEnabled=1` and a `SendPassword` — **SQL-only, no UI or API sets the
    password** (test-relay convention: password equals the account name);
  - office mailbox + relay URL: Setup ▸ Preferences ▸ Connectivity ▸ Web Mail —
    `Rest Web Address` = the v6 relay URL, `Web Mail Server Address` = the mailbox to
    drain (the registration row's `ServerAddress` wins when non-empty).
  The office drains **its own** configured mailbox, so a manual pull test must point
  the device's `server_address_preference` at that same mailbox — coordinate with
  whoever owns the automation's `b1office@petb1` queue before flipping office prefs.

**Expected today (the known break):** the import reports **failed** —
*"could not store uploaded file"* — and the run never completes.
📸 *the failed state + save the network response (F12 ▸ Network) as `import-run.json`*.
This is WEBPET-1830 evidence, not a product bug. **Stop here until S3 lands.**

**Expected after WEBPET-1830 is fixed:** the run completes.

## 7 · Office — verify on Transfer to Job Cards (after WEBPET-1830)

1. View ▸ **Transfer to Job Cards** → re-apply the **date range** to today (rows only
   render after the range is applied — Amy does the same in the recording).
2. **Expected B1:** one row per present employee (3), linked to B1 RANCH / B1 FIELD /
   B1 HARVEST / B1 CREW; nothing for `6004`.
3. **Expected B2:** movers show on B2 FIELD EAST / B2 PRUNING; the stayer keeps
   B1 FIELD / B1 HARVEST; still one row per member.
4. *"No corresponding Time-Out"* warnings are **normal** for time-in-only data —
   never a failure. 📸 *the grid*

## 8 · Cleanup

Manual imports create real time cards on shared dev data. Delete them (View ▸ Time
Cards, today's date, the `600x` employees) so the next automated run's grid isn't
polluted.

## Evidence checklist

| # | Artifact |
|---|---|
| 1 | Main menu after seeding (no sign-in) |
| 2 | Employee Selection dialog (roster state noted) |
| 3 | Save toast naming 6001/6002/6003 |
| 4 | Export confirmation + result |
| 5 | `device-export-b1.xml` (and `-b2`) |
| 6 | Import result screen + `import-run.json` |
| 7 | Transfer to Job Cards grid (after S3) |
