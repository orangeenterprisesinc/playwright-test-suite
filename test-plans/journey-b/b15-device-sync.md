# `B15` · `Device sync and offline operation`

Source (Part 2): Jira `WEBPET-1533` attachment **66971**, 14,593,644 bytes, 1920×1080,
187.7 s → `.video-annotations/b15-device-sync-part2/` — 164 keyframes, 82 action
(12 force-sampled), max action gap 5.0 s of 5.0 s allowed, not capped (the default
run capped at 60 change points with a 10.0 s gap; re-run with `--max-frames 140`).

Source (Part 3): Jira `WEBPET-1533` attachment **66972**, 33,996,020 bytes, 1920×1080,
406.0 s → `.video-annotations/b15-device-sync-part3/` — 404 keyframes, 202 action
(28 force-sampled), max action gap 5.0 s of 5.0 s allowed, not capped (the default
run capped at 140 change points with a 10.0 s gap; re-run with `--max-frames 300`).

Evidence: attachment **66974** `PET-Setup_Device 30 [B8] CREW PIECES_260814163652.xml`
(478,337 bytes) — the actual pushed setup payload, transcribed below. Also attached
and unused: **66973** `AndroidLogs_….zip`, **67330** `image-20260902-191920.png`.

> **Part 1 is not attached to the ticket.** Both recordings open mid-capture, so the
> origin of the on-device records — and whether they were captured while genuinely
> offline — is outside the evidence. The "offline" half of this workflow is *implied*
> by pre-existing device records, never demonstrated: no airplane-mode toggle, no
> offline banner and no network error appears in either part.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `B15` |
| Jira | `WEBPET-1533` — [B15] Device sync and offline operation (manual test, read-only source) |
| Recording | `WEBPET-1533` attachments **66971** (Part 2), **66972** (Part 3) |
| This plan | `test-plans/journey-b/b15-device-sync.md` |
| Spec | `tests/web/journey-b-field/b15-device-sync.spec.ts` |
| Runner rows | `src/data/runner/journey-b.csv` → `B15-001`… |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `B15` |
| Journey | `B` — Field harvest day (mobile field capture) |
| Segments | all |
| Modules | Connectivity, Network |
| Surface | `device` → category `api` (no device driver; the office side is UI) |
| Demo candidate | no |
| Catalog status | draft |

**Summary** (from the catalog)
> Devices capture all day without connectivity and reconcile with the office by
> syncing, a core differentiator for low-coverage fields. End-of-day sync clears the
> device, so it is done only when recording is finished.

## Catalog steps

| # | Catalog step | What the recording shows | Automatable? |
|---|---|---|---|
| 1 | The device records time cards and pieces locally, working with no cell coverage. | Device captures time-ins offline — P2 `Recs (0)` → `Recs (3)` (kf 3, 43); P3 opens with `Recs (2)` (kf 38–39). No connectivity toggle is ever shown. | **no** — on-device UI only. The *effect* is reproducible by building an `OrangeExportFile` envelope, per `B1-002`. |
| 2 | When connected, each record can export in real time; otherwise it holds. | Not shown. `EXPORTAR` is never pressed in either part. | **no** — no evidence. |
| 3 | At end of day, Sync exports all records, imports setup, and clears the device. | P3 `SIN-CRONIZAR` → "Go ahead with Syncing Records?" → "Updating Records / Sending time card records" (kf 382–385). Afterwards the capture form is blank except `Campo = FIELD 01` (kf 389). | **partly** — the device leg is not drivable; the office-side arrival is the assertable half, and the recording never checks it (see *Not established*). |
| 4 | Mid-day, Import pulls setup updates (new employees, jobs) without clearing time cards. | The core of both parts. Office adds a crew → Save → **Push to Device** → device `IMPORTAR` → crew picker gains the new crew (P2 kf 51 → 129; P3 kf 46 → 128). `Recs (2)` survives five imports (P3 kf 268, 304, 376). | **yes, office side** — device scope config, push, export-log run, and the pushed XML payload are all office-verifiable. |
| 5 | The office pulls the queued data via the Post Office (D1). | Never opened. No Connectivity → Import, no Internet Import Log, no Transfer to Job Cards. | **no** — outside the recording; see *Not established*. |

