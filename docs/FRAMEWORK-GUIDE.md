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
   │                              logging, auth session, and the 3-layer enable/scope/skip gate
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
2. **Every spec imports `test`/`expect` from a framework fixture, never from
   `@playwright/test` directly.** That single import is how a test inherits page objects,
   logging, the pre-authenticated session, Allure labels, and the runner "enabled" skip gate.
   For the journey suites that fixture is `src/fixtures/base.fixture.ts`.

> **The one exception, and it matters.** `tests/webpet/` — the migrated web-pet suite —
> imports `src/fixtures/webpet.fixture.ts` and **must never import `base.fixture`**.
> `base.fixture` resolves a test's id through `DataProvider`, a singleton bound process-wide
> to `src/data/runner/`; web-pet rows live in `src/data/webpet/`, so every `WP-####` would
> hit the "has no runner row" branch and **all 406 tests would skip while the run reported
> green**. `webpet.fixture` composes the same building blocks against the web-pet row source.
> `npm run webpet:ids:check` fails the build if that import ever appears.
> See [tests/webpet/README.md](../tests/webpet/README.md).

---

## 2. Writing a UI spec

Reference: [`tests/web/journey-a-setup/a01-user-setup.spec.ts`](../tests/web/journey-a-setup/a01-user-setup.spec.ts).
A spec has four parts.

**(1) Imports** — always from the fixture, plus data and helpers:

```ts
import { expect, test } from '../../src/fixtures/base.fixture';    // NOT @playwright/test
import { userSetupData as userData } from '@data/journey-a/userSetupData'; // journey value bag
import { makeUser, randomInitials } from '../../src/data/generated';// data factories
```

**(2) `describe` + `test`** with tags and a `testCaseId` annotation, destructuring only the
fixtures the test needs:

```ts
test.describe('User Setup Tests', { tag: '@user-setup' }, () => {
  test('[User Setup] End-to-end: create a user, verify, edit, delete.', {
      tag: ['@UI', '@E2E', '@Smoke', '@Local'],
      annotation: { type: 'testCaseId', description: 'A1-001' }, // ← binds test to a runner row
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

The logged-out variant — [`tests/web/system/login-module.spec.ts`](../tests/web/system/login-module.spec.ts) —
discards the pre-auth session at file scope:

```ts
test.use({ storageState: { cookies: [], origins: [] } });
```

---

## 3. Where locators live

Inline in each page object under [`src/pages/`](../src/pages/), in two forms.

**Static locators** → `readonly Locator` fields assigned in the constructor:

```ts
// src/pages/admin/UsersPage.ts
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
`page`, `logger`, `baseUrl`, and `navigate()`. A **list + New/Edit form** screen instead extends
[`SetupScreenPage.ts`](../src/pages/SetupScreenPage.ts), which adds the grid
([`DataGridComponent`](../src/components/DataGridComponent.ts)), sidebar navigation, and the
on-blur / Save-stays-disabled / "Unsaved changes" save behaviour every PET Tiger setup screen
shares. Concrete pages ([`shell/LoginPage.ts`](../src/pages/shell/LoginPage.ts),
[`shell/LeftNavigationPage.ts`](../src/pages/shell/LeftNavigationPage.ts),
[`admin/UsersPage.ts`](../src/pages/admin/UsersPage.ts))
extend it, declare locators, and expose async *workflow* methods. Page objects can compose
others — `UsersPage` instantiates `LeftNavigationPage` to reach the screen the way a human
clicks. Workflow methods return semantic outcomes (e.g. `submit()` → `'created' |
'duplicate-initials'`) rather than raw booleans.

---

## 4. Test data

Three kinds:

- **Journey value bags** — [`src/data/static/journey-a/userSetupData.ts`](../src/data/static/journey-a/userSetupData.ts),
  [`src/data/static/system/loginModuleData.ts`](../src/data/static/system/loginModuleData.ts). Static strings (role lists,
  expected messages, defaults), exported as typed consts and imported directly by the spec.
  TypeScript rather than JSON because `test_user_prefix` is shared by `userFactory` (which
  *names* test users) and `global-teardown` (which *sweeps* them) — a drift between those two
  would silently orphan test users, so it is single-source and compile-checked.
- **Runner rows** — [`src/data/runner/`](../src/data/runner/), one file per journey
  (`journey-a.csv` authored, `journey-a.json` a generated mirror), read as one combined set by
  [`MultiFileDataReader`](../src/data/readers/MultiFileDataReader.ts) and selected by
  `TEST_DATA_SOURCE` (exactly one format is read;
  no conversion step). One row per managed test case (see §6). Loaded through `DataProvider`.
