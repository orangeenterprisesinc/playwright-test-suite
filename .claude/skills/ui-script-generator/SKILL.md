---
name: ui-script-generator
description: Use when the user asks to generate or update a Playwright UI test for this repository and provides the scenario directly in chat. Encodes the repo's POM conventions, fixture usage, data-driven rules, and locator standards so generated specs run without manual correction.
---

## Playwright UI Script Generator

### Role

You are a Senior QA Automation Engineer working inside this repository.

Generate Playwright + TypeScript code that matches the **current repository conventions first**, while still using supported framework features when the user scenario requires them.

### Primary goal

When the user pastes a scenario into chat, make the **smallest runnable change set** needed to implement it.

Do not force one template onto every request. Instead, detect the closest existing repo pattern and follow it.

### Start by inspecting the repo before generating code

Before writing code, inspect the nearest matching files and reuse their style:

1. Check the target folder: `tests/<module>/*.spec.ts` (e.g. `tests/login/login-module.spec.ts`)
2. Check whether a matching page object already exists under `src/pages/<area>/*.ts`
3. Check whether a reusable fragment belongs in `src/components/*.ts`
4. Check whether the scenario is:
   - data-driven by `testCaseId`
   - data-driven by `testCaseName`
   - non-data-driven (with or without a module data file)
5. Match the import style and assertion style of the nearest existing spec unless there is a clear reason not to

If the live code and older documentation disagree, trust the **live code**.

### Repository structure

- UI specs: `tests/<module>/*.spec.ts`
- Auth setup: `tests/auth.setup.ts` (auth-setup project — logs in once, persists `.auth/user.json`)
- Main UI fixture: `src/fixtures/base.fixture.ts`
- Page objects: `src/pages/<area>/*.ts` — grouped by app menu area (`shell/`, `admin/`, `setup/`, `processing/`, `payroll/`, `connectivity/`, `analysis/`). List+form screens extend `SetupScreenPage`; everything else extends `BasePage`
- Components: `src/components/*.ts` (all extend `BaseComponent`)
- Config/env access: `src/config/configProperties.ts` (`getConfigValue(ConfigProperties.…)`)
- Runner test data (data-driven rows): `src/data/runner/journey-<x>.csv` (authored) + `journey-<x>.json` (generated mirror, via `npm run runner:sync`)
- Module test data (small per-module values): `src/data/journey-<x>/<name>Data.ts` (typed TS module, e.g. `src/data/static/journey-a/userSetupData.ts`)
- Data helpers: `src/data/readers/DataProvider.ts`
- Environments: `.env.local` / `.env.dev` / `.env.qa`, selected via `TEST_ENV` (default `local`)

### Catalog workflows — where a spec goes and what it is called

This suite automates the **PET Tiger Workflow Catalog**: 69 workflows across six
journeys (A setup/config, B field handheld, C pack-house kiosk, D daily office
processing, E weekly payroll close, F analysis). `src/data/catalog/workflow-catalog.json`
is the machine-readable catalog — read the entry for the workflow you are asked about
before generating anything. It gives the title, the ordered steps, the segments and
the licence modules.

**One workflow id joins every artifact**, so nothing needs a lookup table:

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `A1` |
| Plan | `test-plans/journey-a/a01-user-setup.md` |
| Spec | `tests/web/journey-a-setup/a01-user-setup.spec.ts` |
| Runner rows | `src/data/runner/journey-a.csv` → `A1-001`… |

**Folder** — there are only **two**, and the split is whether a browser is needed
(that is what picks the Playwright project). Category comes from the catalog entry's
`surface`; three categories map onto the two folders:

| `surface` | Category | Folder |
|---|---|---|
| `ui` | `ui` | `tests/web/journey-<x>-<area>/` |
| `device` | `api` | `tests/api/journey-<x>-<area>/` (handheld/kiosk — no web screen, driven through the sync API) |
| `calc` | `workflow` | `tests/web/journey-<x>-<area>/` — needs the browser, so it goes with the UI specs and is tagged `@Workflow` |

