# tests/webpet — migrated web-pet e2e suite

Verbatim lift-and-shift of the PET Tiger app repo's Playwright suite
(`web-pet/apps/web/e2e`): **406 tests in 56 spec files**. It runs under its own
opt-in Playwright projects (`webpet-setup` → `webpet`) and never joins the
framework's `auth-setup`/`chromium`/`api` projects — a bare `npx playwright test`
does not even see it.

## Parity contract (why this folder ignores framework conventions)

The migration's acceptance criterion is reproducing the source repo's localhost
baseline **exactly: 362 passed / 18 skipped / 26 failed (~48 min)**. The 26
failures / 18 skips are the suite's own documented state (seed gaps, deferred
features, opt-in equiv specs — see [seed/TRIAGE-DELLLANO.md](seed/TRIAGE-DELLLANO.md)).
Treat *deltas* from the baseline as regressions, not the raw red count.

To hold that baseline, the `webpet` project pins the SOURCE repo's settings and
deliberately overrides this repo's globals:

| Setting | webpet project | framework global |
|---|---|---|
| test timeout | 30 s | 110 s |
| expect timeout | 5 s | 10 s |
| retries | 0 (even in CI) | CI = 2 |
| video / screenshot | off | on |
| trace | on-first-retry | retain-on-failure |
| storageState | own (`tests/webpet/.auth/`) | `.auth/user.json` |

These specs use their own [fixtures.ts](fixtures.ts) (API-login auth + CSRF +
locale pinning), not `src/fixtures/base.fixture.ts` — that is intentional and
stays until the gradual POM conversion (see below).

## Running

Stack required on localhost (Playwright boots nothing): Vite `:3000` proxying
`/api` → Go API `:8080` → SQL Server (DelLlano), MinIO `:9000`, Gotenberg
`:3010`. Apply the seed once per DB refresh (idempotent):

```sh
sqlcmd -S localhost -b -i tests/webpet/seed/delllano-e2e-seed.sql
```

```sh
npm run test:webpet                                  # whole suite, localhost
npm run test:webpet -- tests/webpet/employee.spec.ts # one file (14/14 = reference spec)
npm run test:webpet:list                             # collection check (406 tests / 56 files)
npm run test:webpet:dev                              # whole suite, dev staging
```

Direct CLI use needs the projects materialized: `npx playwright test
--project=webpet` works (the config detects the flag and exports `WEBPET=1` for
its workers); for anything fancier set `WEBPET=1` yourself.

CI: [.github/workflows/webpet-e2e-local.yml](../../.github/workflows/webpet-e2e-local.yml)
(self-hosted, boots the stack, applies the seed, nightly 2:00 AM IST + manual) and
[webpet-e2e-dev.yml](../../.github/workflows/webpet-e2e-dev.yml) (ubuntu →
app.ptdev.xyz, nightly 4:00 AM IST + manual). Neither runs on push.

### Environment variables

| Var | Purpose | Where set |
|---|---|---|
| `E2E_ADMIN_USER` / `E2E_ADMIN_PASSWORD` | admin (`su`) API login in [support/provision.ts](support/provision.ts) + notifications.spec.ts; falls back to `USER_NAME`/`PASSWORD` (see [support/webpet-env.ts](support/webpet-env.ts)) so a local `test:webpet:dev` reuses the framework's dev credentials | `env.local` (committed throwaway) / CI secrets (`LOCAL_PASSWORD`, `DEV_PASSWORD`) / fallback: `env.dev` + `.env` |
| `WEBPET_API_ORIGIN` | base for DIRECT API request contexts; **unset on local** (calls go through the Vite proxy, byte-identical to the source repo), `https://api.ptdev.xyz` on dev | `env.dev` only |
| `S3_ENDPOINT` | non-empty ⇒ employee-documents.spec.ts runs (needs MinIO) | `env.local`; deliberately absent on dev |
| `WEBPET=1` | materializes the webpet projects (auto-set by the npm scripts / `--project=webpet`) | scripts/CI |
| `PET_EXPORT_EQUIV`, `PET_DEVICE_CMD_EQUIV`, `SCAN_TIME_IN_EQUIV` (+ `PET_LEGACY_*`, `SCAN_EMPLOYEE_BARCODE`) | opt-in equiv parity specs — set nowhere, skip by default (needs a Windows host with legacy baselines) | — |

## Per-test run control (the webpet runner)

Every test has a row (`WP-0001`…`WP-0406`), keyed by `file` + full `title`
path — no annotations needed, which is what makes loop-generated tests
(bonus-flow, scan-mode…) individually addressable. Two files, same
authored-CSV → JSON-mirror model as `src/data/runner/`:

