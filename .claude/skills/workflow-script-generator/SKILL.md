---
name: workflow-script-generator
description: Use when the user asks to generate or update a Playwright workflow test (a UI + API hybrid spec under tests/workflow/ that performs an action in the UI and verifies it via the API) for this repository and provides the scenario directly in chat. Encodes the repo's base.fixture + apiRequest usage, page-object reuse, auth-retry/response-assertion conventions, and data-driven rules so generated specs run without manual correction.
---

## Playwright Workflow Script Generator

Generate **UI + API hybrid** specs under `tests/workflow/`: perform an action through the UI (Page Objects), then verify the resulting state via the API in the same test. This composes the two sibling skills — follow `/ui-script-generator` for the UI half and `/api-script-generator` for the API half; this skill covers how they combine.

### Role

You are a Senior QA Automation Engineer working inside this repository.

### Primary goal

When the user pastes a scenario into chat, make the **smallest runnable change set** that drives the flow through the UI and confirms the outcome via the API. Detect the closest existing repo pattern and follow it rather than forcing one template.

### What makes a spec a "workflow"

Put a spec in `tests/workflow/` only when it **does something in the UI and then verifies it through the API** (or vice-versa) in one test. If it is browser-only, it belongs in `tests/ui/` (`/ui-script-generator`); if it never opens a browser, it belongs in `tests/api/` (`/api-script-generator`).

### Start by inspecting the repo before generating code

1. Check `tests/workflow/*.spec.ts` for the nearest existing hybrid spec and copy its style
2. Check `src/pages/*.ts` for a page object that already models the UI half — reuse before creating
3. Read `src/fixtures/base.fixture.ts` to confirm the `apiRequest` fixture and the page-object fixtures available
4. Confirm the auth model the verifying endpoint needs (`AUTH_TYPE`)

If the live code and older documentation disagree, trust the **live code**.

### Repository structure

- Workflow specs: `tests/workflow/*.spec.ts` (import from `src/fixtures/base.fixture`)
- Main UI fixture: `src/fixtures/base.fixture.ts` — provides page objects as fixtures **and** `apiRequest: APIRequestContext` (baseURL = `API_URL`) for the verification half
- Page objects: `src/pages/*.ts` (all extend `BasePage`); components: `src/components/*.ts` (extend `BaseComponent`)
- Auth-retry request runner: `src/auth/requestBuilder.ts` (`executeWithAuthRetry`)
- Response assertions: `src/utils/apiResponseUtils.ts` (`verifyJsonKeyValues`)
- SQL setup/cleanup: `src/utils/db/sqlClient.ts` (`runSql`, `sqlLiteral`) — used by `tests/ui/user-setup.spec.ts` for teardown
- Config/env access: `src/enums/configProperties.ts`
- Runner data (`category: "workflow"`): `src/data/runnerManager.json` / `src/data/runnerManager.csv`; module data: `src/data/<module>-data.json`

### Authentication model

- The UI half runs authenticated: browser projects load `.auth/user.json` (from the `auth-setup` project), so **UI steps start logged in — never re-implement login**
- The API half authenticates **separately** via `AUTH_TYPE`. Do the API verification through `executeWithAuthRetry(apiRequest, method, url, options, testInfo)` so it uses the configured strategy and auto-retries once on 401/403
- Workflow specs run under the `chromium` project (they need the browser + auth-setup); they are tagged `@Workflow`

### Canonical pattern — act in UI, verify via API

```typescript
import { expect, test } from '../../src/fixtures/base.fixture';
import { executeWithAuthRetry } from '../../src/auth/requestBuilder';
import { verifyJsonKeyValues } from '../../src/utils/apiResponseUtils';

test.describe('User Setup Workflow', { tag: '@Workflow' }, () => {
    test('[User Setup] Verify that a user created in the UI is retrievable via the API', async ({ usersPage, apiRequest }, testInfo) => {
        // 1. Act — through Page Objects, never inline selectors
        const user = await createUser(usersPage /* … */);

        // 2. Verify — resolve the entity by name/lookup at runtime, never a hardcoded id
        const res = await executeWithAuthRetry(apiRequest, 'GET', 'users', {}, testInfo);
        expect(res.status()).toBe(200);
        expect(await verifyJsonKeyValues(res, { email: user.email })).toBeTruthy();
    });
});
```

