# A6 · Biometric enrollment

Enrollment *capture* itself is a kiosk-side act with no browser surface. What the
office side owns — and what this plan covers — is the **mailbox-family device
commands** that keep an enrolled kiosk serviceable: fetch its logs, ask it for a
slice of its data, and push it a timezone.

The spec was relocated here from the web-pet equivalence suite
(`tests/webpet/equiv/biometric-device-commands-equivalence.spec.ts`, WEBPET-877,
Biometric Device Management Slice 12). The requirements below were written from
its assertions, not from the catalog steps — they describe what the four tests
actually prove.

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `A6` |
| Journey | `A` — Setup and configuration (office) |
| Segments | `pack-house`, `nursery`, `perennial-grower` |
| Modules | `Bio-Identification`, `Connectivity` |
| Surface | `device` → `tests/api/journey-a-setup/` |
| Demo candidate | yes (the enrollment capture; **not** these API tests) |
| Catalog status | draft |

**Summary** (from the catalog)
> Enroll employees on iris or face (preferred) or fingerprint so kiosks can
> identify them, with card or badge fallback for those who cannot enroll. The
> detailed enrollment-capture sequence is library-limited.

The runner rows carry `segments=all` rather than the catalog's three segments:
the device-command contract is a property of the API, and a stack that answers
these routes answers them regardless of which segment the customer is in. The
`modules` column is left empty (core) for the same reason — a scope that omits
`Connectivity` would otherwise silently drop the contract check.

## Catalog steps

| # | Catalog step | What is covered here | Automatable? |
|---|---|---|---|
| 1 | Open enrollment on a biometric or onboarding device. | Nothing — device-side. | **no** — kiosk UI, no browser surface |
| 2 | Capture iris or face (preferred) or fingerprint. | Nothing — device-side, and the capture sequence is library-limited. | **no** — same |
| 3 | Confirm the enrollment status on the employee Iris tab. | Nothing yet. | **not yet** — belongs with A5 (Employee setup), which has no automation |
| 4 | Issue an RFID card or barcode badge as fallback; enable photo capture. | Nothing yet. | **not yet** — employee-record fields, A5 |
| 5 | Verify recognition, siting kiosks away from changing light. | Nothing — physical. | **no** |
| — | *(verification tail, not a catalog step)* Service an enrolled kiosk through the mailbox-family device commands: Gather Logs, Request Partial Data, Set Timezone. | The whole spec. | **yes** — `A6-001`…`A6-004` |

**Scope of the spec:** the verification tail only. The four direct-IP "Biometric
Devices" commands (Export/Import Templates, Retrieve Status, Set Time — family B)
have no web backend at all: a cloud-hosted backend cannot reach a LAN biometric
reader by IP (WEBPET-876, deferred at the epic level). The two SU-only firmware
commands (Upgrade Program/OS, WEBPET-875) are mailbox-family but have no
kiosk-device-list endpoint to target yet.

## Acceptance criteria (EARS)

Ids are stable — append, never re-sort.

| id | Requirement | Cases |
|---|---|---|
| `A6-R1` | When a mailbox-family device command is posted with an authenticated session, a matching `Origin` and the `pt_csrf` token echoed as `X-CSRF-Token`, PET Tiger shall respond without an authentication, permission or server error. | `A6-001`, `A6-002`, `A6-003` |
| `A6-R2` | When a mailbox-family device command creates a run, PET Tiger shall return a persisted run identifier and a rolled-up run status of `completed`, `failed` or `partial`. | `A6-001`, `A6-002`, `A6-003` |
| `A6-R3` | When a device command run targets one or more devices, PET Tiger shall return a per-device result whose status is `completed`, `failed` or `partial` for every device in the run. | `A6-001`, `A6-002`, `A6-003` |
| `A6-R4` | When a device command run is polled by its run identifier, PET Tiger shall return that same run identifier with a status of `completed`, `failed` or `partial`. | `A6-001`, `A6-002`, `A6-003` |
| `A6-R5` | If a device command is posted when no eligible device is selected, then PET Tiger shall reject it with HTTP 400 and an error message naming the device. | `A6-001`, `A6-002`, `A6-003` |
| `A6-R6` | If a device command finds no biometric-kiosk device to target, then PET Tiger shall return a skipped run with status `completed` and an empty per-device list. | `A6-001`, `A6-002`, `A6-003` |
| `A6-R7` | When the same device set is commanded through the web and through the legacy device-administration surface, PET Tiger shall produce the same device set and the same per-device status for each device. | `A6-004` |
| `A6-R8` | PET Tiger shall deliver exactly one command file per device, never one batched file for the device set. | `A6-004` |
| `A6-R9` | When a device command is issued with "Update Now", PET Tiger shall send it as `MessageType.Single` rather than the queued `Setup` type. | `A6-004` |
| `A6-R10` | While `WEBMAIL_LIVE_SEND_ENABLED` is false, PET Tiger shall record every targeted device as a per-device failure and make no call to the WebMail mailbox. | (fail-closed backend state) — not asserted directly: it is the reason `A6-004` is env-guarded, and the state under which `A6-001`…`A6-003` still pass |
| `A6-R11` | When an employee is enrolled on iris, face or fingerprint at a kiosk, PET Tiger shall identify that employee on subsequent scans. | — not automatable: enrollment capture is device-side with a library-limited sequence and no browser surface (catalog steps 1–2, 5) |
| `A6-R12` | Where the direct-IP biometric-reader topology is supported, PET Tiger shall export/import templates, retrieve status and set time on a reader addressed by IP. | — not automatable: family B has no web backend; a cloud-hosted backend cannot reach a LAN reader (WEBPET-876, deferred) |