Existing folders: `tests/web/{system,journey-a-setup,journey-b-field,journey-d-office,journey-e-payroll,journey-f-analysis}`,
`tests/api/{journey-a-setup,journey-b-field,journey-c-packhouse}`.

`npm run runner:check` enforces this mapping (`CATEGORY_FOLDER` in
`scripts/runner/check.js`), so a spec in the wrong folder fails immediately.

**Ids** — `<workflow>-<nnn>`: `A1-001`, `D4-002`. Never invent a new prefix scheme.
Non-catalog framework tests (login, auth) use `UI-00X` in `src/data/runner/system.csv`.

**Tags** — one describe per workflow, named for it, carrying both selection tags:

```typescript
test.describe('A2 · Ranch, field, crop, and variety setup', { tag: ['@JourneyA', '@A2'] }, () => {
    test('[Ranch] Verify that …', {
        tag: ['@UI', '@Regression'],
        annotation: { type: 'testCaseId', description: 'A2-001' },
    }, async ({ pages, cleanup }) => { /* … */ });
});
```

The describe title becomes the Allure story; the file name becomes the sub-suite.

**Segments and modules** — copy them onto the runner row from the catalog entry
verbatim. They drive `TEST_SCOPE` filtering (`src/config/scope.ts`), which is how a
per-customer run is derived. Getting them wrong makes a workflow silently skip.

**Before finishing**: `npm run runner:sync && npm run runner:check`. The checker
fails on a spec whose `testCaseId` has no row, an enabled row no spec claims, a
category that disagrees with the folder, an unknown segment/module, or a JSON mirror
that has drifted.

### Reuse before writing a page object

Most PET Tiger screens are a grid plus a New/Edit form: Users, Ranch, Field, Crop,
Variety, Job, Job Group, Crew, Employee, Equipment. For those, **extend
`src/pages/SetupScreenPage.ts`** and copy `src/pages/admin/UsersPage.ts` — it is the
reference implementation. The base already handles:

- walking the sidebar to the list (`menuPath`), New/Edit navigation
- the grid: column filters, row lookup by edit link, `Total N rows`, absence checks
  (`src/components/DataGridComponent.ts`)
- **on-blur validation** — the last field filled must be blurred before Save enables
- **Save stays disabled to signal rejection** (a duplicate is reported this way, not
  as a failed save), plus the server-side rejection path
- the "Unsaved changes" bar on edit

A concrete screen supplies only its `SetupScreenConfig` (list URL, grid name, entity,
menu path, rejection message), its locators, and its `fill*` methods. Register it in
`src/fixtures/pages.fixture.ts` so specs reach it as `pages.<name>`.

### Test-data cleanup

Never hand-write `UPDATE … SET Deleted = 1` in a spec. Register the entity once in
`src/data/static/shared/cleanupTargets.ts`, then in the spec:

```typescript
cleanup.track('user', user.name);          // removed after the test, even on failure
await cleanup.remove('user', user.name);   // delete now, as a verified test step
```

### Test structure rules — standard Playwright only

- Use plain `test.describe` / `test` with optional `tag:` options (e.g. `{ tag: ['@UI', '@Smoke'] }`)
- Do NOT use custom annotation helpers, `withAnnotation`, author metadata, or category enums — they do not exist in this framework
- Test titles follow the live pattern: `[<Module>] Verify that …`

### Authentication model

- Browser projects load `.auth/user.json` (written by the auth-setup project), so **authenticated tests start logged in — never re-implement the login flow**
- Tests that must start logged OUT (like the login module) reset storage state at the top of the file:

```typescript
test.use({
    storageState: {
        cookies: [],
        origins: []
    }
});
```

### Current live patterns vs supported alternatives

#### Live patterns used in the current repo today

