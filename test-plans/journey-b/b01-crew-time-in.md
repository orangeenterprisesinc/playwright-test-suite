# `B1` · Crew time-in

> **Transport change, 2026-08-12.** `B1-001` no longer drives a device. It builds the same
> `OrangeExportFile` envelope PET Pocket serializes (ported from the app's serializer —
> `src/utils/relay/exportEnvelope.ts`) and delivers it through the real Post Office relay, so the
> office half runs on the production path. Device-side requirements (`B1-R1`–`B1-R4`, `B1-R6`) are
> **deferred with the mobile automation** (branch `feature/appium-journey-video-wip`); the row now
> claims `B1-R5|B1-R7|B1-R8`. New `B1-002` proves the relay leg on its own
> (`tests/web/journey-b-field/b01-relay-roundtrip.spec.ts`) and is green today. Everything below about the device's
> screens describes the deferred manual/mobile scope.
>
> **Office half drives the UI (2026-08-12, later the same day):** mirroring the recording, the spec
> navigates the sidebar to Connectivity ▸ Import ▸ Internet, triggers the relay pull, and then walks
> to Transfer to Job Cards for the date-range step. On dev today the pull screen shows "The relay
> could not be reached." (gates: `WEBMAIL_LIVE_SEND_ENABLED`, ClientRelayRegistration + SQL-only
> SendPassword, and WEBPET-1830 storage) and the test fails there — on the screen where Amy's flow
> would show the data. `IMPORT_TRANSPORT=single-folder` keeps the direct importer-API path.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `B1` |
| Recording | `docs/media/Journey B1 Crew Time In.mp4` |
| This plan | `test-plans/journey-b/b01-crew-time-in.md` |
| Spec | `tests/web/journey-b-field/b01-crew-time-in.spec.ts` |
| Runner rows | `src/data/runner/journey-b.csv` → `B1-001`… |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `B1` |
| Journey | `B` — Field harvest day (mobile field capture) |
| Segments | `grower\|perennial-grower` |
| Modules | `core` |
| Surface | `device` — but see *Deviation* below for why the spec lives in `tests/web/` |
| Demo candidate | yes |
| Catalog status | draft |

**Summary** (from the catalog)
> A supervisor clocks an entire crew into a field and job from one screen, unchecking anyone absent.
> This is the fast path for the bulk of field workers at the start of the day.

### Deviation from the five-artifact convention

The catalog surface is `device`, which maps to category `api` (since 2026-08-26 every category lives in `tests/web/`). This spec is instead a
**hybrid**: it drives the native Android app through Appium *and* verifies the office side in the
browser, so it is registered as category `workflow` and lives in `tests/web/journey-b-field/`, which
is what `scripts/runner/check.js` requires for that category. It runs under its own opt-in `device`
Playwright project (one worker, long timeout, Appium `webServer`), never in the default run.

## Catalog steps

| # | Catalog step | What the recording shows | Automatable? |
|---|---|---|---|
| 1 | On the device, select field, job, and crew | Amy picks all three on the Crew In screen | yes — **by barcode scan**: the `spinner_*` views report `clickable=false`, so they are display slots, not pickers. The activity consumes hardware-keyboard input (`dispatchKeyEvent` → `mScanner.processKeyEvent`), so a code plus Enter fills the slot. With exactly one record of a type the app pre-fills it, which is why a single-record fixture needs no scanning |
| 2 | The device lists the crew roster | SAVE opens an "Employee Selection" dialog, all members pre-checked | yes |
| 3 | Uncheck any members who are absent | one member is unchecked | yes |
| 4 | Record the crew time-in; time, GPS, assignment and roster are captured | a toast names exactly the saved employees | yes — GPS is not asserted (emulator location is mocked, not real) |
| 5 | Data syncs to the office | Amy syncs, then reviews Transfer to Job Cards on her web instance | yes, via the stub relay + Connectivity import (see `B1-002`, deferred) |

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `B1-R1` | When a crew time-in is saved with a field, job and crew selected, PET Pocket shall record one Time In per selected crew member. | `B1-001` |
| `B1-R2` | If a crew member is unchecked in the Employee Selection dialog, then PET Pocket shall record no Time In for that member. | `B1-001` |
| `B1-R3` | When a crew time-in is saved, PET Pocket shall stamp each Time In with the selected field, job and crew and a Crew In reference. | `B1-001` |
| `B1-R4` | When Export is confirmed, PET Pocket shall serialize the unexported records into an `OrangeExportFile` envelope that references each record by Code. | `B1-001` |
| `B1-R5` | When the crew's punches reach the office, PET Tiger shall hold one time card per punch linked to the matching employee, crew, job, ranch and field. | `B1-001` — see *Transport substitution* below |
| `B1-R6` | PET Pocket shall capture a GPS position with each time card. | — not automatable: the emulator reports a mocked fix, so asserting it proves the mock, not the product |
| `B1-R7` | When Export is confirmed, PET Pocket shall deliver the envelope to the configured web-mail address. | `B1-001`, **opt-in**: asserted only when `DEVICE_RELAY_SERVER`/`DEVICE_RELAY_URL` are set (see *Delivery* below); on offline runs the send outcome is attached but not asserted |
| `B1-R8` | When the punch day is loaded on Transfer to Job Cards, PET Tiger shall list one row per punch carrying its reference. | `B1-001` |

