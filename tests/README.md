# Test suite layout

Tests are organised into **three categories**, each with its own folder and its
own fixture import. Put a new spec in the folder that matches what it proves.

```
tests/
├── auth.setup.ts              # one-time browser login → .auth/user.json (shared)
├── api/                       # API-only tests
│   └── *.spec.ts              #   import from  src/fixtures/api.fixture
├── ui/                        # UI end-to-end tests (browser journeys)
│   ├── login/                 #   a UI module (login) — the working reference spec
│   │   └── login-module.spec.ts
│   └── *.spec.ts              #   import from  src/fixtures/base.fixture
└── workflow/                  # UI + API hybrid (do in UI, verify via API)
    └── *.spec.ts              #   import from  src/fixtures/base.fixture
```

> There are exactly **three categories**: `api/`, `ui/`, `workflow/`. UI modules
> are grouped in sub-folders under `ui/` (e.g. `ui/login/`). The
> `login-module.spec.ts` under `ui/login/` is the working, verified reference to
> copy from. The three `example-*.spec.ts` files are **templates**
> (`test.fixme`) — replace the placeholder endpoints/steps with real PET Tiger
> ones and remove `.fixme` to activate.

---

## 1. API — `tests/api/`

Pure API tests. **No browser is launched.**

```ts
import { test, expect } from '../../src/fixtures/api.fixture';

test('GET returns 200', async ({ api }) => {
  const res = await api.authGet('guarantor/28114/notes?page=1&pageSize=1');
  api.assertStatus(res, 200);
});
```

- `api.get / post / put / patch / delete` — unauthenticated calls.
- `api.authGet / api.authPost` — routed through the configured `AUTH_TYPE`
  (oauth2 / basic / apikey) with **auto-retry on 401/403**.
- Base URL comes from `API_URL`; paths are relative to it.
- Tag with `@API`.

## 2. UI — `tests/ui/`

Browser journeys through Page Objects. Import from `base.fixture`.

```ts
import { test, expect } from '../../src/fixtures/base.fixture';

test('reaches the shell', async ({ loginPage, leftNavigationPage }) => {
  await loginPage.gotoPetTiger();
  await loginPage.loginPetTiger(process.env.USER_NAME!, process.env.PASSWORD!);
  await expect(leftNavigationPage.searchMenu).toBeVisible();
});
```

- Use Page Objects (`BasePage` subclasses) + components; don't inline selectors.
- Locator priority: CSS id → `getByRole` → `data-testid` → `getByText`.
- Data-driven: `test.use({ testCaseId: 'TC-…' })` → the `testCaseData` fixture.
- Tag with `@UI` (and `@Smoke` for critical-path).

## 3. Workflow — `tests/workflow/`

UI + API hybrid: perform an action in the UI, then verify it via the API in the
same test. Import from `base.fixture` (it also provides `apiRequest`).

```ts
import { test, expect } from '../../src/fixtures/base.fixture';
import { executeWithAuthRetry } from '../../src/auth/requestBuilder';
import { verifyJsonKeyValues } from '../../src/utils/apiResponseUtils';

test('create in UI, verify via API', async ({ apiRequest, loginPage }, testInfo) => {
  // …UI steps…
  const res = await executeWithAuthRetry(apiRequest, 'GET', 'guarantor/28114/notes', {}, testInfo);
  expect(await verifyJsonKeyValues(res, { accountNote: 'x' })).toBeTruthy();
});
```

- Resolve entity ids **by name at runtime** — never hardcode ids.
- Tag with `@Workflow`.

---

## Running by category

`testMatch` in `playwright.config.ts` is `**/*.spec.ts`, so all three folders run
by default. Filter by category with tags:

```bash
npx playwright test --grep @API
npx playwright test --grep @UI
npx playwright test --grep @Workflow
```

### Optional: a dedicated `api` project (no browser / no auth-setup)

API specs currently run under the `chromium` project (which depends on
`auth-setup` and loads storageState). To run them without a browser or the
auth-setup dependency, add a project to `playwright.config.ts`:

```ts
{
  name: 'api',
  testDir: './tests/api',
  // no storageState, no dependencies — api.fixture handles its own auth
},
// and add testIgnore: '**/tests/api/**' to the chromium project so they don't double-run
```

This is optional and left out of the committed config to keep the working
pipeline unchanged — enable it when the API suite grows.