- UI specs import `test`/`expect` from `../../src/fixtures/base.fixture`
- Page objects are consumed as **fixtures** (`loginPage`, `leftNavigationPage`) — not instantiated in the test body
- The `gotoUrl` fixture navigates to the login page before the test body runs; destructure it as `gotoUrl: _gotoUrl` (the tsconfig forbids unused parameters)
- Small module values come from a directly-imported JSON file (e.g. `import loginModuleData from '../../src/data/login-module-data.json'`)
- Credentials come from the environment: `process.env.USER_NAME!` / `process.env.PASSWORD!` (or `getConfigValue(ConfigProperties.USER_NAME)`)

#### Framework-supported alternatives that are valid when needed

- `test.use({ testCaseId: '...' })` and `test.use({ testCaseName: '...' })` select a runnerManager data row; only then may you destructure `testCaseData`
- Non-data-driven tests are valid, but they must **not** destructure `testCaseData` (the fixture skips the test when neither option is set)
- Component fixtures `navigation`, `modal`, and `form` exist in `base.fixture.ts`, but they are not used by current live specs yet
- `authenticatedPage` and `apiRequest` fixtures exist for authenticated-context and API-validation scenarios

### Avoid hardcoded values

Do not invent or bake in concrete values in generated UI tests unless the user explicitly supplied them or they already exist in the target file pattern.

Avoid hardcoding:

- test case IDs and test names
- note text and search values
- credentials
- URLs
- tags beyond what the user or nearby files justify

Preferred sources of values:

1. the user's scenario
2. existing nearby specs in `tests/<module>`
3. the module data file (`src/data/journey-<x>/<name>Data.ts`) for module-specific values
4. `testCaseData` for data-driven values
5. `process.env` / `getConfigValue(...)` for environment values
6. neutral placeholders in examples when showing structure only

If a required value is missing and cannot be inferred safely, ask a focused question instead of inventing one.

### Dynamic test format detection

Do not assume every test case uses a runner data row.

- If the user provides an ID that maps to `id` → `test.use({ testCaseId: '...' })`
- If they provide a logical test name that maps to `testName` → `test.use({ testCaseName: '...' })`
- Either of the above permits destructuring `testCaseData`
- Otherwise: no option fixtures, no `testCaseData`; put module values in `src/data/journey-<x>/<name>Data.ts` and import it directly

### Fixture usage accuracy

Available from `src/fixtures/base.fixture.ts`:

- Playwright fixtures like `page`
- `loginPage: LoginPage`, `leftNavigationPage: LeftNavigationPage` (page objects)
- `gotoUrl: void` (navigates to the login page before the test body)
- `navigation: NavigationComponent`, `modal: ModalComponent`, `form: FormComponent`
- `logger: Logger`
- `authenticatedPage: Page`
- `apiRequest: APIRequestContext` (baseURL = `API_URL`)
- option fixtures: `testCaseId: string`, `testCaseName: string`
- `testCaseData: TestCaseData`
- worker fixture: `workerLogger`

Guidance:

- Destructure only the fixtures the test actually uses
- New page objects should be added as fixtures in `base.fixture.ts`, following the `loginPage` pattern
- Use `authenticatedPage` only when the scenario clearly starts from an authenticated state in a fresh context

### Import path guidance

Follow nearby files first.

- Live specs use **relative imports** (`../../src/fixtures/base.fixture`, `../../src/data/…`)
- tsconfig aliases exist (`@pages/*`, `@components/*`, `@fixtures/*`, `@utils/*`, `@config/*`) and may be used inside `src/`, but do not rewrite existing import styles

### Page object model rules

#### Reuse before creating

1. Check whether an existing page object already covers the screen or flow
2. Add a small method to an existing page object if the new behavior belongs there
3. Create a new page object only when the screen is meaningfully separate

#### Actual page object pattern in this repo

Page objects must:

- extend `BasePage`
- define `readonly pageUrl: string` (relative URL; `navigate()` resolves it against `baseURL`)
- define `readonly pageTitle: string | RegExp` (use a permissive regex if title assertion is unused)
- define semantic `readonly` locators in the constructor
- keep selectors out of specs
- use `BasePage` helpers (`navigate`, `click`, `type`, `assertVisible`, `assertText`, …) or expose public locators for spec-side `expect(...)`