### Delivery (`B1-R7`) — opt-in against the real relay, capture-first by default

A local stub relay was built first and abandoned for a hard reason:
`net/OrangeRESTClient` **force-upgrades the URL to HTTPS** (lines 70-74: any `http://` becomes
`https://`; the reverse only happens on pre-API-23 devices *after* a TLS failure). The app also ships
no `network_security_config`, so on API 29 it trusts **system** CAs only. A plain-HTTP stub is
therefore unreachable, and an HTTPS stub would need its CA installed into `/system`.

Since the office only ever consumes the XML, `B1-001` captures the envelope from the app's own
serializer (`SyncManager.sendInputRecords` logs it verbatim; see
`src/utils/device/exportCapture.ts`) — genuine app output, so `B1-R4` is provable without
interception.

Delivery itself was then proven against the **real relay** (2026-08-10): the relay has no accounts
(`ValidateUser` only null-checks credentials — an address is a queue key created on use), and the
one thing the app was missing was a **destination** (`server_address_preference`); without it the
relay answers "To Address cannot be Empty", which the app mangles into "Missing body tag". With
`DEVICE_RELAY_SERVER` + `DEVICE_RELAY_URL` (v6) seeded, the export returns
`is push file success: true` and every row gets an `ExportTime`. Since 2026-08-11 both vars live in
the tracked `.env.dev`, so every dev run delivers for real and the spec asserts the send outcome
(blank them to run offline — the assertion then stands down). The per-attempt result
(`export-result.txt`) is attached on every run so a failed send is never silent.

### The export references records by Code, not Name

The captured envelope declares its own lookup basis and uses barcodes throughout:

```xml
<TimeCard_Records LookupContents="Field:Code|Crew:Code|Employee:Code|Equipment:Code|Ranch:Code|Job:Code">
  <TimeCard><Crew>5001</Crew><Field>4101</Field><Employee>6001</Employee>
            <Job>4201</Job><Ranch>4001</Ranch><CardType>TimeIn</CardType>…</TimeCard>
```

This matters for `B1-002`: the office-side records on dev staging must carry **matching codes**, not
just matching names. The importer's `TimeCard` foreign keys are nullable, so a mismatch imports
"successfully" with NULL counters — the import spec must assert non-null links, not merely a
`completed` run.

Note the on-device tables are the opposite way round: `Employee_Records.CREW` holds the crew's
*Name*. Codes travel on the wire; names link the local tables.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| PET Pocket main menu | app launcher | `src/pages/device/PetPocketMainMenuPage.ts` | exists |
| PET Pocket Crew In | `Main menu ▸ Crew In` | `src/pages/device/PetPocketCrewInPage.ts` | exists |
| Transfer to Job Card | `Input ▸ Transfer to Job Card` | `src/pages/processing/TransferToJobCardsPage.ts` | exists (used by `B1-002`) |

## Data

- **Device fixture** — `src/data/device/petPocketFixture.ts`: one ranch, two fields, two jobs, one
  crew, three present employees plus one absentee. Deterministic, never random; codes follow the
  catalog barcode rule (≥4 digits, no leading zero).
- **Golden database** — `src/data/device/golden-petdb.db`, rebuilt by
  `npm run device:fixtures` from the schema the app itself creates on first launch.
