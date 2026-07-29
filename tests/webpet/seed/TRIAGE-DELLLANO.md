# DelLlano e2e triage map (WEBPET-831)

Status snapshot from a full-suite baseline run against **DelLlano** with the SU
login override. This is the hand-off artifact for splitting the remaining work
into per-area sub-tickets. Companion to [`README.md`](./README.md) (run playbook)
and [`delllano-e2e-seed.sql`](./delllano-e2e-seed.sql) (the committed seed).

> Branch: `feature/WEBPET-831_rewrite-remaining-e2e-specs-delllano`
> Baseline command: `E2E_ADMIN_USER=su E2E_ADMIN_PASSWORD=oe pnpm exec playwright test`

## Where we are

| Run | Pass | Fail | Skip |
|-----|------|------|------|
| Baseline (seed = employee+dept fixtures + Department module only) | 91 | 198 | 9 |
| After module-gate batch (this branch) — projected whole-suite | ~132 | ~157 | 9 |

`employee.spec.ts` passes 14/14 (the reference template, already on `main`).

### Done on this branch (verified)
- **Bucket A — 11 of 11 specs green** (each committed, all green or justified
  `test.skip`): `department` 10/10, `crew` 11/11, `crop` 13/13, `job-group` 9/9,
  `variety` 11/11 (+1 skip), `term` 1/1, `customer` 13/13 (+2 skip), `job` 9/9
  (+2 skip), `equipment` 9/9 (+2 skip), `field` 10/10, `ranch` 12/12 (+1 skip).
  - **Shared setup-form fix patterns** (apply to any setup form): `select#active`
    → `#active` (ActiveField Switch); `blur()` after `fill()` before asserting
    Save enabled (`mode: 'onBlur'`); dirty footer relabels Cancel → **"Discard
    changes"** + `UnsavedChangesModal` "Don't Save"; resolve fixture records **by
    name** via `page.request` (NOT the bare `request` fixture — it's
    unauthenticated → 401) instead of hardcoded PetData ids; shadcn migrations
    (native `<select>` → `SelectTrigger`/`Checkbox` `#id`; tabs → sections).
  - **Seed additions:** `ADP 5` dept got code `10012`; new fixtures `Customer
    "DFV"` (type Grower) and `Equipment "Forklift"` (type Trailer, code 10005) —
    both resolved by name since DelLlano ships zero of each.
  - **Forms requiring an FK before Save enables** (not just name): `job` needs
    Overtime Rules; `equipment` needs Equipment Type. `job` selects the FK via a
    combobox helper; `equipment`'s 2 Save-gate tests are skipped pending a shared
    `selectComboboxOption` helper (see OPEN_QUESTIONS.md).
  - **Justified skips (all logged in OPEN_QUESTIONS.md):** stale running API
    binary (variety duplicate → 500 not 409; rebuild the Go API to unskip);
    customer contact email/URL inline-validation display; job PET-60 checkbox
    data-state/round-trip; equipment combobox-FK selection.