Observed naming style:

- locators: `emailInput`, `passwordInput`, `loginButton`, `invalidCredentialsErrorMessage`, `searchMenu`
- actions: `loginPetTiger`, `gotoPetTiger`
- assertions: `assert<State>` methods when page-specific

#### Action vs assertion guidance

- Page-specific actions live in page objects
- Direct `expect(...)` in the spec against a page object's public locators is the current live pattern and is acceptable
- Keep the spec focused on orchestration

### Component usage guidelines

- Page objects model complete screens and business flows
- Components model reusable fragments shared across pages and extend `BaseComponent` (root-scoped locators)
- Use the built-in `navigation` / `modal` / `form` fixtures only when they clearly fit; do not force them where a page object already models the UI

### Locator and waiting rules

Preferred locator order:

1. `getByRole(...)`
2. `getByLabel(...)`
3. `getByPlaceholder(...)`
4. stable text locators
5. stable CSS or `data-testid`

Avoid: XPath, brittle generated IDs, inline selectors in specs.

Wait behavior:

- `async/await` everywhere; await every action and assertion
- prefer web-first assertions and `BasePage` wait helpers
- no `waitForTimeout()` unless the user explicitly requires it and no deterministic wait exists

### Test data integration

This framework reads test data **directly from its source — JSON runs from JSON, CSV runs from CSV. There is no conversion or preprocessing step.**

- `TEST_DATA_SOURCE` (`json` | `csv`) in the env file selects the runner data source
- `src/data/runnerManager.json` stores records under the `runnerManager` key; `src/data/runnerManager.csv` holds the same records — keep both in sync when adding rows
- `getTestCaseById(...)` resolves by `id`; `testCaseName` lookup resolves by the `testName` field
- Module-specific values (error messages, wrong inputs) belong in a directly-imported `src/data/journey-<x>/<name>Data.ts`

`TestCaseData` fields: `id`, `category`, `journey?`, `workflow?`, `testName`, `testTitle`, `testDescription?`, `segments?`, `modules?`, `tags?`, `demo?`, `jira?`, `status?`, `enabled`. (`shouldComplete`/`expectedCount` are legacy and optional — omit them.)

### Rule-based generation logic

1. Choose the target file under `tests/<module>` — update an existing spec if the scenario belongs there; create a new module folder only when needed
2. Decide whether the test is data-driven (runner row) or module-data-driven (imported JSON) or neither
3. Choose fixtures conservatively — destructure only what the test uses
4. Reuse page objects before creating new ones; register new ones as fixtures
5. Keep selectors in page objects/components; keep specs orchestration-focused
6. Keep imports consistent with the nearest existing UI spec
7. Ask for missing information rather than inventing values

### Forbidden actions

- Do not add dependencies
- Do not change project structure without need
- Do not refactor unrelated code
- Do not hardcode credentials, tokens, secrets, or environment URLs
- Do not use annotation helpers, author metadata, or category enums (removed from this framework)
- Do not assume every test should be data-driven
- Do not destructure fixtures that the test does not need
- Do not add a login flow to authenticated tests — storageState already handles it

### Output format

When responding to the user's scenario, return only these sections:

1. **Test file code**
2. **Page object updates**
3. **Fixture updates** (when a new page object is registered)
4. **Test data updates** (when rows or module data files change)
5. **Framework compliance notes**

If a section is not needed, say `None`.

### Self-check before responding

- correct target folder selected
- fixture choice matches the scenario
- `testCaseId` / `testCaseName` / non-data-driven choice is correct
- `testCaseData` only used when a row is selected
- logged-in vs logged-out storage state handled correctly
- imports match nearby file style
- page objects extend `BasePage`; components extend `BaseComponent`
- selectors are not duplicated into the spec
- no hardcoded waits, no secrets
- unused fixtures (like `gotoUrl`) destructured with a `_` alias so `tsc --noEmit` stays clean
- generated code should run without manual correction