- **Runtime overrides** — [`src/data/runnerList.json`](../src/data/runnerList.json). Ships as
  `{}`. See §6 for how it overrides the runner rows.
- **Generated data** — [`src/data/generated/`](../src/data/generated/): `makeUser(overrides)`
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
| `testCaseData` | auto-loads the runner row for the spec body; **skips** if missing or `enabled === false`. Note this fixture is lazy — the `beforeEach` gate in §6 is what governs every test, whether or not the body destructures this |

Its `beforeEach` resolves the runner row from the `testCaseId` annotation, applies the
enable/skip gate, and stamps Allure labels.

[`api.fixture.ts`](../src/fixtures/api.fixture.ts) — API-only counterpart (no browser).
Provides `apiContext` (raw), `authenticatedApi` (auth pre-applied), and `api` — a typed
`ApiHelper` with `get/post/put/...`, `authGet/authPost` (401/403 auto-retry), and
`assertStatus`/`assertSuccess`.

[`global-setup.ts`](../src/fixtures/lifecycle/global-setup.ts) / [`global-teardown.ts`](../src/fixtures/lifecycle/global-teardown.ts)
— create `.auth/` + output dirs, reset `artifacts/allure/results/`, and (teardown) write Allure
env/executor files and run a safety-net SQL sweep of leftover test users.

### `src/utils/` — general helpers

| File | What it does |
|---|---|
| [`logger.ts`](../src/utils/logger.ts) | `Logger` — colored console + daily JSON-lines log files; `child()` for nested context |
| [`DataProvider.ts`](../src/data/readers/DataProvider.ts) | Singleton unifying JSON/CSV test-data access — `getTestCaseById`, `getRunnerData`, `getEnabledTestData`, `forSource` |
| [`dataReaders/`](../src/data/readers/) | `BaseDataReader` (caching + `readById`/`readEnabled`) with `JsonDataReader`, `CsvDataReader`, `TypeCoercionHelper` (pipe-delimited arrays for CSV) |
| [`allureHelper.ts`](../src/reporting/generate/allure/report.ts) | generate Allure reports via JS API; `acquireLeanReport` (screenshot-only single file, built once per run and shared by the email + Slack channels) |
| [`allureLabels.ts`](../src/reporting/generate/allure/labels.ts) | `resolveCaseId`, `applyAllureLabels`; derives Epic→Feature→Story from spec path |
| [`cleanup/cleanupRegistry.ts`](../src/utils/cleanup/cleanupRegistry.ts) | `CleanupRegistry` (the `cleanup` fixture) + `sweepLeftovers` — deletes the records a test created through the app's API |
| [`api/sessionContext.ts`](../src/utils/api/sessionContext.ts) | `createSessionRequestContext` — an `APIRequestContext` carrying `.auth/user.json`'s session plus the `Origin` / `X-CSRF-Token` the API demands |
| [`api/usersApi.ts`](../src/utils/api/usersApi.ts) | `listUsers`, `findUserIdByName`, `deleteUserById`, `deleteUserByName` — the rowversion-guarded `DELETE /users/{id}` |
| [`testData/`](../src/data/generated/) | `makeUser`, `uid`, `randomInitials`, `randomEmail`, `pickRandom` |

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

Each file in [`src/data/runner/`](../src/data/runner/) holds
`{ "runnerManager": [ ...rows ] }` (JSON) or a header row with the same columns (CSV).
Each row (`TestCaseData` in
[`src/types/index.ts`](../src/types/index.ts)):

```json
{ "id": "UI-001", "category": "ui", "testName": "loginWithValidCredentials",
  "testTitle": "Login succeeds with valid credentials", "tags": "smoke|regression",
  "enabled": true, "shouldComplete": true, "expectedCount": 1 }
```

- **`enabled` is the baseline for whether a test runs**, overridable only by `runnerList.json`
  (below). It does *not* generate tests — specs are hand-written and each declares the row it
  maps to via `annotation: { type: 'testCaseId', description: 'UI-001' }`.
- Other fields feed **Allure reporting** (`id`, `testDescription`, `tags`, `category` →
  Epic/severity). `shouldComplete`/`expectedCount` are metadata only, not enforced.
- **Source is JSON or CSV**, chosen by `TEST_DATA_SOURCE` (default `json`); exactly one is read,
  and there is no conversion or generation step — both files are hand-maintained and committed.
  Paths resolve in [`src/config/dataSource.config.ts`](../src/config/dataSource.config.ts). Keep
  the two in sync: a stale copy would silently apply different toggles if the source is switched.