- [src/data/webpet/webpetRunnerManager.csv](../../src/data/webpet/webpetRunnerManager.csv)
  — **edit this one** (Excel-friendly). Human-owned columns: `enabled`
  (`true`/`false`), `testCaseId`, `notes`. The `id`/`file`/`title` columns are
  structural — the sync script owns them.
- [src/data/webpet/webpetRunnerManager.json](../../src/data/webpet/webpetRunnerManager.json)
  — generated runtime mirror read by [support/webpet-gate.ts](support/webpet-gate.ts)
  (auto fixture in `fixtures.ts` and [support/clean-fixtures.ts](support/clean-fixtures.ts)).
  Never hand-edit; the CSV wins on sync.

Flip a CSV row's `enabled` to `false`, run the mirror, and the test skips with
a reason naming its WP id. Semantics are **fail-open**: missing file / unknown
test ⇒ runs.

```sh
npm run webpet:runner:sync            # rediscover tests + merge + write CSV & JSON
node scripts/webpet-runner-sync.js --mirror   # fast: rebuild JSON from an edited CSV only
npm run webpet:runner:check           # CI drift alarm: discovery + CSV⇄JSON agreement
```

The framework's own `runner:check` deliberately excludes this tree
(`scripts/lib/runner-data.js` → `EXCLUDED_TEST_DIRS`).

## Dev staging (report-only)

Dev runs are a triage baseline, not a pass/fail gate — dev's DB is not the
seeded DelLlano, and the suite **mutates dev data** (test crews/employees/jobs,
Ranch/Field inline edits, a `RestrictedTest_*` user, user preferences).
Expected dev-failure classes are listed in the header of
`webpet-e2e-dev.yml`; disable dev-incompatible tests via the runner file after
the first baseline runs.

## Migration notes (every deviation from the source repo)

Byte-identical: 50 of 56 specs, `data-factory.ts`, `parent-picker-helpers.ts`,
`fixtures/sample.pdf`, `seed/*`. Everything else, exhaustively:

1. **fixtures.ts** — storage paths anchored to `__dirname` (was `process.cwd()/e2e`);
   `request` overrides use `API_BASE_URL` (identical on local); `_webpetGate`
   auto fixture added to `test` and `testAsRestricted`; `export type { Page }`
   added (reconcile-job-cards imports it; the source repo never typechecked e2e).
2. **global-setup.ts → support/provision.ts + webpet.setup.ts** — same body; runs
   as a dependency project instead of globalSetup (slot taken; failure scopes to
   this suite); request contexts target `API_BASE_URL` with `Origin` = web origin;
   auth dir → `tests/webpet/.auth/`.
3. **NEW support/** — `webpet-env.ts` (URL resolution), `webpet-gate.ts` (runner
   gate), `clean-fixtures.ts` (gated raw-test shim).
4. **data-scoping.spec.ts** — `.auth` paths → `__dirname`; side request context →
   `API_BASE_URL`; dropped the now-unused `baseURL` fixture binding.
5. **employee-documents.spec.ts** — `sample.pdf` path → `__dirname`.
6. **notifications.spec.ts** — raw `@playwright/test` import → `./support/clean-fixtures`.
7. **equiv/variety…** — storage path → `__dirname/..`; cleanup context →
   `API_BASE_URL` (was `PLAYWRIGHT_BASE_URL ?? localhost`).
8. **equiv/biometric…, equiv/export-pet-setup…** — storage path → `__dirname/..`.
9. **billing-center.spec.ts, timesheet_validation.spec.ts** — types only:
   `Parameters<typeof test>[1]['page']` → `Page` (overload resolution differs on
   this repo's @playwright/test 1.58.2 vs the source's 1.59.x).
10. **mobile-tab-labels.spec.ts** — imports only: dropped unused `expect`
    (`noUnusedLocals`).

Not copied: `e2e/ci/*` (container CI — superseded by the workflows here),
`e2e/README.md` (this file adapts it), `tsconfig.json`, `.auth/`, `.screenshots/`.

## Gradual POM conversion (phase 2)

Convert module-by-module: page objects go in `src/pages/webpet/`, specs adopt
`base.fixture` + explicit `testCaseId` annotations, and each converted test's
runner row gets its `testCaseId` filled in (ids never renumber). Do not convert
anything until its module is green/triaged against the baseline.

## Troubleshooting

- **Everything fails at `webpet-setup`** — admin login failed: check
  `E2E_ADMIN_USER`/`E2E_ADMIN_PASSWORD` (must match the API's `PT_SU_PASSWORD`)
  and that the stack is up. `Admin`/`Admin` no longer authenticates.
- **Stale auth state** — delete `tests/webpet/.auth/` and rerun (the setup
  project recreates it).
- **~27 unexpected failures after a DB refresh** — re-apply the seed (above).
- **A test unexpectedly skips with a WP-id reason** — its runner row is
  `enabled:false`; flip it back or run `npm run webpet:runner:sync` to audit.