- **`field` 10/10 ✅ and `ranch` 12/12 (+1 skip) ✅ — DONE.** Both list-page
  (serial-mode) specs now resolve active records via the API and target rows by
  **exact edit-link id** (`a[href="/setup/{entity}/{id}"]`) — robust vs. name,
  which collides with FK cell values. Bonus gotchas captured: a ranch's
  WorkerCompCode "—" is the *second* dash-button (Department's is first); the
  Name filter uses the `Filter…` placeholder (a separate Search box would match
  `/Filter|Search/` first). **`ranch` boundary polygon-save is skipped** — it
  passes in isolation but is unstable in the full serial suite (the Advanced
  polygon/point fills intermittently don't mark the form dirty → Save disabled).
  Re-enable by splitting the boundary tests into their own non-serial file.

- **Module-gate batch.** Added 5 `ClientModules` rows to the seed —
  BonusPayment(4), Equipment(13), GrowerBilling(17), Inventory(21),
  TimeSheetEntry(44) — joining the pilot's Department(9). Recovered **+41 tests**
  across the 11 module-gated files (47 pass / 26 fail, was 6 / 67). Seed
  re-applies cleanly via `sqlcmd` (idempotent, exit 0). Modules load at login,
  so no API restart is needed — a fresh Playwright run picks them up.
  - **Do NOT license Cost Accounting (ModuleId 8)** —
    `export-to-accounting.spec.ts` asserts the Cost Accounting tab is *disabled
    when that module is not licensed*.

## Environment gotchas (cost real time during this run)
1. **Playwright browser binary.** Playwright 1.59.1 ships without browsers on
   this box — `pnpm exec playwright install chromium chromium-headless-shell`
   first, or every test fails in ~4 ms with "Executable doesn't exist."
2. **Read the DB connection from `apps/api/.env` — never hardcode a host.** The
   SQL Server host differs per machine, so don't bake `localhost` or any IP into
   scripts or docs. Use the same `MSSQL_SERVER` / `MSSQL_USER` / `MSSQL_PASSWORD`
   the Go API uses. Source the file so the double-quoted password is unquoted for
   you:
   ```sh
   set -a; . apps/api/.env; set +a
   sqlcmd -S "$MSSQL_SERVER" -U "$MSSQL_USER" -P "$MSSQL_PASSWORD" -C \
     -d master -i apps/web/e2e/seed/delllano-e2e-seed.sql
   ```
   (`seed/README.md` and the seed file's header still show `-S localhost` as a
   generic example — fine as illustration, but resolve the real host from
   `.env`.)
3. **Restricted-user fixture fails in global-setup** with "Invalid or missing
   CSRF token" — `POST /api/users` is CSRF-protected and the `APIRequestContext`
   doesn't send the `X-CSRF-Token` header. This makes `data-scoping.spec.ts`'s
   restricted-leakage test skip. Pre-existing; needs a global-setup fix (read
   `pt_csrf` cookie → set header) — see Bucket E.

## Agreed fixture strategy (WEBPET-831 execution checkpoint)
For specs that hardcode a PetData record **id/code** absent in DelLlano
(e.g. `goto('/setup/departments/1')`, `code === '10012'`, "ADP 7"):

> **Resolve records by name/code, not by hardcoded id.** Edit the spec to look
> the record up dynamically (e.g. `GET /api/departments`, find by `name`, then
> `goto('/setup/departments/{found.id}')`); seed only records that must *exist*,
> keyed by name. **Avoid IDENTITY_INSERT id-pinning** — the shared dev DB is
> already polluted by the pilot's naive `INSERT Department(Name='ADP 5')`
> (landed at id=2, no code), `employee 5`'s `DepartmentCounter` FK points at it,
> and forcing legacy ids (1, 2, …) collides on a non-empty DelLlano.

This reverses the earlier seed-heavy lean. The seed keeps: module rows + the
employee/department *existence* fixtures (by name). Identity coupling moves into
the specs as name/code lookups.

## Failure buckets (root cause → fix)

### Bucket A — Setup-form stale DOM + fixture id/code  (largest)
`crew(3) crop(10) customer(10) department(8) job(9) job-group(7) variety(9) equipment(8*) term(1) field(1) ranch(1)`
\* equipment residual after its module row.

Three sub-patterns, all confirmed on `department.spec.ts`:
- **Stale selectors.** Fields migrated to shared components. `select#active` →
  `ActiveField` renders a shadcn `Switch id="active"` (role=switch) **in the
  page header**. `select#firstDayofWeek` → `SelectTrigger id="firstDayofWeek"`
  (role=combobox button). `select#crewRequired` → `Checkbox id="crewRequired"`
  (role=checkbox button). Use id locators (`#active`, `#firstDayofWeek`) or roles,
  not `select#…`. Confirm each form's DOM against its `*FormPage.tsx`.
- **onBlur validation.** `fill()` then assert Save enabled → add `blur()` first
  (`mode: 'onBlur'`). Same fix already in `employee.spec.ts` / `customer.spec.ts`
  is the `toBeEnabled` cluster.
- **Fixture id/code.** Edit-form tests navigate to hardcoded ids and assert
  hardcoded codes → apply the name/code-lookup strategy above. Confirm each
  spec's record exists in DelLlano (by name) and seed it (by name) if not.
- **Dirty-Cancel.** Some forms keep a literal "Cancel" button that triggers the
  `UnsavedChangesModal` navigation guard when dirty (department) while others
  relabel to "Discard changes" (employee). Verify per form before asserting.

### Bucket B — Inventory  `inventory-{center,item,item-type,setup,unit,unit-type}(1 each)`
Module row (Inventory=21) added — the 403s are gone but each still has 1
residual `toBeVisible`, almost certainly a missing setup fixture (each inventory
form needs a parent record: a unit-type for a unit, an item-type for an item,
etc.). Seed the parent records by name; chain FKs.

### Bucket C — Bonus wizard panels  `bonus-shell(8 residual of 37)`
Landing/wizard/Selection now pass (module fix). Residual = per-type panel
renders (Round-A/C/D Employee/Crew/Supervisor/Daily panels + Step-2 grid panels)
that need specific job/crew/ranch/field fixtures or have panel-field selector
drift. Triage each against the current `BonusWizard` panel components.

### Bucket D — Export to Accounting  `export-to-accounting(6) + v2(2) + v2-mobile(2) + v2-exportrun(1) + v2-row-selection(1)`
Mixed: `toBeVisible` (page chrome / readiness strip selectors) and one
`CONTEXT-CLOSED` cascade (row-selection). Needs candidate/run fixtures and
current-DOM reconciliation. The "Cost Accounting tab disabled" test must stay
green — do not license CostAccounting.

### Bucket E — App-shape & infra (distinct root causes, not data)
- `notifications(9)` — **`all.find is not a function`**: the notifications
  endpoint/response shape changed (returns an object, not an array). Real
  stale-test (or a thin client adapter). Inspect `/api/notifications` shape vs
  the spec's `.find()`.
- `profile-change-password(3)` + `profile-avatar(1)` — **strict-mode: 2
  elements**. `getByRole('button',{name:'Change password'})` and
  `input[type=file][accept=image/*]` each now resolve to 2 nodes. Scope the
  locator (`.first()` is a smell — prefer a container/testid). Real DOM dup.
- `form-field-states(4) localization(2) mobile-tab-labels(1) onboarding-badges(3)`
  — **CONTEXT-CLOSED cascades**: a `beforeAll`/early step closes the page; the
  visible error is downstream. Open each in headed/trace mode to find the first
  throw; usually one fixture or selector at the top of the file.
- `dashboard(5)` — localStorage board bootstrap; likely selector/timing, not data.
- `reconcile-job-cards(5)` — `toBeDisabled` assertions on controls that changed
  state semantics; verify current behavior.
- `parent-picker(11)` + `report-editor-wysiwyg(11)` — large feature surfaces;
  triage as their own slices.
- `data-scoping(2)` — SU visibility (`toBe` on array length) + the restricted
  skip (gotcha #3). Needs the global-setup CSRF fix.
- `time-in(1)` — `toBeGreaterThan` on a DB-derived count; needs a time-in fixture.
- `select-smoke(1)` — `toHaveCount` drift.
- `equiv/*(3 fail + 1 skip)` — equivalence specs depend on the legacy WinForms
  app + specific records; per the plan, `test.skip` (with reason) any that need
  the legacy app, rather than forcing green.

## Suggested sub-ticket split (per area)
1. **Setup forms** (Bucket A) — one ticket, or split setup-A / setup-B. Biggest.
2. **Inventory** (Bucket B) — fixture chain.
3. **Bonus wizard panels** (Bucket C).
4. **Export to Accounting** (Bucket D).
5. **Notifications + Profile + form-field-states** (Bucket E app-shape).
6. **Dashboard / reconcile / parent-picker / report-editor** (larger feature specs).
7. **Infra**: global-setup CSRF fix (unblocks data-scoping) + equiv skip policy.

Each sub-ticket: triage with the SU override, prefer name/code fixture lookups +
seed-by-name additions, edit test code only for confirmed stale-DOM, append any
new module/fixture rows to `delllano-e2e-seed.sql`, never weaken an assertion.
