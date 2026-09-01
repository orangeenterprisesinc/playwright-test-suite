# Test suite layout

Two axes: **category** (what a test proves) and **journey** (which part of the PET
Tiger Workflow Catalog it covers).

There is **one journey folder, `tests/web/`**, with the journey as the folder inside.
UI specs, API-only specs and UI+API hybrids sit side by side: a spec that never
destructures `page` launches no browser, so nothing is gained by a separate folder,
and device workflows (Journey B) need API *and* UI verification in the same test.
The former `tests/api/` was retired on 2026-08-26.

```
tests/
├── auth.setup.ts                       # one-time browser login → .auth/user.json (shared)
├── web/                                # journey suite → base.fixture (or api.fixture when browserless)
│   ├── system/                         #   login and other non-catalog framework tests
│   │   └── login-module.spec.ts
│   ├── journey-a-setup/                #   A1–A14 office setup and configuration
│   │   └── a01-user-setup.spec.ts      #     the working reference spec
│   ├── journey-b-field/                #   B1–B15 field capture via the device export/import
│   │   ├── b01-crew-time-in.spec.ts    #     XML envelope → relay/import → office API + UI
│   │   ├── b01-relay-roundtrip.spec.ts #     browserless relay check (api.fixture)
│   │   └── b02-crew-move.spec.ts
│   ├── journey-d-office/               #   D1–D8 processing, D9–D10 transfer-time calcs
│   ├── journey-e-payroll/              #   E8–E11 payroll close, E1–E7/E12–E13 calcs
│   └── journey-f-analysis/             #   F1–F7 analysis and monitoring
└── webpet/                             # migrated web-pet suite — SEPARATE, see below
```

## Which category?

The category stays **three-valued** because it mirrors the catalog's `surface` field
and Allure's `epic` label is derived from it. Take it from the workflow's `surface` in
`src/data/catalog/workflow-catalog.json`:

| `surface` | Category | Why |
|---|---|---|
| `ui` | `ui` | A browser screen drives it |
| `device` | `api` (or `workflow` when the spec also verifies in the UI) | Handheld or kiosk capture — the test builds the device's export and drives the import |
| `calc` | `workflow` | A calculation verified against data — acts in the UI, verifies via API |

`npm run runner:check` enforces that every journey category lives under `tests/web/`
(`CATEGORY_FOLDER` in `scripts/runner/check.js`). Tag hybrids `@Workflow` —
`npm run test:workflow` greps for it.

## Naming

`<wf>-<slug>.spec.ts` — `a01-user-setup.spec.ts`, `d04-transfer-to-job-card.spec.ts`.
One spec file per catalog workflow; the file name becomes the Allure sub-suite, so it
should read as the workflow.

## The describe and the tags

One describe per workflow, named for the catalog entry, carrying both selection tags:

```ts
test.describe('A2 · Ranch, field, crop, and variety setup', { tag: ['@JourneyA', '@A2'] }, () => {
    test('[Ranch] Verify that …', {
        tag: ['@UI', '@Regression'],
        annotation: { type: 'testCaseId', description: 'A2-001' },
    }, async ({ pages, cleanup }) => { /* … */ });
});
```

```bash
npx playwright test --grep @JourneyA                # a whole journey
npx playwright test --grep @A2                      # one workflow
npx playwright test --grep @Smoke                    # a severity level
TEST_SCOPE=anthony-vineyards npx playwright test     # one customer's segments + modules
```

Allure derives `epic` = category, `feature` = journey folder, `sub-suite` = file,
`story` = the describe — so the report reads
`ui ▸ journey-a-setup ▸ a01-user-setup ▸ A1 · License, serial number, and user setup`.

## Imports

Use the path aliases, not deep relative paths — specs sit three folders down:

| Alias | Resolves to |
|---|---|
| `@fixtures/…` | `src/fixtures/` |
| `@pages/…` | `src/pages/` |
| `@components/…` | `src/components/` |
| `@data/…` | `src/data/` — `runner/` rows, `static/` value bags, `generated/` factories, `readers/` |
| `@utils/…` | `src/utils/` — `logger.ts` + `db/` only |
| `@reporting/…` | `src/reporting/` — `summary/`, `generate/`, `deliver/`, `recipients/` |
| `@config/…` | `src/config/` — env loading + `configProperties` |
| `@core/…` | `src/core/` |
| `@apptypes` | `src/types/index.ts` |

---

## 1. API-only — also `tests/web/`

Pure API tests import `api.fixture`, which creates its own request context and
applies the configured `AUTH_TYPE`. They run under the same `chromium` project as
everything else; because they never destructure `page`, **no browser is launched**.
Need the office session (cookie + CSRF)? Use `base.fixture`'s `sessionApi` instead —
that is what the Journey B device specs do.

```ts
import { test, expect } from '@fixtures/api.fixture';

test('GET returns 200', async ({ api }) => {
  const res = await api.authGet('guarantor/28114/notes?page=1&pageSize=1');
  api.assertStatus(res, 200);
});
```