Notes on what the tests literally check, so the requirements are not read as
stronger than the evidence:

- `A6-R1` is asserted as three negatives — not 401, not 403, status < 500. It is
  a regression guard on the permission gate (`connectivity.device-admin`) and the
  CSRF/Origin transport, not a positive proof of success.
- `A6-R5` and `A6-R6` are the two legitimate empty outcomes, and each Tier-1 test
  returns early when it hits one. On a stack with no biometric-kiosk devices that
  is the whole test — which is why `A6-R2`…`A6-R4` are proven only when the DB has
  eligible devices.
- `A6-R8` and `A6-R9` are read out of the harness's captured legacy baseline
  record (`filesPerDevice`, `messageType`), not out of the web response. The
  baseline is produced on the equipped host from the WebMail stub's received-file
  log, so the assertion is a guard on that harness capture as much as on the app.

### The three tiers of evidence in this plan

| Tier | What it proves | Runs where |
|---|---|---|
| 1 — contract (`A6-001`…`A6-003`) | The per-device run model is wired end to end. | Any stack with an authenticated session |
| 2 — parity (`A6-004`) | The web output matches the legacy WinForms output for the same devices. | `windows-automation` host only |
| — | Enrollment capture itself. | Nowhere; see `A6-R11` |

## Screens and page objects

None. This is a pure API spec — there is no PET Tiger screen behind these routes
in scope, and no page object applies.

| Route | Legacy counterpart | Ticket |
|---|---|---|
| `POST connectivity/device-command/gather-logs` | `AndroidGatherLogs` | WEBPET-872 |
| `POST connectivity/device-command/request-partial-data` | `PocketRequestPartialData` | WEBPET-873 |
| `POST connectivity/device-command/set-timezone` | `UpdateBiometricKioskTimeZone` | WEBPET-874, converged in WEBPET-884 |
| `GET connectivity/device-admin/runs/{id}` | — | run-status read path |

Paths are relative to `sessionApi`'s baseURL, which already ends in `/api/`.

## Data

- **Command table** — inline in the spec (`COMMANDS`): the three family-A routes
  and the request body that exercises the `MessageType.Single` ("Update Now")
  path. Not a value bag: it is three rows read by one shared assertion body and
  has no reuse outside this file.
- **Legacy baseline** — `PET_LEGACY_DEVICE_CMD_FILE`, a JSON file produced on the
  `windows-automation` host by `C:\Scripts\biometric-device-commands.yaml`
  (FlaUI driving `DeviceManagementMenu`). Shape:
  `{ [commandName]: { devices: [{deviceCounter, status}], messageType, filesPerDevice } }`.
- **Generated values** — none. The spec creates no records.

## Preconditions

- [x] An authenticated session in `.auth/user.json`, supplied by the `auth-setup`
      project. **The session user must hold `connectivity.device-admin`** — the
      spec previously ran as the web-pet admin (`su`/`oe`), which does; whether
      the journey suite's `USER_NAME` does is unverified. A 403 on the first live
      run means it does not.
- [ ] *(Tier 2 only)* `PET_DEVICE_CMD_EQUIV=1`, `WEBMAIL_LIVE_SEND_ENABLED=true`
      on the API process, a WebMail stub, biometric-kiosk device fixtures, and a
      legacy baseline at `PET_LEGACY_DEVICE_CMD_FILE`.

## Cleanup

None. The commands persist a `DeviceCommandRun` server-side, which is an audit
record with no delete route and no name collision — nothing to track.

## Test cases

`src/data/runner/journey-a.csv`:

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `A6-001` | Gather Logs command returns a per-device run reaching terminal status | `A6-R1`…`A6-R6` | `regression` | 1 |
| `A6-002` | Request Partial Data command returns a per-device run reaching terminal status | `A6-R1`…`A6-R6` | `regression` | 1 |
| `A6-003` | Set Timezone command returns a per-device run reaching terminal status | `A6-R1`…`A6-R6` | `regression` | 1 |
| `A6-004` | Web per-device result and log output matches legacy for the same device set | `A6-R7`, `A6-R8`, `A6-R9` | `regression` | 0 |

The three Tier-1 rows cite the same requirements because they run the **same
assertion body** against three different commands — the coverage is identical and
only the route and request body differ. Expanding them into three literal
`test()` calls is not stylistic: the runner checker parses specs with regular
expressions, so a loop-generated title is invisible to it and exempt from every
tag and requirement rule (see `scripts/runner/lib/runner-data.js`).

No row carries `smoke`: a contract sweep that legitimately passes by returning
early on "no eligible devices" is not a happy path worth gating a smoke run on.

`A6-004` is `enabled=0`, and stays that way. It needs a legacy baseline file that
exists only on the `windows-automation` host; on every other host the spec's own
env guard skips it anyway, so the disabled row and the guard agree. It was
excluded from web-pet collection outright for the same reason (the `@wp-hostbound`
`grepInvert`, now removed along with the spec).

## Open questions for the tester

- [ ] Does the journey suite's `USER_NAME` hold `connectivity.device-admin` on dev
      staging? If not, either grant it or give this spec its own credential — the
      whole Tier-1 tier is a 403 otherwise.
- [ ] Dev staging has no biometric-kiosk WebMail devices, so Tier 1 most likely
      exits at `A6-R5`/`A6-R6` on every run and never reaches `A6-R2`…`A6-R4`.
      Worth seeding one kiosk device via the API so the run model is actually
      exercised — otherwise these three tests are a permission-gate guard and
      little more.
- [ ] `A6-R8`/`A6-R9` assert values out of the legacy baseline rather than the web
      response. Should the harness also capture the *web* side's per-device file
      count so the parity claim is symmetric?
