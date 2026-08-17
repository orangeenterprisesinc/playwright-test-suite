# A7 · Scan device registration and data scoping

Scan Mode's route surface — which `/scan` routes are module-gated and which are
open to any authenticated user — plus the landing grid, barcode decode routing,
the device record itself, and the data-scoping rules that decide what a user sees.

| | |
|---|---|
| Workflow | `A7` — Scan device registration and data scoping |
| Journey | A — Setup |
| Modules | Connectivity, Network |
| Coverage depth | `screens` — see below |
| Rows | `src/data/runner/journey-a.csv`, `A7-001`…`A7-052` |

`A7-001` remains a `draft`, `enabled=0` row describing the end-to-end device
build. `A7-002`…`A7-052` were relocated from four web-pet specs
(`scan-mode-gating.spec.ts` WP-0321…WP-0345, `scan-mode.spec.ts`
WP-0346…WP-0367, `data-scoping.spec.ts` WP-0131…WP-0133,
`equiv/scan-device-create-de15-pocket-pda.spec.ts` WP-0177). The requirements
below were written from their assertions — they describe what the 51 tests
actually prove.

## Why the coverage depth stays `screens`

The catalog's workflow registers a device, sets its type and login, **pushes
setup to it**, and **scopes which crews, employees, fields and jobs it
receives**. The tests here cover the route gating, the landing grid, decode
routing, one save round-trip, the create form, and the scoping *read* rules.
Pushing setup to a device and scoping records onto it are never exercised, so
`A7-001` stays the reserved slot.

## Specs

| Spec | Rows | Covers |
|---|---|---|
| `tests/web/journey-a-setup/a07-scan-mode-gating.spec.ts` | `A7-002`…`A7-026` | 14 gated routes, 11 ungated routes |
| `tests/web/journey-a-setup/a07-scan-mode.spec.ts` | `A7-027`…`A7-048` | landing grid, route resolution, decode, save, carry-over, 3 deferred |
| `tests/api/journey-a-setup/a07-data-scoping.spec.ts` | `A7-049`…`A7-051` | SU visibility and restricted-user leakage (PET-441) |
| `tests/web/journey-a-setup/a07-scan-device-form.spec.ts` | `A7-052` | the two-step device create |

`a07-data-scoping` lives under `tests/api/` because it is API-only and its rows
carry `category=api`. `runner:check` **fails** a row whose category disagrees with
its spec's folder (`CATEGORY_FOLDER = { ui: 'web', workflow: 'web', api: 'api' }`),
so the folder is not a stylistic choice. `a06-biometric-device-commands.spec.ts`
is the precedent.

## 36 loop-generated tests were expanded into literals

`scan-mode-gating.spec.ts` declared **zero** literal `test()` calls for its 25
rows, and `scan-mode.spec.ts` declared 11 of its 22 the same way — all generated
by `for` loops over the route tables, with template-literal titles and
`testCaseId`s read from generated maps in `src/data/webpet/ids/`.

That style is invisible to `runner:check`, which parses specs with regular
expressions because it runs in CI before any build step. A test it cannot parse
is exempt from every tag and requirement rule — it fails **green**. All 36 are
now literal `test()` calls with single-quoted titles and ids.

The two id maps (`scanModeGatingIds.ts`, `scanModeIds.ts`) are **retired, not
ported**. They existed only because the web-pet suite discovered tests by running
`playwright test --list`; the journey tooling does not. Nothing else consumed
them, and `webpet:runner:check` fails on a map with no rows behind it, so the
gate enforces their removal rather than relying on memory.