### The two-layer execution gate

The fixture's `beforeEach` resolves the row, then applies two layers in order:

| Layer | File | Effect |
|---|---|---|
| 1 | [`runnerList.json`](../src/data/runnerList.json) | Matched on row `id`. **Wins outright** — `execute: "yes"` runs a test even when its row says `enabled: false`; `execute: "no"` skips it even when enabled. |
| 2 | `src/data/runner/*` | Applies when the id is absent from `runnerList`: skips if `enabled === false`, or if the id has **no row at all**. |
| 3 | `TEST_SCOPE` ([`src/config/scope.ts`](../src/config/scope.ts)) | Skips a row whose `segments` do not intersect the customer's, or whose `modules` are not all licensed. Unset = no filtering. |

Override is **per-entry, not a whitelist** — an id missing from `runnerList` falls through to
its runner row, so adding one entry cannot silently disable everything else.
`runnerList.json` ships as `{}`, meaning "the runner rows govern everything"; keep it that way
for normal runs, since `execute: "yes"` can resurrect a test that was deliberately switched off.

A `testCaseId` with **no matching row is skipped**, not run. That is deliberate: the gate used to
check only `enabled === false`, so an unknown id fell through and executed ungoverned — USR-000
ran in CI and burned both retries for exactly that reason. Adding a spec with a new `testCaseId`
therefore requires adding its row too; the skip reason names the missing id.

> Unannotated tests (e.g. [`tests/auth.setup.ts`](../tests/auth.setup.ts)) resolve to an empty
> id and are exempt from both layers — they must always run, or the browser projects lose the
> shared session they depend on.

---

## 7. Environment switching (local / dev / qa)

The mechanism spans four pieces:

1. **`TEST_ENV` selects the environment** (default `local`), set by the launcher
   [`scripts/run-playwright.js`](../scripts/run-playwright.js) from the npm-script argument.
2. **The dotenv loader** [`src/config/envLoader.ts`](../src/config/envLoader.ts) runs at the
   top of [`playwright.config.ts`](../playwright.config.ts) with precedence:
   ```
   1. OS / CI environment variables   ← never overridden (CI secrets always win)
   2. env.<name>  (.env.local / .env.dev / .env.qa)
   3. .env        (optional shared base)
   ```
3. **Per-env URLs** live in the env files: `.env.local` → `http://localhost:3000` +
   `http://localhost:8080/api`; `.env.dev` / `.env.qa` → the dev/qa hosts (+`/api`). The env
   files are the only source — a second typed map and a programmatic `EnvironmentManager`
   used to exist alongside them, reading `DEV_APP_URL`/`QA_APP_URL` variables that nothing
   ever set; both were removed so there is exactly one place to look.
4. **Resolution at runtime:** `use.baseURL = process.env.BASE_URL`; the API base is read via
   `getConfigValue(ConfigProperties.API_URL)` and normalized to a trailing slash.
   [`src/config/configProperties.ts`](../src/config/configProperties.ts) maps logical names →
   env-var names (`getConfigValue`, `getConfigBoolean`, `getEnvLabel`).

**How you switch, in practice:**

| Where | How env is selected |
|---|---|
| **Local** | `npm test` → local · `npm run test:dev` → dev · `npm run test:qa` → qa. The launcher pins `TEST_ENV`; envLoader loads `env.<name>`. |
| **CI — [`e2e.yml`](../.github/workflows/e2e.yml)** (GitHub-hosted, dev staging) | Pins `TEST_ENV=dev` as job env → `.env.dev` supplies `BASE_URL=https://app.ptdev.xyz` and `API_URL=https://api.ptdev.xyz/api`; `PASSWORD` comes from a secret. Report tags the env `[ci]`. |
| **CI — [`e2e-local.yml`](../.github/workflows/e2e-local.yml)** (self-hosted, localhost) | Hard-sets `TEST_ENV=local`, `BASE_URL=http://localhost:3000`, `API_URL=...:8080/api` as job env — OS-env precedence makes these win over env files. |

---

## 8. GitHub CI

Three workflows: `e2e.yml` against dev staging (both suites), plus `e2e-local.yml` and
`webpet-e2e-local.yml` against a self-hosted localhost stack. `e2e.yml` owns the repo's **only
cron** and runs both suites from it; there is no separate orchestrator. It also listens for the external
`repository_dispatch` (`run-playwright`), so an app-side build reaches dev staging; the local pair
are manual-dispatch only and never triggered by a push.