### The automatable slice

The recording is a **two-surface capture** — web-pet office UI on the left, an Android
PET Pocket mirror on the right — and only the office surface is drivable by Playwright.
That surface is nonetheless the whole of catalog step 4 and the evidence half of step 3:

1. Configure the scan device's scope (crew, ranch/field) and **Save**.
2. **Push to Device**, which enqueues a setup export and reports the outcome inline.
3. Pull the envelope back off the device mailbox through the relay.
4. Assert its `*_Records` blocks match the configuration.

Step 4 is the strongest assertion available: it proves what the office actually sent,
independent of any device. (Steps 3–4 were planned against
`/connectivity/export/log`; that route has no evidence of existing on dev — see
*Planner findings* 1 and *Verified on dev staging*.)

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `B15-R1` | When a crew is added to a scan device and the form is saved, PET Tiger shall persist the crew on the device record and confirm with the toast "Scan device saved". | `B15-001` |
| `B15-R2` | While a scan-device form has unsaved edits, PET Tiger shall show the "Unsaved changes" bar with Discard changes / Save, and shall disable Save with the tooltip "No changes to save" once the edits are persisted. | — not covered: edge case, happy path only |
| `B15-R3` | When a ranch is assigned to a scan device without naming a field, PET Tiger shall record the assignment as the whole ranch and render it as a `Ranch \| Field` row reading "Whole ranch". | — not covered: edge case, happy path only |
| `B15-R4` | When Push to Device is invoked, PET Tiger shall report the outcome inline as "Push succeeded". (The transient "Pushing..." label is **not** required: the endpoint returns too fast for it to be reliably observable, so asserting it races rather than verifies.) | `B15-001` |
| `B15-R5` | When a setup export completes, PET Tiger shall name the destination mailbox it delivered to, on the same inline panel, and offer the produced file for download. | `B15-001` |
| `B15-R6` | When a setup export file is produced, PET Tiger shall include `Ranch_Records`, `Field_Records` and `Crew_Records` blocks carrying exactly the ranches, fields and crews assigned to that device, each marked `Clear="True"`. | `B15-001` |
| `B15-R7` | If a setup export is requested for a device whose scope is unchanged since the last export, PET Tiger shall still record a distinct export run rather than silently reusing the previous one. | — not covered: edge case, happy path only |
| `B15-R8` | PET Tiger shall preserve time cards already captured on a device across a setup import, clearing them only on sync. | — not automatable: device-side state, no office-visible counter. |
| `B15-R9` | PET Tiger shall make a pushed field selectable on the device after import. | — **contradicted by the recording**; see *Not established* #1. Do not encode until triaged. |

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Scan Devices list + edit form | `/setup/scan-devices`, `/setup/scan-devices/<id>` | `src/pages/setup/ScanDevicePage.ts` — **new**, journey side |

`ExportLogPage.ts` was planned and **not built**: `/connectivity/export/log` has no
evidence of existing on dev, and the push reports its outcome inline on the device
form instead.

**Decided: journey-side page objects, no cross-suite reuse.** Every spec under
`tests/web/` imports `@fixtures/base.fixture` and destructures `{ sessionApi, pages }`;
none reaches into `src/pages/webpet/`. Honouring that keeps this a journey-only change,
so only the journey gate runs rather than both suites'.

Model both classes on `src/pages/connectivity/ImportInternetPage.ts` and register them
in `src/fixtures/pages.fixture.ts` as lazy getters `scanDevice` / `exportLog`, alongside
the existing `login, leftNav, users, transferToJobCards, importInternet`.

The webpet suite's `ScanDeviceFormPage` / `FieldListPage` are a **reference for locator
shape only** — do not import them.

