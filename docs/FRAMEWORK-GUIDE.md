# PET Tiger Playwright Framework — Guide

A walkthrough of how this test suite is put together: how a UI test flows from spec to
browser, where locators and test data live, what each util does, how the runner manager
gates execution, how environments switch, and how CI runs it.

---

## 1. The big picture

```
tests/*.spec.ts                → what to test (test bodies + assertions)
   │  imports test/expect from
   ▼
src/fixtures/base.fixture.ts   → dependency injection: hands each test its page objects,
   │                              logging, auth session, and the runnerManager enable/skip gate
   ▼
src/pages/*.ts (POM)           → how to drive the app (locators + workflow methods)
   │  locators are inline, accessibility-first
   ▼
Playwright Locator → expect()  → the actual browser interaction + verification

Supporting layers:
src/data/*.json                → test data (runner rows + per-module value bags)
src/utils/, src/auth/          → helpers (data, retry, logging, API auth, DB cleanup…)
src/config/ + env.* files      → environment switching (local/dev/qa)
src/reporting/                 → Slack / email / ELK reporters
.github/workflows/             → CI execution (two workflows)
```

Two conventions drive everything else:

1. **There is no separate locator file.** Locators live *inline* inside each page object,
   written accessibility-first (`getByRole` / `getByLabel` / `getByText`), not as CSS/XPath
   in JSON.
2. **Every spec imports `test`/`expect` from `src/fixtures/base.fixture.ts`, never from
   `@playwright/test` directly.** That single import is how a test inherits page objects,
   logging, the pre-authenticated session, Allure labels, and the runner "enabled" skip gate.

---

## 2. Writing a UI spec

Reference: [`tests/ui/user-setup.spec.ts`](../tests/ui/user-setup.spec.ts). A spec has four parts.

**(1) Imports** — always from the fixture, plus data and helpers:

```ts
import { expect, test } from '../../src/fixtures/base.fixture';    // NOT @playwright/test
import userData from '../../src/data/user-setup-data.json';         // module data bag
import { makeUser, randomInitials } from '../../src/utils/testData';// data factories
import { runSql } from '../../src/utils/db/sqlClient';               // cleanup helper
```

**(2) `describe` + `test`** with tags and a `testCaseId` annotation, destructuring only the
fixtures the test needs:

```ts
test.describe('User Setup Tests', { tag: '@user-setup' }, () => {
  test('[User Setup] End-to-end: create a user, verify, edit, delete.', {
      tag: ['@UI', '@E2E', '@Smoke', '@Local'],
      annotation: { type: 'testCaseId', description: 'USR-000' }, // ← binds test to a runnerManager row
  }, async ({ usersPage }) => {                                    // ← usersPage injected by the fixture
      ...
  });
});
```

**(3) The body** drives *workflow methods* on the page object and asserts on its locators:

```ts
const user = await createUser(usersPage, makeUser({ role: userData.defaults.all_fields_role }));
await expect(usersPage.userCreatedToast).toBeVisible();   // static locator field
const row = usersPage.userRow(user.name);                 // dynamic locator method
await expect(row).toContainText(user.role);
```

**(4) Lifecycle/cleanup** — PET Tiger has no UI delete, so created users are soft-deleted in
SQL via `afterEach`.

The logged-out variant — [`tests/ui/login/login-module.spec.ts`](../tests/ui/login/login-module.spec.ts) —
discards the pre-auth session at file scope:

```ts
test.use({ storageState: { cookies: [], origins: [] } });
```

---

## 3. Where locators live

Inline in each page object under [`src/pages/`](../src/pages/), in two forms.

**Static locators** → `readonly Locator` fields assigned in the constructor:

```ts
// src/pages/UsersPage.ts
this.newUserButton    = page.getByRole('button', { name: 'New User' });
this.nameInput        = page.getByRole('textbox', { name: 'Name *' });
this.userCreatedToast = page.getByText('User created');
this.nameFilter       = this.usersGrid.getByPlaceholder('Filter').first(); // scoped to a parent locator
```