- `api.get / post / put / patch / delete` — unauthenticated calls.
- `api.authGet / api.authPost` — routed through `AUTH_TYPE` (oauth2 / basic / apikey)
  with **auto-retry on 401/403**.
- Base URL comes from `API_URL`; paths are relative to it.
- Tag with `@API`.

## 2. Browser-driven — `tests/web/`

Everything that opens a browser lives here: UI-only specs **and** the UI+API(+DB)
hybrids. Both import `base.fixture` and run under the `chromium` project, so there is no
runtime reason to separate them — see §3 for the hybrid pattern and its `@Workflow` tag.

Journeys through Page Objects. Tests start **already authenticated** from
`.auth/user.json` (written by the `auth-setup` project), so never re-implement login.
A test that must start logged out resets storage state at the top of the file — see
`web/system/login-module.spec.ts`.

```ts
import { test, expect } from '@fixtures/base.fixture';

test('reaches the Users list', async ({ pages }) => {
  await pages.users.gotoUsersList();
  await expect(pages.users.newButton).toBeVisible();
});
```

- Reach screens through the `pages` fixture — `pages.users`, `pages.leftNav`. Each is
  built on first use, so a test pays only for the screens it touches.
- A list + New/Edit form screen extends
  [`SetupScreenPage`](../src/pages/SetupScreenPage.ts); copy
  [`UsersPage`](../src/pages/admin/UsersPage.ts). Anything else extends `BasePage`.
- Locator priority: CSS id → `getByRole` → `data-testid` → `getByText`. Don't inline
  selectors in a spec.
- Records a test creates: `cleanup.track('<entity>', name)` — never hand-write SQL.
- Tag with `@UI` (and `@Smoke` for critical-path).

## 3. Workflow hybrids — also `tests/web/`, tagged `@Workflow`

UI + API hybrid: perform an action in the UI, then verify it via the API in the same
test. **Not a separate folder** — it needs the browser and `auth-setup` exactly like a
UI spec, so it sits in `tests/web/<journey>/` and is distinguished by the `@Workflow`
tag plus `category: workflow` on its runner row. Imports `base.fixture` (which also
provides `apiRequest`).

```ts
import { test, expect } from '@fixtures/base.fixture';
import { executeWithAuthRetry } from '@utils/../auth/requestBuilder';

test('create in UI, verify via API', async ({ apiRequest, pages }, testInfo) => {
  // …UI steps…
  const res = await executeWithAuthRetry(apiRequest, 'GET', 'guarantor/28114/notes', {}, testInfo);
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ accountNote: 'x' });
});
```

- Resolve entity ids **by name at runtime** — never hardcode ids.
- Tag with `@Workflow`.

---

## Not a category: `tests/webpet/`

The migrated web-pet suite — 406 tests in 56 spec files lifted from the PET Tiger
app repo and converted onto this framework's conventions. It is **not a fourth
category and none of the rules above apply to it.** Everything about it is
parallel: its own fixture, its own page-object tree, its own runner file, its own
Playwright projects, its own npm scripts and its own CI workflows.

| | journey suites | `tests/webpet/` |
|---|---|---|
| fixture | `@fixtures/base.fixture` / `api.fixture` | `@fixtures/webpet.fixture` |
| page objects | `src/pages/` | `src/pages/webpet/` |
| runner rows | `src/data/runner/` | `src/data/webpet/webpetRunnerManager.csv` |
| ids | `A1-001` | `WP-0001` |
| tags | `@JourneyA`, `@UI`, `@Smoke` | `@WebPet`, `@wp-*`, `@WPBatchNN` |
| projects | `auth-setup` → `chromium` | `webpet-setup` → `webpet` (opt-in) |
| run | `npx playwright test` | `npm run test:webpet` |

The separation is enforced, not conventional:

- `chromium` sets `testIgnore: ['**/tests/webpet/**']`, and the webpet projects
  materialize only under `WEBPET=1` or `--project=webpet`. A bare
  `npx playwright test` collects 11 tests and none of them are web-pet's.
- **A web-pet spec must never import `base.fixture`.** Its gate resolves ids
  through `DataProvider`, a process-wide singleton bound to `src/data/runner/`, so
  every `WP-####` would hit "has no runner row" and all 406 tests would skip while
  the run reported green. `webpet:ids:check` fails the build on that import.
- Tag namespaces are disjoint (`@Smoke` cannot match `@wp-smoke`), so
  `npm run test:smoke` never reaches into it.

Start at [tests/webpet/README.md](webpet/README.md); the page-object rules are in
[src/pages/webpet/README.md](../src/pages/webpet/README.md).

---

## Adding a spec

See [`test-plans/README.md`](../specs/README.md) — plan first, then runner rows, then the
spec. Finish with `npm run runner:sync && npm run runner:check`; the checker fails if
a spec and its runner row disagree, so the two cannot drift.
