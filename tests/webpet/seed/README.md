# DelLlano e2e seed & run playbook (WEBPET-831)

The `apps/web/e2e` Playwright suite was originally authored against the **PetData**
seed database. The active DB is now **DelLlano**, which has different records,
different licensed modules, and predates some current app behavior. As a result
most specs fail — but the failures are **environmental or stale-test issues, not
application bugs**.

This directory holds the idempotent SQL needed to make the suite's data
assumptions true on DelLlano, plus the procedure for running the suite.

> `employee.spec.ts` is the reference template — it passes **14/14** on DelLlano.

## Running the suite

Prerequisites:

- Web dev server (Vite proxy) on `:3000` **and** the Go API running.
- DelLlano fixtures seeded (see below).

The suite default login `Admin`/`Admin` **no longer authenticates** — login now
goes through TigerMaster, and `Su` is the only user present in both TigerMaster
and DelLlano. Override the login with the SU credentials:

```sh
# SU password is PT_SU_PASSWORD in apps/api/.env (do not hardcode it here)
E2E_ADMIN_USER=su E2E_ADMIN_PASSWORD="<PT_SU_PASSWORD from apps/api/.env>" \
  pnpm exec playwright test e2e/employee.spec.ts
```

SU logs in as a full Administrator (all permissions), so it satisfies the
admin-context specs.

## Seeding DelLlano

```sh
sqlcmd -S localhost -d master -i apps/web/e2e/seed/delllano-e2e-seed.sql
```

[`delllano-e2e-seed.sql`](./delllano-e2e-seed.sql) is **idempotent** (every
statement is guarded) and safe to re-run, including after a DelLlano refresh.

It is intentionally **outside** the migration runner (`apps/api/migrations`,
`cmd/migrate`): that runner applies per-client migrations to **every** active
client DB in `ClientMaster`. These are test fixtures and per-client licensing —
they must never leak into real client databases.

The seed currently covers `employee.spec.ts`. As more specs are migrated, extend
it with their fixtures and any module rows they need (see taxonomy below).

## Failure taxonomy

When a spec fails on DelLlano, triage it into one of three buckets:

1. **Missing fixtures** — the spec hardcodes a PetData record absent in DelLlano
   (e.g. employee id=5 "Locker, Mather", department "ADP 5"). **Fix:** add an
   idempotent insert to `delllano-e2e-seed.sql`. The `Employee` schema is
   identical PetData↔DelLlano, so a row can be copied with `IDENTITY_INSERT`,
   nulling FK columns and remapping Department/Crew to valid DelLlano ids.

2. **Module gates** — setup endpoints are wrapped in `RequireModule(...)`. If
   DelLlano (ClientId 1) isn't licensed for the module, the endpoint returns
   **403** and the page can't load data (e.g. the Department module being off
   made `/api/departments` 403, leaving the department combobox empty). **Fix:**
   add a `TigerMaster.dbo.ClientModules (ClientId, ModuleId, ActiveDate,
   ExpiryDate)` row (nulls = always active). Modules load at login; the active
   set is the `vw_ActiveClientModules` view.

3. **Stale tests (DB-independent)** — the spec predates current app behavior and
   would fail on any DB. Patterns seen in `employee.spec.ts`:
   - Form validation is `mode: 'onBlur'` — `blur()` after `fill()` before
     asserting Save/submit is enabled.
   - A dirty form relabels the footer's cancel button from "Cancel" to
     **"Discard changes"**, and clicking it opens the `UnsavedChangesModal`
     guard ("Don't Save" abandons edits).
   - List pages are now `role="grid"` DataGrids (no `<td>`).

Prefer seed/module fixes for environment mismatches (keep tests asserting real
data); only edit test code for genuine stale-test cases where the app is
confirmed correct.