**Dynamic/parametrized locators** (depend on runtime data) → factory *methods*:

```ts
roleOption(role: string): Locator   { return this.page.getByRole('option', { name: role, exact: true }); }
editUserLink(name: string): Locator { return this.page.getByRole('link', { name: `Edit User: ${name}` }); }
userRow(name: string): Locator      { return this.page.getByRole('row').filter({ has: this.editUserLink(name) }); }
```

**POM hierarchy:** [`BasePage.ts`](../src/pages/BasePage.ts) is a thin abstract base holding
`page`, `logger`, `baseUrl`, and `navigate()`. Concrete pages ([`LoginPage.ts`](../src/pages/LoginPage.ts),
[`LeftNavigationPage.ts`](../src/pages/LeftNavigationPage.ts), [`UsersPage.ts`](../src/pages/UsersPage.ts))
extend it, declare locators, and expose async *workflow* methods. Page objects can compose
others — `UsersPage` instantiates `LeftNavigationPage` to reach the screen the way a human
clicks. Workflow methods return semantic outcomes (e.g. `submit()` → `'created' |
'duplicate-initials'`) rather than raw booleans.

---

## 4. Test data

Three kinds:

- **Module value bags** — [`src/data/user-setup-data.json`](../src/data/user-setup-data.json),
  [`src/data/login-module-data.json`](../src/data/login-module-data.json). Static strings
  (role lists, expected messages, defaults). Loaded by a plain ESM `import` into the spec.
- **Runner rows** — [`src/data/runnerManager.json`](../src/data/runnerManager.json). One row
  per managed test case (see §6). Loaded through `DataProvider`.
- **Generated data** — [`src/utils/testData/`](../src/utils/testData/): `makeUser(overrides)`
  builds a run-unique New-User payload; `random.ts` provides `uid()`, `randomInitials()`,
  `randomEmail()`, etc. (not seeded, so parallel create-flows never collide).

Data-driven iteration in the current specs is a `for...of` over a data array inside one test
(e.g. asserting every role in `userData.roles` is selectable). The framework also supports
generating one test per runner row via `getEnabledTestData()`, but the existing specs use
one-explicit-test-per-row bound by `testCaseId`.

---

## 5. Utils, helpers & fixtures

### Fixtures — [`src/fixtures/`](../src/fixtures/)

[`base.fixture.ts`](../src/fixtures/base.fixture.ts) — the UI fixture used by every UI spec:

| Fixture | Gives you |
|---|---|
| `loginPage` / `leftNavigationPage` / `usersPage` | `new XxxPage(page)` — page objects with `page` injected |
| `gotoUrl` | side-effect: navigates to `/login` before the body |
| `authenticatedPage` | a `Page` from a context using `.auth/user.json` storage state |
| `apiRequest` | an `APIRequestContext` scoped to `API_URL` (for mixed UI+API specs) |
| `logger` / `workerLogger` | per-test / per-worker `Logger`, auto-logs start & end |
| `testCaseId` / `testCaseName` | option fixtures set via `test.use({...})` |
| `testCaseData` | auto-loads the runner row and **skips** the test if missing or `enabled === false` |

Its `beforeEach` resolves the runner row from the `testCaseId` annotation, applies the
enable/skip gate, and stamps Allure labels.

[`api.fixture.ts`](../src/fixtures/api.fixture.ts) — API-only counterpart (no browser).
Provides `apiContext` (raw), `authenticatedApi` (auth pre-applied), and `api` — a typed
`ApiHelper` with `get/post/put/...`, `authGet/authPost` (401/403 auto-retry), and
`assertStatus`/`assertSuccess`.

[`global-setup.ts`](../src/fixtures/global-setup.ts) / [`global-teardown.ts`](../src/fixtures/global-teardown.ts)
— create `.auth/` + output dirs, reset `allure-results/`, and (teardown) write Allure
env/executor files and run a safety-net SQL sweep of leftover test users.