## Data

Reuse, do not rebuild:

- `src/utils/relay/exportEnvelope.ts` — `buildEnvelope`, `DEVICE_SCHEMA`; already
  produces `OrangeExportFile` for nine journey-b specs.
- `src/utils/relay/relayClient.ts` — Post Office push/pull.
- `src/utils/api/connectivityImportApi.ts`, `officeVerification.ts` — office-side
  import and verification.
- `src/utils/api/setupEntitiesApi.ts` — crew/ranch/field fixtures.
- `src/utils/api/timeCardsApi.ts` — cleanup.

**The recording's environment is not ours.** It was captured against an on-prem
`https://192.168.1.74` (client "Sycamore", version 7715/77.15) using **Device 30
[B8] CREW PIECES** / mailbox `Device30@jensilo`. Our target is dev staging, whose
device is **43** (mailbox `gukaphone3`). Treat every id, mailbox, crew code and ranch
name below as *recording provenance, not test data* — the spec creates its own.

Observed values, for shape only: crews `125 Laureano Lopez Velasco` (18860),
`104 Martha Santoyo` (11879), `ALL EMPLOYEES` (10220); ranch `Amy's Ranch` (33198);
field `Field 01` (33199, crop Blueberries); export runs 55 and 56.

### Pushed payload shape (attachment 66974, P3 kf 351–359)

```
<OrangeExportFile>
  <Header>"7715","77.15","08/14/2026 16:36:51","0","Su","Sycamore"
  <Version>1</Version>
  <Modules>NETWORK,CONNECTIVITY,WINDOWS,GPS,…,DASHBOARD</Modules>
  <DeviceType>PocketPDA</DeviceType>
  <Crop_Records Clear="True"> … <Variety_Records Clear="True"> …
  <Ranch_Records Clear="True">  -> Amy's Ranch, Code 33198
  <Field_Records Clear="True">  -> Field 01, Code 33199, Ranch Amy's Ranch, Crop Blueberries
  <Crew_Records Clear="True">   -> 104 Martha Santoyo (11879), 125 Laureano Lopez Velasco (18860), ALL EMPLOYEES (10220)
  <Job_Records Clear="True">    -> 0 - Break (5338, Idle Time, 10 min) …
  <Question_Records Clear="True"/>
```

Element census of the real file: 1,187 `<Employee>`, 225 `<Job>`, 109 `<Crop>`,
43 `<Variety>`, 2 `<Ranch>`, 373 `<Preferen>`.

## Preconditions

- Dev staging reachable; `npm run test:dev`.
- A scan device owned by the run, created via API — never edit a shared device.
  `PocketPDA` (type 0 "Generic") is the pocket-class type that receives a Crew
  section; type is immutable after create.
- Connectivity method **Web** with a run-unique mailbox; Sync Folder empty.
- One run-unique crew and one run-unique ranch + field to assign.

## Cleanup

Through the API only — there is no DB access.

- Deactivate/remove the scan device created by the run.
- Remove crew/ranch/field fixtures via `setupEntitiesApi`.
- Prefix every fixture name with the run token so the residue sweep can reclaim it.
- Export-log rows are append-only; they are not cleaned up. Assert on the run the
  test created (by device and timestamp window), never on row count.

## Test cases

**Happy path only, by decision (2026-09-15).** One case covering the whole office-side
flow — scope, save, push, verify what was sent. The edge cases that were drafted
(`B15-R2` unsaved-changes bar, `B15-R3` whole-ranch assignment, `B15-R7` distinct run on
re-push) are recorded as requirements but left uncovered; they can be added later without
renumbering, since ids are append-only.

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `B15-001` | A scoped scan device pushes its setup to the device mailbox | `B15-R1`, `B15-R4`, `B15-R5`, `B15-R6` | `regression` | 1 |

This replaces the scaffolded `deviceSyncAndOfflineOperation` / `draft` row.

## Planner findings (dev staging, 2026-09-15)

