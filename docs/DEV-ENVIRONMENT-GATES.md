# Dev-staging environment gates blocking automation

Automation for the PET-Tiger workflow catalog is written from the catalog itself,
ahead of the walkthrough recordings. The specs are not the constraint — these
seven environment gates are. Each one blocks named catalog workflows that cannot
be automated, or cannot be *proven*, until it opens.

Nothing here is a test defect. Every affected spec fails or skips **naming its
gate exactly**, and starts proving the real path with no test change the moment
the gate opens.

Status column is what we have verified on `ptdev.xyz`, not what is assumed.

| # | Gate | Blocks | Owner | Needed by |
|---|---|---|---|---|
| 1 | Import worker disabled | B1, B2, B7, B11, D1 | | |
| 2 | Relay pull not configured | B1, B2, D1 | | |
| 3 | Scan-equivalence env vars unset | B3 | | |
| 4 | `accounting.export` permission + reconcile preference | E10 | | |
| 5 | No seeded report | F7 → F1, F4, F5, E8 | | |
| 6 | Modules not licensed | A8, F2, F3, E12 | | |
| 7 | `POST /api/users` returns 500 | A7 | | |

---

## 1. Import worker is switched off

**Ask:** unset `PT_IMPORT_WORKER_DISABLED` (currently `true`) — WEBPET-2137.

An uploaded or pulled device file is stored successfully and then never parsed.
Both ingest routes — the relay Internet pull and a direct single-folder upload —
feed this one worker, so fixing it unblocks both at once.

**Note:** object storage is *no longer* a blocker. WEBPET-1830 was fixed on
2026-08-12. Any older ticket or comment naming S3 as the cause is stale; the
worker is the live gate.

**Verify:** run `tests/api/relay-roundtrip.spec.ts`. It passes when an uploaded
file reaches job-card-ready state instead of sitting unclaimed.

## 2. Relay pull is not configured

**Ask:** set `WEBMAIL_LIVE_SEND_ENABLED=true` **and** add a
`ClientRelayRegistration` row carrying a `SendPassword` (settable only via SQL).

These two gate the *pull* only. Once pulled, the file lands in the same unclaimed
state as a direct upload until gate 1 is also fixed — so gate 2 alone does not
make B1/B2 green, and gate 1 alone leaves the relay path unexercised. Amy's
office ingests from the relay automatically, which is the behaviour these
workflows exist to prove.

**Verify:** Connectivity ▸ Import ▸ Internet completes instead of reporting
"WebMail live relay is disabled".

## 3. Scan-equivalence variables are unset

**Ask:** set `SCAN_TIME_IN_EQUIV=1` and `SCAN_EMPLOYEE_BARCODE=<a valid badge>`
in the dev run environment.

B3's parity spec passes today without executing — it skips itself when these are
absent, which reads as green in the report. This is a run-environment change, not
an application change.

**Verify:** the B3 parity spec reports as run, not skipped.

## 4. Export permission and reconcile preference

**Ask:** grant `accounting.export` to the dev run user, and enable the
reconcile preference on the account under test.

The reconcile-job-cards coverage is mostly-skipped on dev: the permission gate
returns 403 and the preference switch hides the flow, so the export-identifier
matching logic — the point of E10 — has never actually been asserted.

**Verify:** E10's spec runs its reconcile assertions instead of skipping.

## 5. No seeded report

**Ask:** create one saved report on dev with known parameters, and keep it.

Editing a report layout is covered. *Running* one is not — no parameters, no
screen output, no file, no Excel. F7 is the report engine, and F1 (live
dashboard), F4 (scheduled notification), F5 (dashboard sharing) and E8 (payroll
summary at close) all read through it, so one missing fixture blocks five
workflows.

**Verify:** F7 runs a parameterised report to screen and exports it.

## 6. Modules not licensed

**Ask:** license on dev, or tell us they are out of scope — either answer
unblocks us, silence does not.

| Module | Workflows |
|---|---|
| Mapping | A8 GPS field boundaries, F2 map dashboard |
| Cost Accounting | F3 cost-versus-price |
| H2A | E12 offered-hours reporting |

Where a module stays unlicensed, its workflows are recorded as blocked in the
traceability matrix with the gate named, rather than reported as missing
coverage.

**Verify:** the module's screens load instead of 403-ing.

## 7. `POST /api/users` returns 500

**Ask:** fix restricted-user creation on dev.

A7's data-scoping coverage provisions a crew-scoped restricted user and asserts
what that user can see. The provisioning call 500s, so the block is disabled and
scoping is unverified.

**Verify:** A7's restricted-user block runs green instead of being skipped.

---

## Related: `PT_TRANSFER_ANALYZE_ENABLED`

Not a blocker, but it shapes what D4 can assert. The Transfer to Job Cards grid
is populated by `POST /transfer-to-job-cards/analyze`, which is disabled here.
The specs assert the API-level links and push a `transfer-grid-not-asserted`
annotation rather than failing — honest, but the grid itself stays unproven.
Worth enabling alongside the D-family work.

## D4 seed feasibility — answered, no longer a risk

The D-family and everything downstream of it (D5–D10, E1–E11) needs transferable
time cards. The open question was whether that data could be created **without**
the relay, since gates 1 and 2 have no committed date.

**It can, and the code already exists.** `substituteTransport()` in
`src/utils/api/officeVerification.ts` creates punches through
`POST /time-cards/crew-time-in`. That route has never touched object storage or
the import worker, so it behaves identically before and after either gate opens.
It is used today behind `OFFICE_TRANSPORT_SUBSTITUTE=1`.

So D4's seed fixture builds on a proven route, and the Journey D and E work is
**not** blocked on gates 1 and 2. What those gates still block is proving the
device→office *pipe* (B1, B2, B7, B11, D1) — the transport itself, not the office
screens that consume it. Keeping those two things separate is the difference
between a plan that stalls in October and one that does not.