### `src/utils/` — general helpers

| File | What it does |
|---|---|
| [`logger.ts`](../src/utils/logger.ts) | `Logger` — colored console + daily JSON-lines log files; `child()` for nested context |
| [`DataProvider.ts`](../src/utils/DataProvider.ts) | Singleton unifying JSON/CSV test-data access — `getTestCaseById`, `getRunnerData`, `getEnabledTestData`, `forSource` |
| [`dataReaders/`](../src/utils/dataReaders/) | `BaseDataReader` (caching + `readById`/`readEnabled`) with `JsonDataReader`, `CsvDataReader`, `TypeCoercionHelper` (pipe-delimited arrays for CSV) |
| [`retryHelper.ts`](../src/utils/retryHelper.ts) | `RetryHelper.retry/retryUntil` with linear/exponential/fibonacci backoff |
| [`networkHelper.ts`](../src/utils/networkHelper.ts) | `mockRoute`, `blockResources`, `waitForResponse`, `waitForNetworkIdle`, HAR record/replay |
| [`customAssertions.ts`](../src/utils/customAssertions.ts) | `assertElementCount`, `assertAllVisible`, `assertHasClass` |
| [`softAssertions.ts`](../src/utils/softAssertions.ts) | `SoftAssertions` — accumulate failures, `throwIfErrors()` once |
| [`apiResponseUtils.ts`](../src/utils/apiResponseUtils.ts) | `verifyJsonKeyValues` — deep JSON body matcher |
| [`performanceMonitor.ts`](../src/utils/performanceMonitor.ts) | `measure()`, `getReport()`, `getSlowOperations()` |
| [`visualRegression.ts`](../src/utils/visualRegression.ts) | `compareScreenshots` wrapper over `toHaveScreenshot` |
| [`apiMockServer.ts`](../src/utils/apiMockServer.ts) | register a set of stubs and `applyTo(page)` |
| [`allureHelper.ts`](../src/utils/allureHelper.ts) | generate Allure reports via JS API; `prepareLeanEmailReport` (screenshot-only single file) |
| [`allureLabels.ts`](../src/utils/allureLabels.ts) | `resolveCaseId`, `applyAllureLabels`; derives Epic→Feature→Story from spec path |
| [`db/sqlClient.ts`](../src/utils/db/sqlClient.ts) | `runSql` (async, `@name` bound params) — test-user cleanup over the `mssql` driver or `sqlcmd`, chosen by `DB_TRUSTED` |
| [`testData/`](../src/utils/testData/) | `makeUser`, `uid`, `randomInitials`, `randomEmail`, `pickRandom` |

### `src/auth/` — API auth (separate from browser login)

- [`authContextFactory.ts`](../src/auth/authContextFactory.ts) — `buildAuthContextOptions()`
  builds request-context options for the configured `AUTH_TYPE` (`oauth2`/`basic`/`apikey`/`none`).
- [`authorizationManager.ts`](../src/auth/authorizationManager.ts) — OAuth2 client-credentials
  token manager with in-memory caching.
- [`requestBuilder.ts`](../src/auth/requestBuilder.ts) — `executeWithAuthRetry()` runs a
  request and retries once on 401/403 (after clearing the token cache).

Browser login is separate: [`tests/auth.setup.ts`](../tests/auth.setup.ts) logs in once via
`LoginPage` and persists the session to `.auth/user.json`, which the `chromium` project
reuses so no test re-logs-in.

---

## 6. The runner manager

[`src/data/runnerManager.json`](../src/data/runnerManager.json) holds
`{ "runnerManager": [ ...rows ] }`. Each row (`TestCaseData` in
[`src/types/index.ts`](../src/types/index.ts)):