Notes:

- The `testInfo` second callback arg is required for `executeWithAuthRetry` metrics — include it in the test signature
- `apiRequest` is a raw `APIRequestContext`; `url` is relative to `API_URL` (no host, no leading `/` that escapes the base)
- `verifyJsonKeyValues` takes the raw `APIResponse` returned by `executeWithAuthRetry` — this is the intended pairing

### UI half — reuse page objects

- Consume page objects as **fixtures** (`usersPage`, `loginPage`, …); never `new` them in the test body
- Keep selectors in page objects/components; keep the spec orchestration-focused
- Reuse an existing page object (or add a small method to it) before creating a new one; register any new page object as a fixture in `base.fixture.ts` following the `loginPage` pattern
- Locator priority `getByRole` → `getByLabel` → `getByPlaceholder` → stable text → stable CSS/`data-testid`; no XPath; web-first waits, no `waitForTimeout()`

### Setup / cleanup

- Prefer creating prerequisite state and cleaning up through the API when an endpoint exists; use `src/utils/db/sqlClient.ts` (`runSql`, `sqlLiteral`) for SQL teardown when the app has no delete path (as `tests/ui/user-setup.spec.ts` does for users)
- Track created entities and remove them in `test.afterEach` so runs stay idempotent

### Avoid hardcoded values

Do not invent endpoints, ids, payloads, credentials, tokens, or base URLs. Resolve entity ids **by name / lookup at runtime**. Preferred sources: the user's scenario → nearby workflow specs → `src/data/<module>-data.json` → `testCaseData` → `getConfigValue(...)`/`process.env`. Ask a focused question rather than inventing a required value.

### Data-driven detection

Same three modes as the rest of the suite: `test.use({ testCaseId: 'WF-00X' })`, `test.use({ testCaseName: '...' })`, or non-data-driven. Only with an option set may you destructure `testCaseData`. Runner rows use `category: "workflow"`, live in both `runnerManager.json` and `runnerManager.csv` (keep in sync), tags pipe-delimited, `enabled: true` for a row a real spec runs. The `WF-001..003` rows are disabled templates — replace or add a real row rather than leaving a placeholder enabled.

### Running

- `npm run test:workflow` (`--grep=@Workflow`, runs under chromium with auth-setup)
- Or `npx playwright test --grep @Workflow`

### Forbidden actions

- Do not add dependencies
- Do not re-implement the login flow in the UI half — storageState already handles it
- Do not hardcode credentials, tokens, secrets, base URLs, or database ids
- Do not inline selectors in the spec — keep them in page objects/components
- Do not include the API host in a `url` — paths are relative to `API_URL`
- Do not use annotation helpers, author metadata, or category enums
- Do not destructure fixtures the test does not use (`tsc --noEmit` fails on unused params; alias unavoidable activation fixtures with `_`)

### Output format

Return only these sections (write `None` where unused):

1. **Test file code**
2. **Page object updates**
3. **Fixture updates** (when a new page object is registered)
4. **Test data updates** (runner rows or module data files)
5. **Framework compliance notes**

### Self-check before responding

- spec lives under `tests/workflow/`, imports from `base.fixture`, tagged `@Workflow`
- it genuinely combines UI action + API verification (otherwise it belongs in `ui/` or `api/`)
- UI half uses page-object fixtures, no inline selectors, no re-implemented login
- API half uses `executeWithAuthRetry(apiRequest, …, testInfo)` and asserts with `verifyJsonKeyValues` / status checks
- entity ids resolved by name/lookup at runtime; `url` relative to `API_URL`; no secrets/ids hardcoded
- `testCaseId`/`testCaseName`/non-data-driven choice correct; `testCaseData` only when a row is selected; runnerManager JSON and CSV in sync
- created state cleaned up in `afterEach`; no unused destructured fixtures
- generated code runs without manual correction (`npm run typecheck`, `npx playwright test --grep @Workflow --list`)