- **Uniqueness rules that matter**: setup records cross-reference **by Name, not code**
  (`Employee_Records.CREW` holds the crew's *Name*); barcodes are unique across the database.

## Preconditions

- [ ] Android SDK + AVD `petpocket_rs35` — `npm run device:setup:sdk`
- [ ] `apps-device/petpocket-debug.apk` built from AndroidPET — `npm run device:build:apk`
      (debug variant: no signing keystore, and `adb run-as` can seed app data)
- [ ] Appium UiAutomator2 driver — `npm run device:driver` (pinned 4.x: 5.x needs the Appium 3 server)
- [ ] Emulator booted before the run (CI uses `reactivecircus/android-emulator-runner`)

**Why the device needs four preference keys** (`src/data/device/pet-prefs.xml`) — each was found by
reading the app and confirmed on the emulator:

| Key | Without it |
|---|---|
| `PktWebMailDeviceAddress` | the app opens a **Sign-in dialog** that needs a live backend; Cancel exits. With it, a dummy sync account is auto-created — but only from the **second** launch, because the account is created after the check that reads it |
| `UseCrewMode=true` | the Crew In button is `GONE` |
| `CrewTimeInAlias` | same — the button is alias-gated, and an alias is "valid" only when non-empty and not `None`/`Remove` |
| `UseEmpHomeCrewDefVal=true` | the roster is built from *existing* time cards (`getEmployeesByWorkCrew`), which on a fresh device is empty → "No Employee belongs to this Crew" |

The file replaces the app's prefs wholesale, so every alias-gated button that must stay visible has
to be re-declared or it disappears.

## Cleanup

The device is re-seeded from the golden database at the start of every run, so device state needs no
teardown. The office-side import (`B1-002`) creates real time cards on dev staging and will use
`cleanup.track()` with run-unique names.

## Test cases

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `B1-001` | Capture a crew time-in on the device, uncheck the absentee, and export it | `B1-R1`, `B1-R2`, `B1-R3`, `B1-R4`, `B1-R5`, `B1-R8` | `regression` + `@Demo` | 1 — green, runs in the opt-in `device` project |

`B1-001` is the whole flow the recording shows: capture on the device, export, import into the
office, then verify on Transfer to Job Cards.

### Transport substitution — what a green run does and does not prove

The spec first attempts the real transport (upload the device export through Connectivity import).
Where that is impossible — dev staging has no object storage — it creates the **identical punches**
through `POST /time-cards/crew-time-in` and continues, so `B1-R5` (the office landing) and `B1-R8`
(Transfer to Job Cards) are asserted on every run. The run then carries an
`office-transport-substituted` annotation, and the per-row `programCreated` flag is asserted **per
transport** (imports stamp it `true`, office writes leave it `false`), so a fallback can never
masquerade as a proven import. The device→office import transport itself is only proven where
storage exists.

### The office half needs object storage — and dev staging has none

The import (`POST /connectivity/import/single-folder`) writes the uploaded bytes with `storage.Put`
**before** the worker parses them, so where `S3_ENDPOINT` is unset the file is recorded `failed`
("could not store uploaded file") and the run never leaves `received`. `S3_ENDPOINT` is
[deliberately absent on dev staging](../../tests/webpet/README.md), while the localhost stack boots
MinIO.

So on dev staging the test runs the device half (evidence still lands in the report) and then
**fails at the import step** with a message naming WEBPET-1830 — a green run must mean the
device→office import was actually proven. Set `OFFICE_TRANSPORT_SUBSTITUTE=1` to opt into the
substituted transport instead: the same punches are created via `POST /time-cards/crew-time-in`,
the office half is verified, and the run carries an `office-transport-substituted` annotation.
Run against the localhost stack — or ask DevOps to configure S3 for the dev API (WEBPET-1830) — to
exercise `B1-R5` end to end.

A second server flag gates the *UI* half: the Transfer grid is fed by
`POST /transfer-to-job-cards/analyze`, which 404s unless `PT_TRANSFER_ANALYZE_ENABLED` is truthy.
**On dev staging that flag is already on** (probed 2026-08-10: the endpoint returns 200), so it is not
a blocker there. The spec still handles the disabled case for other environments, asserting the
API-level links regardless and annotating `transfer-grid-not-asserted` when the grid cannot populate.

## Open questions for the tester

- [ ] Does `/connectivity/import/single-folder` dedupe a re-imported file, duplicate it, or error?
- [ ] Does the imported card need a registered Scan Device (matching web-mail address / reference
      prefix) on dev staging before it links to a device?
- [ ] The catalog says B1 captures GPS — confirm on a real handheld, since the emulator's fix is mocked.