```json
{ "id": "UI-001", "category": "ui", "testName": "loginWithValidCredentials",
  "testTitle": "Login succeeds with valid credentials", "tags": "smoke|regression",
  "enabled": true, "shouldComplete": true, "expectedCount": 1 }
```

- **`enabled` is the single source of truth for whether a test runs.** It does *not* generate
  tests — specs are hand-written and each declares the row it maps to via
  `annotation: { type: 'testCaseId', description: 'UI-001' }`.
- At runtime the fixture's `beforeEach` calls `resolveCaseId()` → `getTestCaseById()` → if
  `enabled === false`, `test.skip()`. To disable a test suite-wide, flip `enabled` in the
  JSON — no code change.
- Other fields feed **Allure reporting** (`id`, `testDescription`, `tags`, `category` →
  Epic/severity). `shouldComplete`/`expectedCount` are metadata only, not enforced.
- Source is JSON by default; `TEST_DATA_SOURCE=csv` switches the reader to
  `runnerManager.csv` (paths resolved in [`src/config/dataSource.config.ts`](../src/config/dataSource.config.ts)).
  The `.csv` counterpart does not exist yet — CSV mode requires creating it with matching columns.

> There is a second, unrelated file [`src/data/runnerList.json`](../src/data/runnerList.json)
> read by [`methodInterceptor.ts`](../src/listeners/methodInterceptor.ts). It is an **inert**
> opt-in `--grep` filter shipping as `{}` and is not wired into the run path.
> `runnerManager.json` is the one that matters.

---

## 7. Environment switching (local / dev / qa)

The mechanism spans four pieces:

1. **`TEST_ENV` selects the environment** (default `local`), set by the launcher
   [`scripts/run-playwright.js`](../scripts/run-playwright.js) from the npm-script argument.
2. **The dotenv loader** [`src/config/envLoader.ts`](../src/config/envLoader.ts) runs at the
   top of [`playwright.config.ts`](../playwright.config.ts) with precedence:
   ```
   1. OS / CI environment variables   ← never overridden (CI secrets always win)
   2. env.<name>  (env.local / env.dev / env.qa)
   3. .env        (optional shared base)
   ```
3. **Per-env URLs** live in the env files: `env.local` → `http://localhost:3000` +
   `http://localhost:8080/api`; `env.dev` / `env.qa` → the dev/qa hosts (+`/api`). A typed
   map also exists in [`src/config/environments.ts`](../src/config/environments.ts) for the
   programmatic `EnvironmentManager`.
4. **Resolution at runtime:** `use.baseURL = process.env.BASE_URL`; the API base is read via
   `getConfigValue(ConfigProperties.API_URL)` and normalized to a trailing slash.
   [`src/enums/configProperties.ts`](../src/enums/configProperties.ts) maps logical names →
   env-var names (`getConfigValue`, `getConfigBoolean`, `getEnvLabel`).

**How you switch, in practice:**

| Where | How env is selected |
|---|---|
| **Local** | `npm test` → local · `npm run test:dev` → dev · `npm run test:qa` → qa. The launcher pins `TEST_ENV`; envLoader loads `env.<name>`. |
| **CI — [`e2e.yml`](../.github/workflows/e2e.yml)** (GitHub-hosted, dev staging) | Pins `TEST_ENV=dev` as job env → `env.dev` supplies `BASE_URL=https://app.ptdev.xyz` and `API_URL=https://api.ptdev.xyz/api`; `PASSWORD` comes from a secret. Report tags the env `[ci]`. |
| **CI — [`e2e-local.yml`](../.github/workflows/e2e-local.yml)** (self-hosted, localhost) | Hard-sets `TEST_ENV=local`, `BASE_URL=http://localhost:3000`, `API_URL=...:8080/api` as job env — OS-env precedence makes these win over env files. |

---

## 8. GitHub CI

Two complementary workflows, both listening for the same external `repository_dispatch`
(`run-playwright`) so one app-side build fans out to both.

