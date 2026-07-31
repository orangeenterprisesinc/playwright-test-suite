---
name: api-script-generator
description: Use when the user asks to generate or update a Playwright API test (an API-only spec under tests/api/) for this repository and provides the scenario directly in chat. Encodes the repo's api.fixture usage, ApiHelper/auth conventions, data-driven rules, and response-assertion standards so generated specs run without manual correction.
---

## Playwright API Script Generator

Generate API-only Playwright + TypeScript specs (no browser) that match the **current repository conventions first**, while using supported framework features when the scenario requires them. This is the API sibling of `/ui-script-generator` — for UI browser journeys use that skill; for UI+API hybrids use `/workflow-script-generator`.

### Role

You are a Senior QA Automation Engineer working inside this repository.

### Primary goal

When the user pastes a scenario into chat, make the **smallest runnable change set** needed to implement it as an API-only spec. Detect the closest existing repo pattern and follow it rather than forcing one template.

### Start by inspecting the repo before generating code

1. Check the target folder `tests/api/*.spec.ts` and copy the style of the nearest existing API spec (if one exists yet)
2. Read `src/fixtures/api.fixture.ts` to confirm the current `ApiHelper` surface and fixture names
3. Check whether the scenario is data-driven by `testCaseId` / `testCaseName`, or non-data-driven
4. Confirm the auth model the endpoint needs (see **Authentication model** below)

If the live code and older documentation disagree, trust the **live code**.

### Catalog workflows — folder, id and tags

This suite automates the PET Tiger Workflow Catalog (69 workflows, journeys A–F).
Read the workflow's entry in `src/data/catalog/workflow-catalog.json` before
generating anything, and follow the conventions in the `ui-script-generator` skill's
"Catalog workflows" section — they apply to every category:

- **Folder**: `tests/{web|api}/journey-<x>-<area>/<wf>-<slug>.spec.ts`. Two folders, split
  on whether a browser is needed. The category comes from the catalog entry's `surface`:
  `ui` → `tests/web/`, `calc` → `tests/web/` (tagged `@Workflow`), `device` → `tests/api/`.
  API specs are the `tests/api/` case.
- **Ids**: `<workflow>-<nnn>` (`A1-001`, `D4-002`), in `src/data/runner/journey-<x>.csv`.
  Copy `segments` and `modules` onto the row from the catalog entry — they drive
  `TEST_SCOPE` filtering.
- **Tags**: one describe per workflow, named for it, tagged `['@Journey<X>', '@<WF>']`.
- **Plan first**: `test-plans/journey-<x>/<wf>-<slug>.md` (copy `test-plans/_template.md`).
- **Finish with**: `npm run runner:sync && npm run runner:check`.

### Repository structure

- API specs: `tests/api/*.spec.ts` (import from `src/fixtures/api.fixture`)
- API fixture: `src/fixtures/api.fixture.ts` (`api`, `apiContext`, `authenticatedApi`)
- Auth layer: `src/auth/*` — `authContextFactory.ts` (`buildAuthContextOptions()`), `requestBuilder.ts` (`executeWithAuthRetry`, `HttpMethod`, `RequestOptions`), `authorizationManager.ts` (token cache)
- Config/env access: `src/config/configProperties.ts` (`getConfigValue(ConfigProperties.…)`)
- Runner test data (data-driven rows): `src/data/runner/journey-<x>.csv` (authored) + `journey-<x>.json` (generated mirror, via `npm run runner:sync`)
- Module test data (small per-module values): `src/data/journey-<x>/<name>Data.ts`
- Environments: `.env.local` / `.env.dev` / `.env.qa`, selected via `TEST_ENV` (default `local`); `API_URL` is the API base

### Test structure rules — standard Playwright only

- Import `{ test, expect }` from `../../src/fixtures/api.fixture` (relative imports, like live specs)
- Use plain `test.describe` / `test` with `tag:` options; **API specs are tagged `@API`** (add `@Smoke` for critical-path)
- Do NOT use custom annotation helpers, `withAnnotation`, author metadata, or category enums — they do not exist in this framework
- Test titles follow the live pattern: `[<Module>] Verify that …`
- No browser: never destructure `page` or a page-object fixture in an API spec

### The api fixture surface

From `src/fixtures/api.fixture.ts` (verify against the live file before relying on a method):

- `api: ApiHelper` — typed helper bound to an unauthenticated context. Methods return `{ status, data }`:
  - `get<T>(url, options?)`, `post`, `put`, `patch`, `delete` — unauthenticated calls
  - `authGet<T>(url, options?)`, `authPost<T>(url, options?)` — routed through the configured `AUTH_TYPE` with auto-retry once on 401/403
  - `assertStatus(response, expected)`, `assertSuccess(response)`
- `apiContext: APIRequestContext` — raw, unauthenticated request context scoped to `API_URL`
- `authenticatedApi: APIRequestContext` — request context pre-configured with the current `AUTH_TYPE` strategy

`RequestOptions` is `{ data?, params?, headers? }`. `url` is **relative to `API_URL`** — never include the host, never a leading `/` that would escape the base path.

Canonical shape:

```typescript
import { expect, test } from '../../src/fixtures/api.fixture';

test.describe('Users API', { tag: '@API' }, () => {
    test('[Users API] Verify that GET /users returns 200 and a user list', async ({ api }) => {
        const response = await api.authGet<Array<{ id: number }>>('users');
        api.assertStatus(response, 200);
        expect(Array.isArray(response.data)).toBeTruthy();
    });
});
```

### Authentication model

- API auth is **separate from the browser (Keycloak) login** — there is no `.auth/user.json` and no `auth-setup` dependency for API specs
- Auth is driven by `AUTH_TYPE` (`oauth2` | `basic` | `apikey` | `none`, default `none`) plus its supporting env keys (`ACCESS_TOKEN_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `AUTH_USERNAME`, `AUTH_PASSWORD`, `API_KEY`, `API_KEY_HEADER`) in `configProperties.ts`
- Use `api.authGet` / `api.authPost` (or `authenticatedApi`) for endpoints that require auth; use the plain `api.get`/`post`/… for public endpoints
- For methods beyond authGet/authPost (authenticated PUT/PATCH/DELETE), call `executeWithAuthRetry(apiContext, method, url, options, testInfo)` from `src/auth/requestBuilder.ts` directly

### Response assertions

- Prefer `api.assertStatus(response, expected)` / `api.assertSuccess(response)` for status checks
- For body assertions on the `ApiHelper` result, assert against `response.data` with web-first `expect(...)`
- To confirm a record exists somewhere in a JSON body (including nested/paginated shapes), assert on the parsed body with Playwright's own matchers — `expect(body).toMatchObject({...})` for a known shape, or `expect(JSON.stringify(body)).toContain(value)` when the nesting is not known. There is no bespoke body-matcher helper in this repo; a `verifyJsonKeyValues` util used to exist but no spec ever imported it and it was removed

```typescript
import { executeWithAuthRetry } from '../../src/auth/requestBuilder';

const res = await executeWithAuthRetry(apiContext, 'GET', 'users', {}, testInfo);
expect(res.status()).toBe(200);
expect(JSON.stringify(await res.json())).toContain(user.email);
```

### Avoid hardcoded values

Do not invent or bake in concrete values (endpoints, ids, payloads, credentials, tokens, base URLs) unless the user supplied them or they already exist in the target file pattern.

Preferred sources of values, in order:

1. the user's scenario
2. existing nearby specs in `tests/api`
3. the module data file (`src/data/journey-<x>/<name>Data.ts`) for module-specific values
4. `testCaseData` for data-driven values
5. `getConfigValue(...)` / `process.env` for environment and auth values
6. neutral placeholders in examples when showing structure only

Resolve entity ids **by name / lookup at runtime** — never hardcode a database id. If a required value is missing and cannot be inferred safely, ask a focused question instead of inventing one.

### Data-driven detection

Same three mutually-exclusive modes as the rest of the suite:

- ID that maps to a row `id` → `test.use({ testCaseId: 'API-00X' })`
- logical name that maps to `testName` → `test.use({ testCaseName: '...' })`
- otherwise non-data-driven; put small values in `src/data/journey-<x>/<name>Data.ts` and import directly

Only when a `testCaseId`/`testCaseName` option is set may a spec destructure `testCaseData` (from `api.fixture` too — the option fixtures are inherited). Runner rows live in `src/data/runner/journey-<x>.csv` (authored; run `npm run runner:sync` to regenerate the `.json` mirror) — keep both in sync, use `category: "api"` and an `API-00X` id, tags are pipe-delimited, and set `enabled: true`. Add a real row for the spec you generate (follow the existing `A1-*` rows in `src/data/runner/journey-a.csv` as the shape reference).

### Running

- `npm run test:api` runs the browserless `api` project (`--project=api`, no auth-setup, no browser)
- Or filter by tag across projects: `npx playwright test --grep @API`

### Forbidden actions

- Do not add dependencies
- Do not launch a browser or import `base.fixture` in an API-only spec
- Do not hardcode credentials, tokens, secrets, base URLs, or database ids
- Do not include the API host in a `url` — paths are relative to `API_URL`
- Do not use annotation helpers, author metadata, or category enums
- Do not destructure fixtures the test does not use (tsconfig fails the build on unused params; alias with `_` if an activation fixture is unavoidable)
- Do not assume every test should be data-driven

### Output format

Return only these sections (write `None` where unused):

1. **Test file code**
2. **Test data updates** (runner rows or module data files)
3. **Fixture / helper updates** (only if a genuinely missing helper is required)
4. **Framework compliance notes**

### Self-check before responding

- spec lives under `tests/api/`, imports from `api.fixture`, tagged `@API`
- correct auth path chosen (`authGet`/`authPost`/`executeWithAuthRetry` vs plain calls) for the endpoint
- `url` is relative to `API_URL`; no host, no hardcoded ids/secrets
- `testCaseId`/`testCaseName`/non-data-driven choice is correct; `testCaseData` only used when a row is selected; `npm run runner:check` passes (it proves the JSON mirror matches the CSV)
- `verifyJsonKeyValues` used with a raw `APIResponse`, not the `ApiHelper` result
- no unused destructured fixtures (`tsc --noEmit` stays clean)
- generated code runs without manual correction (`npm run typecheck`, `npx playwright test --project=api --list`)