`src/data/webpet/scanRoutes.ts` moved to `src/data/scan/scanRoutes.ts` and
survives as data feeding test **bodies** — the landing-grid tests still iterate
`ALL_SCAN_SCREEN_KEYS`, `WIRED_SCAN_SEGMENTS` and `DEFERRED_SCAN_KEYS`. A
body-level loop over assertions is fine; only loop-generated `test()`
*declarations* are banned. It was deliberately **not** put under
`src/data/runner/` — `MultiFileDataReader` reads every file there and would
ingest it as runner rows.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `A7-R1` | While a gating module is disabled for the session, when an authenticated user opens a module-gated `/scan` route, PET Tiger shall redirect away from that route; while the module is enabled it shall render the scan-screen shell. The route shall never render with the gate absent. | `A7-002`…`A7-015` |
| `A7-R2` | When any authenticated user opens an ungated `/scan` route, PET Tiger shall render that route with no module redirect and shall present a scan input. | `A7-016`…`A7-026` |
| `A7-R3` | When the scan landing grid mounts, PET Tiger shall render a card for every scan screen key. | `A7-027` |
| `A7-R4` | PET Tiger shall render each wired scan card as a link whose href ends in its route segment, and each deferred card as non-navigable. | `A7-028` |
| `A7-R5` | When a wired scan card is clicked, PET Tiger shall navigate to that screen with the scan input and employee slot rendered. | `A7-029` |
| `A7-R6` | When an authenticated user opens a wired ungated `/scan` route, PET Tiger shall resolve it to a scan screen carrying the shared keyboard-wedge input. | `A7-030`…`A7-040` |
| `A7-R7` | When a scanned barcode decodes to an Employee record, PET Tiger shall label the employee slot with the resolved name and enable Save. | `A7-041` |
| `A7-R8` | If a scanned barcode decodes to a non-employee record on an employee scan screen, then PET Tiger shall show an error status and keep Save disabled. | `A7-042` |
| `A7-R9` | When a scanned barcode decodes to a command targeting another scan mode, PET Tiger shall navigate to that mode's route. | `A7-043` |
| `A7-R10` | When Save is clicked with a captured employee on Time In, PET Tiger shall POST the time-in, show a success status naming the employee, and clear the slot so Save returns to disabled. | `A7-044` |
| `A7-R11` | When a scan screen renders, PET Tiger shall show the carry-over toggle defaulted on. | `A7-045` |
| `A7-R12` | When the Pack House scan screen ships (WEBPET-907 / WEBPET-878), PET Tiger shall provide a verifiable scan surface for it. | `A7-046` — **unproven** |
| `A7-R13` | When the BioIdentification capture surface ships (WEBPET-905), PET Tiger shall provide a verifiable fingerprint-capture surface. | `A7-047` — **unproven** |
| `A7-R14` | When the HandPunch sync-folder import ships (WEBPET-906), PET Tiger shall provide verifiable import provenance. | `A7-048` — **unproven** |
| `A7-R15` | While the session user has no UserCrew or UserDepartment rows, PET Tiger shall return every non-deleted row from the employees and crews endpoints. | `A7-049`, `A7-050` |
| `A7-R16` | While the session user is crew-scoped, PET Tiger shall return only employees of the assigned crew — a strict subset of the admin list — and exactly that one crew. | `A7-051` |
| `A7-R17` | When a scan device is created through the two-step form, PET Tiger shall persist the device row with the entered general fields, preferences and crew assignments. | `A7-052` |

`A7-R18` onward is reserved for the unautomated `A7-001` journey.

### Why 14 gated routes share one requirement, and 11 ungated share another

`A7-R1` and `A7-R2` each cover a whole route table because each is genuinely one
product rule asserted identically across N routes — the same precedent the
inventory screens plan sets ([inventory.md](../screens/inventory.md), the shared
list-page requirement). Fourteen copies of one sentence differing only in a route segment
would not be fourteen requirements. Per-route traceability is carried by the
fourteen rows and their titles, so a regression on one route still names that
route through its failing row.

### Why `A7-R2` and `A7-R6` are separate

They iterate the same eleven segments and look mergeable. They are not: `A7-R2`
(the gating spec) asserts a **strict URL match plus** a scan input, proving no
redirect occurred; `A7-R6` (the scan-mode spec) asserts the input only. The
precedent requires the assertions be *identical* to share an id. These differ, so
they are two rules.

## `A7-R1` is a tolerant assertion by design

The gated tests accept **either** outcome — screen rendered, or redirected away —
and fail only if the route renders with no gate at all. That looks weak and is
deliberate: module entitlement comes from the live session and can resolve false
for every key until the server entitlement data is real. The proof this slice
needs is *the gate is wired*, not *the module is on*.

Do not "tighten" this into an unconditional render assertion. It would fail
wherever entitlement is genuinely off, and pass for the wrong reason wherever it
is on.

## The three deferred surfaces

`A7-046`, `A7-047` and `A7-048` are `status=automated`, `enabled=1`, with
`test.skip(true, '<reason>')` as the only body statement. They report as skips
that **name their cause in every run report**.

They arrived declared as `test.skip('title', …)` with empty bodies — the form the
checker cannot parse, which would have exempted them from every tag and
requirement rule. Conversion was mandatory.

`enabled=0` would be wrong: that gate is reserved for tests whose accidental run
is *destructive* (`D3-002` writes uncleanable rows). These bodies are empty, so a
run is harmless, and `enabled=1` with a body skip is the form that surfaces the
reason. `status=draft` would also be wrong — draft means *reserved, no spec*, and
these have specs.