**[`e2e.yml`](../.github/workflows/e2e.yml) — "E2E" (dev staging)**
- Triggers: **twice-daily cron — 4pm IST (`30 10 * * *`) and 6pm IST (`30 12 * * *`)** — plus
  push to `main`, manual dispatch, and external `repository_dispatch`.
- Runner: `ubuntu-latest` (GitHub-hosted), 15-min timeout.
- Does **not** boot an app — targets dev staging via `TEST_ENV=dev` (see §7). Pinning
  `TEST_ENV` is load-bearing: unset, envLoader falls back to `local` and the suite would aim
  at a `localhost:3000` that doesn't exist on the runner.
- Steps: guard that the password secret exists → checkout → Node 22 → Java 21 (Allure) →
  `npm ci` → `npx playwright install --with-deps` → compute deterministic `REPORT_S3_URL` →
  `npx playwright test` → generate Allure report → upload artifacts → optional `aws s3 sync`.
- Credentials: the `DEV_PASSWORD` **secret** is required and has no fallback — a generic
  `PASSWORD` secret is deliberately *not* consulted, because a stale localhost one silently
  authenticated against the wrong environment. The username is the `DEV_USER_NAME`
  **variable** (not a secret — a login name isn't a credential, and masking a short value
  like `su` mangles unrelated words in the log), defaulting to `su`.
  Reporting (`SEND_EMAIL`/`SEND_SLACK`/`SEND_S3`) opt-in via repo vars.
- Test-user cleanup runs over SQL, same as everywhere else — `env.dev` sets `DB_CLEANUP=yes`
  and `DB_TRUSTED=no`, with `DB_SERVER`/`DB_USER`/`DB_PASSWORD` as secrets and `DB_CLIENT` as
  a repo variable. `DB_TRUSTED=no` selects the `mssql` driver rather than the `sqlcmd` CLI,
  so no CLI install step is needed — the transport table is in
  [`sqlClient.ts`](../src/utils/db/sqlClient.ts)'s module docs. The one thing
  `ubuntu-latest` still can't provide is a network route to the database; the connectivity
  probe in `global-setup.ts` turns a blocked port into an explicit `::error::` annotation
  instead of a silently-skipped cleanup that leaves users behind.

**[`e2e-local.yml`](../.github/workflows/e2e-local.yml) — "E2E (localhost, self-hosted)"**
- Runner: `[self-hosted, Windows, X64]`, 30-min timeout. Self-hosted because the Go API uses
  Windows Integrated Auth (SSPI) to a local SQL Server Express.
- **Boots the full app** from the private `web-pet` monorepo: `docker compose up` (MinIO +
  Gotenberg) → `go build` + start API → start web on port 3000 → wait on `/api/health` and
  `/` → `npx playwright test` → dump logs, kill ports, `docker compose down -v`, generate +
  upload Allure report.

**Reporting** ([`src/reporting/`](../src/reporting/)) runs *inside* Playwright's `onEnd` — no
separate CI send step. All three are self-gating (do nothing unless their `SEND_*` flag +
endpoint are set, and never fail the run):
- [`slackReporter.ts`](../src/reporting/slackReporter.ts) — Slack Block Kit via webhook.
- [`emailReporter.ts`](../src/reporting/emailReporter.ts) — HTML email via nodemailer,
  attaches the lean Allure report.
- [`dashboard.ts`](../src/reporting/dashboard.ts) — POSTs run summary to ELK.
- [`runSummary.ts`](../src/reporting/runSummary.ts) — shared collector that builds the
  render-agnostic summary all three consume.

**npm scripts** ([`package.json`](../package.json)) all go through `run-playwright.js <env>`:
`test` / `test:dev` / `test:qa`, plus `test:headed`, `test:ui`, `test:debug`, `test:smoke`
(`--grep=@Smoke`), `test:api` (`--project=api`), `test:workflow`, `test:last-failed`,
`report:allure`, `docker:build`/`docker:run`.
```
