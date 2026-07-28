# 🎭 Playwright POM Core Framework

> Enterprise-grade Playwright Test Automation Framework with Page Object Model, direct JSON/CSV data-driven testing, OAuth2/Basic/API-Key authentication, and comprehensive reporting.

![Playwright](https://img.shields.io/badge/Playwright-v1.58.2-45ba4b)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6)
![Node.js](https://img.shields.io/badge/Node.js-ES2022-339933)
![License](https://img.shields.io/badge/License-ISC-blue)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Architecture Overview](#-architecture-overview)
- [Core Concepts](#-core-concepts)
- [How to Create a Test Script](#-how-to-create-a-test-script)
- [Examples](#-examples)
- [Running Tests](#-running-tests)
- [CI/CD Integration](#-cicd-integration)
- [Reporting](#-reporting)
- [Advanced Features](#-advanced-features)

---

## Overview

**Playwright POM Core** is a production-ready test automation framework built on [Playwright Test](https://playwright.dev/) and TypeScript. It provides a structured, scalable foundation for writing end-to-end UI tests, API tests, and hybrid UI+API validation tests against the PET Tiger application.

The framework implements the **Page Object Model (POM)** design pattern with a **component-based architecture**, ensuring maintainability and reusability across large test suites.

---

## ✨ Features

| Category | Features |
|----------|----------|
| **Design Patterns** | Page Object Model (POM), Component-based architecture, Singleton data providers, Factory pattern for auth contexts |
| **Cross-Browser** | Chromium (Firefox/WebKit projects included, commented out) |
| **Data-Driven Testing** | JSON or CSV, read directly from the configured file — no conversion/preprocessing step |
| **Authentication** | OAuth2 client-credentials with token caching, Basic Auth, API Key; storage state persistence for browser login |
| **API Testing** | Typed HTTP helpers, authenticated requests with auto-retry on 401/403, response assertions |
| **Reporting** | HTML, JSON, Allure, custom Email reporter, Slack notifications, ELK/Elasticsearch dashboard push |
| **CI/CD** | GitHub Actions workflow ready, artifact collection, scheduled + externally-triggered runs |
| **Network** | Route mocking, resource blocking, request capture, latency simulation, HAR recording |
| **Observability** | Structured logging (file + console), execution context tracking, test metrics, screenshots/video/trace |
| **Utilities** | Soft assertions, visual regression, performance monitoring, retry helpers, API mock server |

---

## 🛠 Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| [Playwright Test](https://playwright.dev/) | 1.58.2 | Test runner & browser automation |
| [TypeScript](https://www.typescriptlang.org/) | ^5.3.0 | Type-safe development |
| [Allure Playwright](https://docs.qameta.io/allure/) | ^3.10.2 | Advanced test reporting |
| [PapaParse](https://www.papaparse.com/) | ^5.5.3 | CSV parsing |
| [Nodemailer](https://nodemailer.com/) | ^9.0.3 | Email report delivery |
| [dotenv](https://github.com/motdotla/dotenv) | ^17.2.4 | Environment variable management |
| [mssql](https://github.com/tediousjs/node-mssql) | ^12.7.0 | SQL Server test-data cleanup (pure JS via `tedious`) |

Logging is a custom in-repo `Logger` (no external logging library), and Slack/ELK notifications use Node's built-in `https` module directly (no SDK dependency).

---

## 📁 Project Structure

```
playwright-test-suite/
├── .github/workflows/e2e.yml         # GitHub Actions CI pipeline
├── playwright.config.ts              # Playwright test configuration
├── tsconfig.json                     # TypeScript compiler configuration
├── package.json                      # Dependencies and scripts
├── env.qa                            # QA environment configuration
├── env.dev                           # Dev environment configuration
├── env.local                         # Local environment configuration
├── env.example                       # Template for local .env files
│
├── src/
│   ├── auth/                         # Authentication layer
│   │   ├── authorizationManager.ts   #   OAuth2 token caching & refresh
│   │   ├── requestBuilder.ts         #   executeWithAuthRetry() — auto-retry on 401/403
│   │   └── authContextFactory.ts     #   Factory for Basic/OAuth2/API Key contexts
│   │
│   ├── components/                   # Reusable UI components (scoped to root locator)
│   │   ├── BaseComponent.ts          #   Abstract base — all child queries relative to root
│   │   ├── NavigationComponent.ts    #   Header/nav bar interactions
│   │   ├── ModalComponent.ts         #   Dialog/modal interactions
│   │   └── FormComponent.ts          #   Form field interactions
│   │
│   ├── config/                       # Configuration management
│   │   ├── envLoader.ts              #   Loads env.local/dev/qa files
│   │   ├── environmentManager.ts     #   Singleton for runtime env switching
│   │   ├── environments.ts           #   Environment definitions
│   │   └── dataSource.config.ts      #   JSON/CSV data path resolution
│   │
│   ├── context/                       # Execution & test context
│   │   ├── executionContext.ts        #   Run-level metadata (runId, branch, CI trigger)
│   │   ├── testMetrics.ts            #   Per-test metrics collection
│   │   └── testRunContext.ts          #   Iteration tracking & current test tracker
│   │
│   ├── core/                          # Single-file framework primitives (no folder each)
│   │   ├── frameworkConstants.ts      #   Framework-wide path constants
│   │   ├── frameworkExceptions.ts     #   FrameworkError and subclasses
│   │   └── errorHandler.decorator.ts  #   @HandleError decorator
│   │
│   ├── data/                          # Test data files
│   │   ├── runnerManager.json         #   JSON test data
│   │   ├── runnerManager.csv          #   CSV test data
│   │   ├── login-module-data.json     #   Login spec fixture data
│   │   └── runnerList.json            #   Optional execute:"yes"/"no" test filter
│   │
│   ├── enums/                         # Enumerations
│   │   └── configProperties.ts        #   ConfigProperties enum + getConfigValue()
│   │
│   ├── fixtures/                      # Playwright test fixtures & lifecycle
│   │   ├── base.fixture.ts            #   UI test fixtures + beforeEach/afterEach hooks
│   │   ├── api.fixture.ts             #   API-only test fixtures + ApiHelper class
│   │   ├── global-setup.ts            #   One-time setup (auth dir, results dirs)
│   │   └── global-teardown.ts         #   Cleanup (Allure env/executor metadata, summary log)
│   │
│   ├── listeners/                     # Test lifecycle listeners
│   │   ├── testLifecycleManager.ts    #   onTestStart/onTestEnd, pass/fail/skip tracking
│   │   └── methodInterceptor.ts       #   Runner-list-based test filtering
│   │
│   ├── pages/                         # Page Objects
│   │   ├── BasePage.ts                #   Abstract base — navigation, waits, actions, assertions
│   │   ├── LoginPage.ts               #   Keycloak login page
│   │   ├── LeftNavigationPage.ts      #   Authenticated shell's left navigation
│   │   └── UsersPage.ts               #   Users administration screen + New User form
│   │
│   ├── reporting/                     # Custom reporters
│   │   ├── emailReporter.ts           #   Email report with lean Allure HTML attachment
│   │   ├── slackReporter.ts           #   Slack run-summary notification
│   │   └── dashboard.ts               #   ELK/Elasticsearch dashboard push
│   │
│   ├── types/                         # TypeScript type definitions
│   │   └── index.ts                   #   All interfaces & types
│   │
│   └── utils/                         # Utility modules
│       ├── DataProvider.ts            #   Singleton JSON/CSV data provider (no conversion step)
│       ├── logger.ts                  #   Structured logger (file + console)
│       ├── networkHelper.ts           #   Route mocking, blocking, capture, HAR
│       ├── allureHelper.ts            #   Allure report generation (CI + lean email variant)
│       ├── allureLabels.ts            #   Applies Allure labels + resolves runner row id
│       ├── apiMockServer.ts           #   API mock server for stubbing
│       ├── apiResponseUtils.ts        #   JSON key-value verification (verifyJsonKeyValues)
│       ├── softAssertions.ts          #   Soft assertion utilities
│       ├── visualRegression.ts        #   Visual diff/regression testing
│       ├── performanceMonitor.ts      #   Performance metrics collection
│       ├── customAssertions.ts        #   Extended assertion library
│       ├── retryHelper.ts             #   Retry-with-backoff helper
│       ├── testData/                  #   Run-unique test-data factories
│       │   ├── userFactory.ts         #   makeUser(overrides) → unique NewUserData
│       │   └── random.ts              #   randomInitials(), uid()
│       ├── db/                        #   Direct SQL access for setup/cleanup
│       │   └── sqlClient.ts           #   runSql(), sqlLiteral()
│       └── dataReaders/               #   Data reader implementations
│           ├── BaseDataReader.ts      #   Shared caching/filtering/availability logic
│           ├── JsonDataReader.ts
│           ├── CsvDataReader.ts
│           └── TypeCoercionHelper.ts  #   Coerces CSV string fields to typed values
│
├── tests/                             # Test specifications — 3 categories
│   ├── auth.setup.ts                  #   Keycloak login → storageState (auth-setup project)
│   ├── seed.spec.ts
│   ├── api/                           #   API-only tests (api.fixture) — runs in the browserless `api` project
│   ├── ui/                            #   UI e2e tests (base.fixture + POM)
│   │   ├── login/login-module.spec.ts #     logged-out login module
│   │   └── user-setup.spec.ts         #     Users administration journey (create/list/edit)
│   └── workflow/                      #   UI + API hybrid tests (base.fixture + apiRequest)
│
├── scripts/                           # npm-script helpers (plain JS, no ts-node dependency)
├── test-data/                         # External test data
└── logs/                              # Runtime log output (app-<date>.log)
```

---

## 📦 Prerequisites

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x
- **Git**
- **Java** (JRE/JDK) — required by `allure-commandline` to generate the Allure HTML report

---

## 🚀 Installation

```bash
# Clone the repository
git clone <repository-url>
cd playwright-test-suite

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install --with-deps
```

---

## ⚙ Configuration

### Environment Files

The framework uses environment-specific configuration files in the project root:

| File | Purpose |
|------|---------|
| `env.local` | Local environment (default) |
| `env.dev` | Development environment |
| `env.qa` | QA environment |

Switch environments by setting `TEST_ENV`:

```bash
# Run tests against the dev environment
TEST_ENV=dev npm test

# Run tests against QA
TEST_ENV=qa npm test
```

### Environment File Structure (`env.qa`)

```properties
# Application URLs
BASE_URL=https://your-app.example.com
API_URL=https://your-app.example.com/api

# Runtime Configuration
TEST_DATA_SOURCE=json          # json | csv
RETRY=0

# Application Login (Keycloak)
USER_NAME=testuser
PASSWORD=testpass

# API Authentication (only relevant when calling apiRequest/api.fixture endpoints)
AUTH_TYPE=none                  # oauth2 | basic | apikey | none
ACCESS_TOKEN_URL=https://keycloak.example.com/token
CLIENT_ID=my-client
CLIENT_SECRET=my-secret
AUTH_USERNAME=api-user
AUTH_PASSWORD=api-pass
API_KEY=my-api-key
API_KEY_HEADER=X-API-Key

# Notifications (all opt-in / self-gating — omit to disable)
SEND_EMAIL=no
SEND_SLACK=no
SEND_RESULT_ELK=no
```

### Configuration Access in Code

Use the type-safe `ConfigProperties` enum and `getConfigValue()` helper:

```typescript
import { ConfigProperties, getConfigValue, getConfigBoolean } from '../enums/configProperties';

// Get string values
const baseUrl = getConfigValue(ConfigProperties.APP_URL);
const apiUrl  = getConfigValue(ConfigProperties.API_URL);

// Get boolean values
const sendEmail = getConfigBoolean(ConfigProperties.SEND_EMAIL, false);
```

### Path Aliases (tsconfig.json)

```typescript
import { LoginPage }           from '@pages/LoginPage';
import { NavigationComponent } from '@components/NavigationComponent';
import { test }                from '@fixtures/base.fixture';
import { Logger }              from '@utils/logger';
import { getDataSourceConfig } from '@config/dataSource.config';
```

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  L1 — CI/CD & Trigger                                          │
│  GitHub Actions → npm ci → npx playwright install → test        │
├─────────────────────────────────────────────────────────────────┤
│  L2 — Configuration                                            │
│  playwright.config.ts ← envLoader ← env.{name} files            │
├─────────────────────────────────────────────────────────────────┤
│  L3 — Global Lifecycle                                         │
│  global-setup (auth dir, results dirs) → tests → global-teardown│
├─────────────────────────────────────────────────────────────────┤
│  L4 — Fixtures & Test Hooks                                    │
│  base.fixture / api.fixture → beforeEach/afterEach → Lifecycle  │
├─────────────────────────────────────────────────────────────────┤
│  L5 — Page Object Model & Components                           │
│  BasePage → LoginPage, LeftNavigationPage, UsersPage            │
│  BaseComponent → Navigation, Modal, Form                        │
├─────────────────────────────────────────────────────────────────┤
│  L6 — Data Layer                                               │
│  DataProvider → JSON / CSV Readers (read directly, no convert)  │
├─────────────────────────────────────────────────────────────────┤
│  L7 — Authentication & API                                     │
│  AuthorizationManager → RequestBuilder → AuthContextFactory     │
├─────────────────────────────────────────────────────────────────┤
│  L8 — Reporting & Utilities                                    │
│  HTML, Allure, Email, Slack, ELK, Logger, Network Helpers       │
└─────────────────────────────────────────────────────────────────┘
```

### Execution Workflow

```
Git Push / Schedule / repository_dispatch → GitHub Actions
  → npm ci → npx playwright install --with-deps
    → npx playwright test
      → Global Setup (auth dir, results dirs)
        → Auth Setup Project (browser login → storageState)
          → Test Execution (beforeEach → Test Body → afterEach)
            → Reporter Aggregation (HTML, JSON, Allure, Email, Slack, ELK)
              → Global Teardown (Allure env/executor metadata, summary log)
                → CI Artifacts (playwright-report/, allure-report/)
```

---

## 🧩 Core Concepts

### 1. Page Object Model (POM)

Every page in the application extends `BasePage`, which deliberately does **not** wrap Playwright's own `Locator`/`expect` API — those are already one-liners. It keeps only the handful of things that aren't:

**BasePage provides:**
- **Navigation**: `navigate()` (goes to the page object's own `pageUrl`), `navigateTo(url)`
- **Non-trivial helpers**: `waitForCondition()` (custom async-predicate polling — no native equivalent), `takeScreenshot()` / `takeElementScreenshot()` (enforce the repo's `test-results/screenshots/<name>.png` path convention)

Everything else — clicking, typing, checkboxes, getters, visibility/state checks, assertions — use the native `Locator` API and `expect()` directly in your page object, the same way `LoginPage` already does:

**Creating a Page Object:**

```typescript
// src/pages/DashboardPage.ts
import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
    readonly pageUrl: string = '/app/dashboard';
    readonly pageTitle: string | RegExp = /Dashboard/;

    readonly welcomeMessage: Locator;
    readonly statsCard: Locator;

    constructor(page: Page) {
        super(page);
        this.welcomeMessage = page.getByRole('heading', { name: 'Welcome' });
        this.statsCard = page.locator('[data-testid="stats-card"]');
    }

    async assertDashboardLoaded(): Promise<void> {
        await expect(this.welcomeMessage).toBeVisible();
        await expect(this.statsCard).toBeVisible();
    }
}
```

### 2. Component-Based Architecture

Reusable UI fragments (navbars, modals, forms) extend `BaseComponent`, which only provides root-locator scoping and scoped locator finders (`getByRole`/`getByText`/`getByLabel`/`getByPlaceholder`/`getByTestId`/`locator`) — visibility checks and assertions on `this.root` are plain `Locator`/`expect` calls, same rationale as `BasePage`. Each component is **scoped to a root locator**, so all child queries are relative — preventing selector collisions.

**Built-in components available as fixtures:**
- `NavigationComponent` — Header/nav bar
- `ModalComponent` — Dialog/modal interactions
- `FormComponent` — Form fields (fill, submit, validate)

### 3. Custom Fixtures

```typescript
import { test } from '../src/fixtures/base.fixture';

test('example', async ({
    page,              // Standard Playwright page
    loginPage,         // LoginPage instance
    leftNavigationPage,// LeftNavigationPage instance
    usersPage,         // UsersPage instance (Users admin + New User form)
    gotoUrl,           // Activation fixture — navigates to the login page before the body
    navigation,        // NavigationComponent instance
    modal,             // ModalComponent instance
    form,              // FormComponent instance
    logger,            // Per-test Logger instance
    authenticatedPage, // Page with pre-loaded auth state
    apiRequest,        // API request context for REST calls (baseURL = API_URL)
    testCaseId,        // Test case ID (set via test.use)
    testCaseName,      // Test case name (set via test.use)
    testCaseData,      // Auto-loaded test data by testCaseId/testCaseName
}) => {
    // Your test code here
});
// A worker-scoped `workerLogger` fixture is also available for per-worker logging.
// Destructure only the fixtures a test uses — the tsconfig fails the build on
// unused parameters, so alias an unused activation fixture as `gotoUrl: _gotoUrl`.
```

**For API-only tests**, use the API fixture:

```typescript
import { test } from '../src/fixtures/api.fixture';

test('API test', async ({
    apiContext,        // Raw Playwright API request context
    api,               // ApiHelper with typed methods + auth-retry
    authenticatedApi,  // Request context pre-configured with the current auth strategy
}) => {
    // api.get(), api.post(), api.authGet(), api.authPost(), etc.
});
```

### 4. Test Lifecycle (beforeEach / afterEach)

Managed by `src/listeners/testLifecycleManager.ts` via `base.fixture.ts`'s `beforeEach`/`afterEach` hooks:

**beforeEach:**
1. Resets `TestMetrics` and records test name/file/project/retry
2. Records `CurrentTestTracker` and `TestRunContext` iteration
3. Tags the Allure feature/severity for the run

**afterEach:**
1. Records pass/fail/skip and duration in `TestMetrics`
2. Clears `CurrentTestTracker`
3. Playwright's own config handles screenshot/video/trace capture (the config sets `screenshot`/`trace`/`video` to `'on'`, i.e. captured for every test)

### 5. Data-Driven Testing

The framework reads test data **directly** from JSON or CSV — there is no conversion/preprocessing step:

| Source | File | Env Value |
|--------|------|-----------|
| JSON | `src/data/runnerManager.json` | `TEST_DATA_SOURCE=json` (default) |
| CSV | `src/data/runnerManager.csv` | `TEST_DATA_SOURCE=csv` |

**Data format** (same across both sources):

| Field | Description |
|-------|-------------|
| `id` | Unique test case ID (e.g., `UI-001`, `USR-001`) |
| `category` | Test category — `ui` \| `api` \| `workflow` (maps to the `tests/` folder) |
| `testName` | Programmatic test name |
| `testTitle` | Human-readable test title |
| `testDescription` | Detailed description |
| `shouldComplete` | Whether the test should run to completion |
| `expectedCount` | Expected result count |
| `tags` | Pipe-delimited tag string (e.g. `smoke\|high-level\|regression`) |
| `enabled` | `true`/`false` — controls test execution |

**How it works:**

1. `DataProvider.getInstance()` reads the configured source (`TEST_DATA_SOURCE`) directly — a JSON source reads the `.json` file, a CSV source reads the `.csv` file
2. Per-test → bind a runner row by `id`, then destructure the `testCaseData` fixture, which auto-loads and validates the matching record, skipping the test if it's missing or `enabled: false`

A row is bound either via a per-test **annotation** (the live pattern in `tests/ui/user-setup.spec.ts`) or via `test.use({ testCaseId })` — both resolve the same way:

```typescript
// Live pattern — annotation on the test options
test('[User Setup] Verify that ... appears in the Users list.', {
    tag: ['@UI', '@Smoke', '@Local'],
    annotation: { type: 'testCaseId', description: 'USR-001' },
}, async ({ usersPage, testCaseData }) => {
    // testCaseData is the USR-001 row: { id: 'USR-001', testName: 'createUserWithAllFields', ... }
});

// Equivalent — bind the id for a whole describe block
test.describe('Login Tests', () => {
    test.use({ testCaseId: 'UI-001' });

    test('verify valid login', async ({ testCaseData }) => {
        // testCaseData → { id: 'UI-001', testName: 'loginWithValidCredentials', ... }
    });
});
```

### 6. Authentication

The framework supports multiple **API** authentication strategies (independent of the browser's Keycloak login):

| Strategy | Config Value | Description |
|----------|--------------|-------------|
| **OAuth2** | `AUTH_TYPE=oauth2` | Client-credentials flow with token caching + auto-refresh |
| **Basic Auth** | `AUTH_TYPE=basic` | HTTP Basic Authentication |
| **API Key** | `AUTH_TYPE=apikey` | API Key in a configurable header |
| **None** | `AUTH_TYPE=none` (default) | No authentication |

**OAuth2 Flow:**
1. `AuthorizationManager` fetches a token from `ACCESS_TOKEN_URL` using client credentials
2. Tokens are **cached in memory** and auto-refreshed on expiry
3. `executeWithAuthRetry()` injects the Bearer token and **retries once on 401/403** with a freshly fetched token

```typescript
import { executeWithAuthRetry } from '../src/auth/requestBuilder';

// `url` is relative to API_URL — replace this with a real PET Tiger endpoint.
const response = await executeWithAuthRetry(
    apiRequest, 'GET',
    'users?page=1&pageSize=10',
    {}, testInfo,
);
expect(response.status()).toBe(200);
```

**Browser Authentication (Storage State):**
- The `auth-setup` project runs before all browser tests
- Performs Keycloak login and saves session to `.auth/user.json`
- All browser projects load this storage state automatically

### 7. Standard Playwright Tags

Tests use plain Playwright `test.describe`/`test` with the built-in `tag` option — there is no custom annotation system layered on top:

```typescript
test.describe('Login Tests', { tag: '@login' }, () => {
    test('[Login] Verify that the user can log in with valid username and password.', {
        tag: ['@Smoke', '@Local'],
    }, async ({ gotoUrl, loginPage, leftNavigationPage }) => {
        // ...
    });
});
```

Filter runs with `--grep`, e.g. `npx playwright test --grep @Smoke`.

---

## 📝 How to Create a Test Script

### Step-by-Step Guide

> The example below uses a generic `ProductPage` as a **template** — swap in your
> real screen (see `src/pages/UsersPage.ts` for a live reference).

#### Step 1: Create a Page Object (if needed)

```typescript
// src/pages/ProductPage.ts
import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class ProductPage extends BasePage {
    readonly pageUrl: string = '/app/products';
    readonly pageTitle: string | RegExp = /Products/;

    readonly productGrid: Locator;
    readonly addToCartButton: Locator;
    readonly cartBadge: Locator;

    constructor(page: Page) {
        super(page);
        this.productGrid = page.locator('[data-testid="product-grid"]');
        this.addToCartButton = page.getByRole('button', { name: 'Add to Cart' });
        this.cartBadge = page.locator('.cart-badge');
    }

    async selectProduct(name: string): Promise<void> {
        await this.page.getByText(name).click();
    }

    async addToCart(): Promise<void> {
        await this.addToCartButton.click();
    }

    async assertCartCount(expected: number): Promise<void> {
        await expect(this.cartBadge).toHaveText(String(expected));
    }
}
```

#### Step 2: Register the Page Object as a Fixture

Page objects are consumed **as fixtures**, never `new`-ed in the test body. Add
the new one to `src/fixtures/base.fixture.ts`, following the existing `usersPage`
pattern:

```typescript
// In CustomFixtures:
productPage: ProductPage;

// In base.extend({ ... }):
productPage: async ({ page }, use) => {
    await use(new ProductPage(page));
},
```

#### Step 3: Create the Test Spec File

Test files go in the `tests/` directory and must match `**/*.spec.ts`. Consume the
page object as a fixture:

```typescript
// tests/ui/products/product-add-to-cart.spec.ts
import { test } from '../../../src/fixtures/base.fixture';

test.describe('Product Cart Functionality', () => {
    test('verifyUserCanAddProductToCart', {
        tag: ['@Regression', '@UI'],
        annotation: { type: 'testCaseId', description: 'PROD-001' }, // must exist in runnerManager
    }, async ({ productPage }) => {
        await productPage.navigate();
        await productPage.selectProduct('Widget Pro');
        await productPage.addToCart();
        await productPage.assertCartCount(1);
    });
});
```

#### Step 4: Run the Test

```bash
npx playwright test tests/ui/products/product-add-to-cart.spec.ts
npx playwright test tests/ui/products/product-add-to-cart.spec.ts --project=chromium
```

---

## 📚 Examples

### Example 1: UI Login Test (starts logged out)

```typescript
// tests/ui/login/login-module.spec.ts
import { expect, test } from '../../src/fixtures/base.fixture';
import loginModuleData from '../../src/data/login-module-data.json';

test.use({
    storageState: { cookies: [], origins: [] },
});

test.describe('Login Tests', { tag: '@login' }, () => {
    test('[Login] Verify that the user can log in with valid username and password.', {
        tag: ['@Smoke', '@Local'],
    }, async ({ gotoUrl: _gotoUrl, loginPage, leftNavigationPage }) => {
        await loginPage.loginPetTiger(process.env.USER_NAME!, process.env.PASSWORD!);
        await expect(leftNavigationPage.searchMenu).toBeVisible();
        await expect(leftNavigationPage.welcomeBack).toBeVisible();
    });
});
```

### Example 2: Pure API Test

```typescript
// tests/api/user-api.spec.ts
import { test, expect } from '../../src/fixtures/api.fixture';

test.describe('User API Tests', { tag: '@API' }, () => {
    test('[Users API] Verify that GET /users returns 200', async ({ api }) => {
        // `url` is relative to API_URL — swap for a real PET Tiger endpoint.
        const response = await api.get<{ id: number; name: string }[]>('users');
        api.assertStatus(response, 200);
        expect(response.data.length).toBeGreaterThan(0);
    });

    test('[Users API] Verify an authenticated GET with auto-retry', async ({ api }) => {
        const response = await api.authGet('users?page=1&pageSize=1');
        api.assertStatus(response, 200);
    });
});
```

### Example 3: Test with Network Mocking

```typescript
// tests/mocking/mock-api-response.spec.ts
import { test, expect } from '../../src/fixtures/base.fixture';
import { mockRoute, blockResources } from '../../src/utils/networkHelper';

test('mock API response', async ({ page }) => {
    await mockRoute(page, '**/api/products', {
        status: 200,
        body: [{ id: 1, name: 'Mocked Product', price: 9.99 }],
    });

    await blockResources(page, ['image', 'font']);

    await page.goto('/products');
    await expect(page.getByText('Mocked Product')).toBeVisible();
});
```

### Example 4: Workflow — Create in the UI, Verify via the API

A UI + API hybrid: act through Page Objects, then confirm the result through the
REST API in the same test. Import from `base.fixture` (it provides `apiRequest`).

```typescript
// tests/workflow/user-create-verify.spec.ts
import { test, expect } from '../../src/fixtures/base.fixture';
import { executeWithAuthRetry } from '../../src/auth/requestBuilder';
import { verifyJsonKeyValues } from '../../src/utils/apiResponseUtils';
import { makeUser } from '../../src/utils/testData';

test.describe('User Setup Workflow', { tag: '@Workflow' }, () => {
    test('[User Setup] Verify that a user created in the UI is retrievable via the API',
        async ({ usersPage, apiRequest }, testInfo) => {
            // ── Act — create the user through the New User form ──
            const user = makeUser({ role: 'Administrator' });
            await usersPage.gotoUsersList();
            await usersPage.openNewUserForm();
            await usersPage.fillGeneral(user);
            expect(await usersPage.submit()).toBe('created');
            await expect(usersPage.userCreatedToast).toBeVisible();

            // ── Verify — resolve the user by a field (never a hardcoded id) ──
            // `url` is relative to API_URL — replace with the real users endpoint.
            const response = await executeWithAuthRetry(
                apiRequest, 'GET', 'users?filter=' + encodeURIComponent(user.email),
                {}, testInfo,
            );
            expect(response.status()).toBe(200);
            expect(await verifyJsonKeyValues(response, { email: user.email })).toBeTruthy();
        });
});
```

> Prefer `/api-script-generator` and `/workflow-script-generator` (repo skills) to
> generate `tests/api/` and `tests/workflow/` specs that follow these conventions.

---

## ▶️ Running Tests

### Basic Commands

```bash
# Run against the local environment (default via npm scripts)
npm test

# Run against a specific environment
npm run test:dev
npm run test:qa

# Headed / UI mode / debug
npm run test:headed
npm run test:ui
npm run test:debug

# Smoke tests only
npm run test:smoke

# API-only specs (browserless `api` project — no auth-setup, no browser)
npm run test:api

# Workflow (UI + API hybrid) specs
npm run test:workflow

# Re-run only what failed last time
npm run test:last-failed

# Raw Playwright CLI (any flag)
npx playwright test --grep "@Smoke"
npx playwright test --project=chromium
npx playwright test --project=api          # API-only specs, no browser
npx playwright test --grep "@Workflow"
npx playwright test --workers=4
npx playwright test --retries=2
```

### Environment-Specific Execution

```bash
TEST_ENV=dev npx playwright test
TEST_ENV=qa npx playwright test
RETRY=2 npx playwright test
```

### View Reports

```bash
# Open the Playwright HTML report
npm run test:report

# Generate and open the Allure report
npm run report:allure
npm run report:allure:open
```

---

## 🔄 CI/CD Integration

### GitHub Actions

`.github/workflows/e2e.yml` runs the suite against the **dev staging** deployment twice a day, plus on push to `main`, manual dispatch, and `repository_dispatch` (triggered externally by the app repo). It does **not** boot an app (see `e2e-local.yml` for the localhost variant).

The target comes from `TEST_ENV: dev` in the job env, which makes the framework load `env.dev` (`BASE_URL=https://app.ptdev.xyz`, `API_URL=https://api.ptdev.xyz/api` — the API is a separate host from the static SPA).

Credentials are split by sensitivity: the password is the **`DEV_PASSWORD` secret** (never committed), and the username is the **`DEV_USER_NAME` variable**, defaulting to `su`. A login name isn't a credential, and storing a short one as a secret is actively harmful — Actions masks every literal occurrence of a secret's value, so `su` gets redacted inside unrelated words (`playwright-test-***ite`, `allure-re***lts`), making logs hard to read. Both are dev-staging-specific with no fallback to generic names: `e2e-local.yml` uses its own `LOCAL_USER_NAME`/`LOCAL_PASSWORD`, and an earlier generic-`PASSWORD` fallback silently logged the dev-staging run in with localhost credentials.

```yaml
on:
  push:
    branches: [main]
  schedule:
    - cron: '30 10 * * *'   # 4:00 PM IST (10:30 AM UTC)
    - cron: '30 12 * * *'   # 6:00 PM IST (12:30 PM UTC)
  workflow_dispatch:
  repository_dispatch:
    types: [run-playwright]

concurrency:
  group: e2e-${{ github.ref }}
  cancel-in-progress: true

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: actions/setup-java@v4        # required by allure-commandline
        with: { distribution: temurin, java-version: '21' }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/cache@v4              # Allure trend history (keeps graphs across runs)
        if: always()
        with: { path: allure-report/history, key: allure-history-${{ github.ref_name }}-${{ github.run_id }} }
      - run: node scripts/generate-allure-report.js
        if: always()
      - uses: actions/upload-artifact@v4    # playwright-report/ and allure-report/
        if: always()
      # Opt-in (SEND_S3=yes): sync test-results/ (traces, videos, results.json) to S3
      - run: aws s3 sync test-results "s3://.../test-results" --no-progress
        if: always() && env.SEND_S3 == 'yes'
```

**CI-specific behavior:**
- Workers: forced to **1** on CI (auth storage state is shared across tests); unlimited locally
- Retries: defaults to **2** on CI (0 locally), overridable via `RETRY`
- `test.only()`: **blocked** on CI (`forbidOnly: true`)
- Test-user cleanup: PET Tiger has no delete-user action in either the UI or the API, so tests that create users remove them in SQL (`DB_CLEANUP=yes`). `DB_TRUSTED` selects the transport — `no` uses the `mssql` driver (pure JS, arrives with `npm ci`, works on GitHub-hosted runners), `yes` uses the `sqlcmd` CLI with Windows integrated auth (local and self-hosted). The remaining requirement is a network route: `DB_SERVER` must accept connections from GitHub runner IPs. `global-setup.ts` probes the connection once at the start of every run and emits a CI error annotation if it fails, because cleanup that skips silently leaves test users behind in a shared database while the run still reports green.
- Notifications & artifact upload are all opt-in: **Email** (`SEND_EMAIL=yes` + SMTP secrets), **Slack** (`SEND_SLACK=yes` + `SLACK_WEBHOOK_URL`), and **S3 report upload** (`SEND_S3=yes` + AWS secrets). Unset → each step logs a line and does nothing.

---

## 📊 Reporting

| Reporter | Output | Description |
|----------|--------|-------------|
| **List** | Console | Real-time test progress in terminal |
| **HTML** | `playwright-report/` | Interactive HTML report with traces |
| **JSON** | `test-results/results.json` | Machine-readable JSON results |
| **GitHub** | Console annotations | Inline failure annotations on GitHub Actions |
| **Allure** | `allure-results/` → `allure-report/` | Rich report with steps, metrics, trend history |
| **Email** | SMTP delivery | Self-gating (`SEND_EMAIL=yes`); attaches a lean single-file Allure report |
| **Slack** | Incoming Webhook | Self-gating (`SEND_SLACK=yes`); posts pass/fail/flaky/skipped summary |
| **ELK Dashboard** | HTTP POST to `ELK_URL` | Self-gating (`SEND_RESULT_ELK=yes`); pushes a JSON run summary |

**Automatic artifacts** — the config captures all three on **every** test (`screenshot`/`trace`/`video: 'on'`):
- 📸 Screenshot capture
- 🎥 Video recording
- 📋 Trace file

> To trim artifact size/time, switch `trace`/`video` to `'retain-on-failure'` or `'on-first-retry'` in `playwright.config.ts`.

---

## 🔧 Advanced Features

### Network Helpers

```typescript
import {
    mockRoute,           // Mock a single route's response
    mockRoutes,          // Mock multiple endpoints at once
    mockApiError,        // Fulfill a route with an error status/body
    blockResources,      // Block images/fonts/css/scripts/media for speed
    interceptRequest,    // Intercept and modify outgoing request headers/body
    waitForRequest,      // Wait for a specific request
    waitForResponse,     // Wait for a specific response
    waitForNetworkIdle,  // Wait for the network to go idle
    captureRequests,     // Capture requests emitted during an action
    captureResponses,    // Capture responses received during an action
    simulateSlowNetwork, // Add latency to every route
    goOffline,           // Set the context offline
    goOnline,            // Restore connectivity
    recordHar,           // Record a HAR file for replay
    replayFromHar,       // Replay a recorded HAR file
} from '../src/utils/networkHelper';
```

### API Mock Server

```typescript
import { ApiMockServer } from '../src/utils/apiMockServer';

const mockServer = new ApiMockServer();
mockServer.stub('GET', '/api/users', { status: 200, body: [] });
await mockServer.applyTo(page);
```

### Soft Assertions

```typescript
import { SoftAssertions } from '../src/utils/softAssertions';

const soft = new SoftAssertions();
soft.assertEquals(actual, expected, 'Values should match');
soft.assertTrue(condition, 'Condition should be true');
soft.throwIfErrors(); // Throws once, listing every failure
```

### Visual Regression

```typescript
import { compareScreenshots } from '../src/utils/visualRegression';

await compareScreenshots(page, 'login-page-baseline');
```

### Performance Monitoring

```typescript
import { PerformanceMonitor } from '../src/utils/performanceMonitor';

const monitor = new PerformanceMonitor(page);
const metrics = await monitor.getPageMetrics();
console.log(`Load time: ${metrics.loadTime}ms`);
```

### Error Handler Decorator

```typescript
import { HandleError } from '../src/core/errorHandler.decorator';

class MyPage extends BasePage {
    @HandleError('Failed to perform action')
    async riskyAction(): Promise<void> {
        // Failures are logged with class/method context, then rethrown as a FrameworkError
    }
}
```

### Execution Context

```typescript
import { ExecutionContext } from '../src/context/executionContext';

const ctx = ExecutionContext.snapshot();
console.log(ctx.runId);        // UUID for this test run
console.log(ctx.triggeredBy);  // 'github-actions' | 'gitlab-ci' | 'manual-run'
console.log(ctx.branch);       // Current git branch
console.log(ctx.environment);  // 'local' | 'dev' | 'qa'
```