`[Planner - Sonnet]` could not explore live — see the blocker below — so these come from
existing dev-staging-proven specs and the manually-verified walkthrough
`test-plans/system/pet-pocket-to-webpet-setup.md`. **Treat every UI string below as
unverified until a live run confirms it.**

1. **`/connectivity/export/log` has no evidence of existing on dev staging.** It appears
   nowhere in source, specs, or the walkthrough — which drives the real Push-to-Device
   button and reports success from an inline message, never a log screen. The real
   surface is the API: `POST /api/connectivity/export/scan-devices` →
   `{ runId, status: 'completed'|'partial', devicesTriggered, devices: [{ name, destination, status }] }`,
   synchronous and terminal on response. **`B15-003/004/005` move from UI to API**, and
   must isolate their device by matching `devices[].name` — the call is a bulk export
   over all eligible devices, not scoped by id.
   → **Do not build `ExportLogPage.ts`** until a human confirms the route exists.

2. **`B15-004` (XML content assertion) — resolved: go through the relay.** The export
   response exposes `devices[].destination` as a *sync folder*, not a downloadable URL,
   and a **Web**-connectivity device delivers via relay mailbox instead. **Decided:** pull
   the envelope back through `src/utils/relay/relayClient.ts` the way `B1-002`
   (`relayRoundTripsAnExportEnvelope`) already does, rather than reading a file from disk.
   That keeps the device Web-connectivity as the recording shows, and reuses the transport
   the suite already trusts.

3. **`B15-R1`'s toast text "Scan device saved" is unverified on dev.** It is sourced only
   from the recording (P3 kf 100). No spec or page object in the repo asserts it, and the
   walkthrough never mentions a save toast.

4. **`B15-R2` is entirely unverified.** No existing code handles an "Unsaved changes" bar
   or a disabled-Save tooltip on this form; webpet's `ScanDeviceFormPage` disables Save
   only while submitting.

5. **There is no scan-device API create helper.** `deleteScanDevice(request, id)` exists
   (rowversion-guarded `DELETE /api/scan-devices/{id}`), but create only works through the
   two-step UI flow: `POST /api/scan-devices` → `deviceCounter`, then `PUT` from the edit
   form for crew/preferences. `section#preferences` renders only after the first save and
   is the step-2 readiness signal. Device type must be **Generic (0)** for a Crew section,
   and is immutable after create.

6. **Locators that already exist and are dev-proven** (from webpet's `ScanDeviceFormPage`,
   reference only — do not import): `section#general`, `input#name`,
   `input#referencePrefix`, `input#webMailAddress`; General selects are positional
   (`[data-slot="select-trigger"]` nth(0)=DeviceType, nth(1)=ConnectivityMethod);
   `section#crew` holds a Base UI **Combobox**, options via
   `[data-slot="combobox-popup"][data-open] [data-value="…"]`. No `pushToDevice()` locator
   exists anywhere yet.

### Blocker — live exploration is unavailable repo-wide

`planner_setup_page` / `generator_setup_page` fail with `seed test not found`. Confirmed
independently: `npx playwright test --list tests/seed.spec.ts` → **`Total: 0 tests in 0
files`**. `playwright.config.ts:257-260` excludes `**/tests/seed.spec.ts` from the
`chromium` project — deliberately, so an untagged no-op cannot enter a run and fail
`runner:check` — and no other project's `testMatch` covers it.

This blocks **every** agent run needing live exploration, not just B15. The fix is a
shared-core change to `playwright.config.ts` and is well precedented: an env-gated opt-in
project, exactly like `RESIDUE_TOOLS_ENABLED` (`residue-sweep`) and `WEBPET_ENABLED`.
Such a change needs its own Planner cycle and **both** suites' validation gates.

## Verified on dev staging (2026-09-15)

The spec passes. What five runs established, replacing the guesses above:

| Claim | Outcome |
|---|---|
| `"Scan device saved"` toast | **correct** — the recording's string holds on dev |
| `Push to Device` accessible name | **correct** |
| Save/create two-step, `section#general`/`#crew`/`#preferences` | **correct** |
| Ranch/Field section | **wrong** — it is `section#field`, not `section#ranch` |
| Ranch/Field comboboxes | **no accessible name**; the first renders `— Select Ranch —` as content, so index is the only discriminator |
| Ranch/Field options | keyed **by name**, not `data-value`, and their listbox renders **inline**, not in a `combobox-popup` portal — the opposite of the Crew section on the same form |
| Field combobox + Add | **disabled until a ranch is chosen**; the field box already defaults to `Whole ranch` (`__ranch_only__`), so `B15-R3` is the form's default state, not a special path |
| `"Pushing..."` busy state | **not observable** — endpoint too fast; assertion removed, see `B15-R4` |
| Export surface | the push renders `Push succeeded` + `Destination: <mailbox>` **inline**, with a `Download file` button. No `/connectivity/export/log` needed, and the speculative `POST /api/connectivity/export/scan-devices` capture was dropped as unverifiable |
| Relay round-trip (`B15-R6`) | **works** — the envelope pulls back off the mailbox and its `Ranch_Records`/`Field_Records`/`Crew_Records` carry the assigned entities with `Clear="True"` |

Two combobox implementations coexist on this one form (Crew portals + `data-value`;
Field inline + name). Carrying one section's idiom to the other is what cost three of
the five runs — worth knowing before the next scan-device test.

`Download file` on the push panel is an untried alternative to the relay pull for
`B15-R6`, should the relay leg ever become unreliable.

## Not established

Resolved live by the Planner, or escalated.

1. **"No Field records found on device." survives four imports.** The field *is* in the
   pushed XML (P3 kf 357) yet the device errors on `Campo` until the **Sync** (P3 kf
   391); Part 2 ends mid-investigation on the same error (P2 kf 133–163). Either Import
   does not apply `Field_Records`, or field delivery is sync-only by design. **This looks
   like a product defect and should be triaged before `B15-R9` is written.**
2. **The payoff assertion is absent from both recordings.** Sync uploads the time cards,
   but the office is never re-checked — no import log, no Transfer to Job Cards, no time
   cards. The device→office direction has to be discovered live (or driven through
   `relayClient` the way `B1-002` does).
3. **`Push to Device` gives no visible confirmation** — no toast, no dialog, no
   `Last Export Date` change. Success is only inferable from the export-log row.
4. **`Last Export Date` moved 16:09 → 16:20 with no visible action** (P3 kf 63 → 69).
   Probably a stale-then-fresh render; unverified.
5. **Whether Sync clears the device list** is inferred from the blanked capture form
   (P3 kf 389); the `Recs (n)` header was never re-read after sync.
6. ~~Does dev staging expose `/connectivity/export/log`?~~ **No evidence it does** — see
   Planner finding 1. Cases moved to the API surface; `ExportLogPage.ts` is not built.

**Accepted risk (decided 2026-09-15):** generate from the recording plus dev-proven
webpet locators *without* live verification, and let the Healer correct the unverified
assertions on the first real run. The strings most likely to need healing are the save
toast (finding 3), the unsaved-changes bar and disabled-Save tooltip (finding 4), and the
"Push to Device" control's accessible name.

## Open questions for the tester

- [x] ~~Reuse webpet page objects or add journey equivalents?~~ **Resolved: journey
      equivalents**, per the `tests/web/` pattern. See *Screens and page objects*.
- [x] ~~Is the on-prem-only `/connectivity/export/log` present on dev staging?~~
      **No evidence it is** — the push panel reports inline; no log screen was needed.
- [ ] Should the device→office half be simulated via `relayClient` in this spec, or
      left to a separate case once the office-side arrival path is known?
- [ ] Item 1 above — raise as a WEBPET bug (`qa-beta-test` + `journey-b`) before the
      spec encodes any field-after-import expectation?