**`A7-R12`, `A7-R13` and `A7-R14` are therefore unproven.** Three of the 51 rows
count as automated in the traceability matrix while asserting nothing; the depth
claim rests on the other 48.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Scan landing grid | `/scan` | `src/pages/scan/ScanLandingPage.ts` |
| Any scan screen | `/scan/:segment` | `src/pages/scan/ScanScreenPage.ts` |
| Scan device form | `/setup/scan-devices/{new,:id}` | `src/pages/setup/ScanDeviceFormPage.ts` |

All three moved out of `src/pages/webpet/` in this batch — these specs were their
last web-pet consumers.

## Parallelism

No `mode: 'serial'`, and none should be added. Every test navigates and asserts
against its own route; `A7-052` creates its own device with a run-unique token.

## Data

* `src/data/scan/scanRoutes.ts` — the route and screen tables. `as const` is kept,
  though its original justification (compile-checked id-map indexing) died with
  the id maps; it still narrows the segment union.
* `A7-052` uses run-unique `RUN_TOKEN` names and keeps `test.setTimeout(300_000)`
  — it is an interactive two-step create.
* `A7-051` provisions nothing; it reads through a second request context built
  from `WEBPET_RESTRICTED_STORAGE`.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [ ] Restricted-user auth state for `A7-051` — see below. **Unavailable today.**

## `A7-051` is quarantined — its skip guard stopped being true

`A7-051` is `enabled=0`. **`A7-R16` is unproven — PET-441 leakage has no working
automated coverage.**

This is a relocation defect, and a useful one to record because it is invisible
until the test runs. The spec guards itself with:

```ts
const restrictedAuthAvailable = existsSync(WEBPET_RESTRICTED_STORAGE);
```

File existence was a valid proxy for "a restricted user is provisioned and its
session is live" **only inside the web-pet project**, where the `webpet-setup`
dependency re-provisioned that storage state on every run. The journey `api`
project has no such dependency. The file is still on disk from a run on
2026-08-13 and holds only **session cookies** (`expires: -1`), which dev's
in-memory sessions dropped days ago.

So relocation flipped the test from *skipping* to *running against a dead
session* and failing on `expect(restrictedRes.status()).toBe(200)` with a 401.

The assertion is right and stays untouched — a crew-scoped user genuinely should
get 200. What is missing is the precondition. The row is disabled rather than the
guard widened, because a guard that also swallowed 401 would report *passed*
having proven nothing, which is the exact failure class this consolidation exists
to remove.

Re-enabling needs journey-side provisioning of the restricted user — a
`setup`-project dependency the `api` project can declare. That is RET-03 work,
not a spec edit. Note the catalog already recorded that dev provisioning fails
(`POST /api/users` 500), so this coverage was never real on dev; it is now
explicit instead of silently skipped.

## Cleanup

`A7-052` deletes nothing — the device it creates is retained deliberately, as the
source spec did. Everything else is read-only.

## Test cases

| ids | Spec | Group |
|---|---|---|
| `A7-002`…`A7-015` | `a07-scan-mode-gating` | 14 module-gated routes |
| `A7-016`…`A7-026` | `a07-scan-mode-gating` | 11 ungated foundation routes |
| `A7-027`…`A7-029` | `a07-scan-mode` | landing grid |
| `A7-030`…`A7-040` | `a07-scan-mode` | 11 wired routes resolve |
| `A7-041`…`A7-045` | `a07-scan-mode` | decode routing, save, carry-over |
| `A7-046`…`A7-048` | `a07-scan-mode` | deferred surfaces (always skip) |
| `A7-049`…`A7-051` | `a07-data-scoping` | SU visibility, restricted leakage |
| `A7-052` | `a07-scan-device-form` | two-step device create |

`A7-027` and `A7-049` are the two `@Smoke` tests — one per file, as the checker
requires.

## Open questions for the tester

- [ ] **The 25 inherited `networkidle` waits in `a07-scan-mode-gating`.** They are
      suppressed at file level with their reasoning, not rewritten. The web-pet
      tree downgraded `playwright/no-networkidle` to a warning; the journey tree
      treats it as an error, so relocation exposed a rule that was silenced rather
      than satisfied. The wait is load-bearing — `RequireModule` redirects
      synchronously and the assertion reads `page.url()` — so replacing it is a
      timing change across 25 live gate assertions that no run in this batch could
      validate. Worth doing deliberately, with a run to prove it.
- [ ] `A7-001` needs push-to-device and record scoping to reach `journey` depth.
- [ ] `A7-051` has never passed on dev. Until restricted-user provisioning works,
      PET-441 leakage is uncovered.
- [ ] The module-**off** branch of `A7-R1` is only ever exercised opportunistically.
      A session with a known-off module would make it deterministic.