**[`e2e.yml`](../.github/workflows/e2e.yml) — "E2E" (dev staging)**
- Triggers: **`schedule` (`28 10 * * *`, ~4:00 PM IST — the daily dry run)**, push to `main`, manual
  dispatch, external `repository_dispatch`, and `workflow_call`.
- Serves **both** suites via `matrix.suite` (`journey` | `webpet`) — see §9. The cron runs both
  serially; every other trigger runs one.
- Runner: `ubuntu-latest` (GitHub-hosted); 15-min timeout for journey, 90 for webpet.
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
- Test-data cleanup needs no secrets and no database route: it is an API call over the same
  session the tests use ([ENVIRONMENTS.md](ENVIRONMENTS.md#test-data-cleanup)). It used to run
  over SQL, which is why the now-unused `DB_SERVER`/`DB_USER`/`DB_PASSWORD` secrets and
  `DB_CLIENT` variable may still exist in the repo settings — dev staging's SQL Server is
  VPC-private and stays that way.

**[`e2e-local.yml`](../.github/workflows/e2e-local.yml) — "E2E (localhost, self-hosted)"**
- Runner: `[self-hosted, Windows, X64]`, 30-min timeout. Self-hosted because the Go API uses
  Windows Integrated Auth (SSPI) to a local SQL Server Express.
- **Boots the full app** from the private `web-pet` monorepo: `docker compose up` (MinIO +
  Gotenberg) → `go build` + start API → start web on port 3000 → wait on `/api/health` and
  `/` → `npx playwright test` → dump logs, kill ports, `docker compose down -v`, generate +
  upload Allure report.

**[`webpet-e2e-local.yml`](../.github/workflows/webpet-e2e-local.yml) and
[`e2e.yml`](../.github/workflows/e2e.yml) with `suite: webpet`** — the migrated web-pet
suite (see §9). The local one is the same self-hosted Windows stack boot as `e2e-local.yml`
plus the DelLlano seed, and is **manual dispatch only**; the dev one is `e2e.yml`'s webpet mode,
running against app.ptdev.xyz as the second half of the daily dry run (below) and report-only.
Both export `WEBPET=1` job-wide to materialize
the opt-in projects, and both gate the run behind `typecheck`, `webpet:ids:check` and
`webpet:runner:check` before a browser starts — those catch the failure modes that report
green (a dropped test, an orphaned id, a leaked journey tag).

**The daily dry run** is `e2e.yml`'s cron (`28 10 * * *`, ~4:00 PM IST), which runs both suites from
one workflow via a serialised matrix:

```
3:58 PM  suite=journey  →  its Slack report
              ↓  (max-parallel: 1)
         suite=webpet   →  its Slack report
```

Each keeps its own tests, artifacts, Allure report and Slack message — nothing is merged. Four
properties hold it together:

1. `max-parallel: 1` — the suites must not overlap. Both hit the same dev data and the webpet suite
   mutates it, so concurrent legs would race.
2. `fail-fast: false` — a red journey leg must not cancel WebPet before it starts. This is what the
   old orchestrator's `if: always()` did.
3. The `schedule:` block lives on the **default branch**, because GitHub fires cron only from there —
   a cron block on `dry-run` is accepted and then never triggers. A scheduled run therefore tests
   `main`, and `dry-run` is kept in step with it (no `ref:` pin, no `BRANCH_OVERRIDE`).
4. Expect the fire time to slip — GitHub queues scheduled runs best-effort and has been 20+ minutes
   late here. Hence 3:58 rather than 4:00, avoiding the contended `:00`/`:30`. This is also why
   nothing in the reporting states a fixed clock time.

On demand, one suite at a time:

```
gh workflow run e2e.yml -f suite=journey
gh workflow run e2e.yml -f suite=webpet -f batch=01
```

**Reporting** ([`src/reporting/`](../src/reporting/)) runs *inside* Playwright's `onEnd` — no
separate CI send step. All three channels are self-gating (do nothing unless their `SEND_*` flag
+ endpoint are set, and never fail the run):
- [`slackReporter.ts`](../src/reporting/deliver/slackReporter.ts) — **the primary channel**. One
  report per suite: status, environment, execution, branch, run number, the five counts, the top
  five failing modules (`+N more...` for the rest) and buttons for the Allure report, the
  workflow run and the artifacts. Layout in
  [`slack/blocks.ts`](../src/reporting/deliver/slack/blocks.ts), transport in
  [`slack/slackApi.ts`](../src/reporting/deliver/slack/slackApi.ts) — webhook (summary only) or
  `chat.postMessage` + an Allure upload in the thread when `SLACK_BOT_TOKEN` +
  `SLACK_CHANNEL_ID` are set, since webhooks cannot carry files.
  [`slack/gate.ts`](../src/reporting/deliver/slack/gate.ts) makes it **CI-only**: `SEND_SLACK`,
  plus `GITHUB_ACTIONS=true`, plus the event being in `SLACK_NOTIFY_EVENTS` (default
  `schedule`). So `npm test`, `--debug`, `--ui`, a manual `workflow_dispatch` and a
  `repository_dispatch` all post nothing. `SLACK_DRY_RUN=1` logs the payload instead of sending
  it.
- [`emailReporter.ts`](../src/reporting/deliver/emailReporter.ts) — **deprecated**. Still works
  (HTML email via nodemailer + the lean Allure report), but `SEND_EMAIL` is pinned to `no` in
  every workflow and nothing new lands here.
- [`dashboard.ts`](../src/reporting/deliver/dashboard.ts) — POSTs run summary to ELK.
- [`runSummary.ts`](../src/reporting/summary/runSummary.ts) — shared collector that builds the
  render-agnostic summary all three consume.
- [`scripts/notify/slack-reminder.ts`](../scripts/notify/slack-reminder.ts) — the pre-run
  reminder, the one Slack message not sent by a reporter. Run it with
  `npm run notify:reminder -- --dry-run` to see the payload.

**npm scripts** ([`package.json`](../package.json)) all go through `run-playwright.js <env>`:
`test` / `test:dev` / `test:qa`, plus `test:headed`, `test:ui`, `test:debug`, `test:smoke`
(`--grep=@Smoke`), `test:api` (`--project=api`), `test:workflow`, `test:last-failed`,
`report:allure`, `docker:build`/`docker:run`. The web-pet suite has its own set —
`test:webpet`, `test:webpet:dev`, `test:webpet:list`, and the `webpet:*` data/verification
scripts (§9).

---

## 9. The migrated web-pet suite (`tests/webpet/`)

The PET Tiger app repo's own Playwright suite — **406 tests in 56 spec files** — lifted from
`web-pet/apps/web/e2e` and converted onto these conventions. It is deliberately parallel to
everything above rather than folded into it: its own fixture, page-object tree, runner file,
Playwright projects, npm scripts and CI workflows. Nothing in §§2–8 applies to it unchanged.

```
tests/webpet/*.spec.ts            → 406 tests, no selectors of their own
   │  imports test/expect from
   ▼
src/fixtures/webpet.fixture.ts    → NOT base.fixture (see §1) — same building blocks,
   │                                 web-pet row source, gate as an { auto: true } fixture
   ▼
src/pages/webpet/<area>/          → 47 screens over WebpetFormPage / WebpetListPage
src/components/webpet/            → 9 components (ParentPicker, FormFooter, DataGrid, …)
src/data/webpet/                  → runner CSV + JSON mirror, case tables, generated id maps
```

Three things are worth knowing before touching it:

1. **The gate is an `{ auto: true }` fixture, never a module-level `beforeEach`.** Measured:
   a module-scope hook in a fixture module attaches only to the spec file loading at import
   time, so it fires for the first spec file each worker loads and no others. (This is a live
   bug in `base.fixture.ts` for the journey suites — real, but its own fix.)
2. **Ids never renumber.** `WP-0001`…`WP-0406`, one per test, annotated on every one. The 78
   tests generated from a case table take their id from a generated map in
   `src/data/webpet/ids/`, keyed on a business field and compile-checked — an unchecked index
   would yield `undefined`, the annotation would be empty, and the gate would silently skip.
3. **No tag may be a prefix of another.** `--grep` is a plain substring regex over title path
   *and* tags, so `@wp-job` also selected `@wp-job-group`. `webpet:ids:check` rejects prefix
   collisions; it has caught five.

```bash
npm run test:webpet                  # whole suite, localhost stack required
npm run test:webpet:list             # collection check — 407 tests / 57 files
npm run webpet:runner:sync           # rediscover + merge rows (id-first) + write CSV & JSON
npm run webpet:runner:check          # drift alarm — blocking in CI
npm run webpet:ids:check             # static gate, no stack, runs in a second
npm run webpet:baseline / webpet:diff  # per-test baseline capture + regression diff
```

Full documentation: [tests/webpet/README.md](../tests/webpet/README.md) and
[src/pages/webpet/README.md](../src/pages/webpet/README.md).
```
