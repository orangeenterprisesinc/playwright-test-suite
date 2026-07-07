# 🎭 Playwright POM Core Framework

> Enterprise-grade Playwright Test Automation Framework with Page Object Model, multi-source data-driven testing, OAuth2 authentication, and comprehensive reporting.

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

**Playwright POM Core** is a production-ready test automation framework built on [Playwright Test](https://playwright.dev/) and TypeScript. It provides a structured, scalable foundation for writing end-to-end UI tests, API tests, and hybrid UI+API validation tests.

The framework implements the **Page Object Model (POM)** design pattern with a **component-based architecture**, ensuring maintainability and reusability across large test suites.

---

## ✨ Features

| Category | Features |
|----------|----------|
| **Design Patterns** | Page Object Model (POM), Component-based architecture, Singleton data providers, Factory pattern for auth contexts |
| **Cross-Browser** | Chromium, Firefox, WebKit (desktop); Mobile Chrome & Safari (configurable) |
| **Data-Driven Testing** | Multi-source: JSON, CSV, Excel (.xlsx), SQLite/MySQL — auto-unified to JSON at runtime |
| **Authentication** | OAuth2 client-credentials with token caching, Basic Auth, API Key; storage state persistence |
| **API Testing** | Typed HTTP helpers, authenticated requests with auto-retry on 401/403, response assertions |
| **Reporting** | HTML, JSON, JUnit, Allure, custom Email reporter, Database audit logging, ELK/Elasticsearch |
| **CI/CD** | GitLab CI/CD pipeline ready, Docker-based execution, artifact collection |
| **Annotations** | Custom annotation system — authors, categories, descriptions integrated with Allure |
| **Network** | Route mocking, resource blocking, request capture, latency simulation, HAR recording |
| **Observability** | Structured logging (file + console), execution context tracking, test metrics, screenshots/video/trace |
| **Utilities** | Soft assertions, visual regression, accessibility testing (axe-core), performance monitoring, retry helpers |

---

## 🛠 Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| [Playwright Test](https://playwright.dev/) | ^1.58.2 | Test runner & browser automation |
| [TypeScript](https://www.typescriptlang.org/) | ^5.3.0 | Type-safe development |
| [Allure Playwright](https://docs.qameta.io/allure/) | ^2.15.1 | Advanced test reporting |
| [Winston](https://github.com/winstonjs/winston) | ^3.11.0 | Structured logging |
| [mysql2](https://github.com/sidorares/node-mysql2) | ^3.16.3 | MySQL database connectivity |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | ^12.5.0 | SQLite database support |
| [PapaParse](https://www.papaparse.com/) | ^5.5.3 | CSV parsing |
| [SheetJS (xlsx)](https://sheetjs.com/) | ^0.18.5 | Excel file parsing |
| [Nodemailer](https://nodemailer.com/) | ^8.0.1 | Email report delivery |
| [axe-core](https://github.com/dequelabs/axe-core) | ^4.8.0 | Accessibility testing |
| [dotenv](https://github.com/motdotla/dotenv) | ^17.2.4 | Environment variable management |

---

## 📁 Project Structure

```
playwright-pom-core-ts/
├── .gitlab-ci.yml                    # GitLab CI/CD pipeline configuration
├── playwright.config.ts              # Playwright test configuration
├── tsconfig.json                     # TypeScript compiler configuration
├── package.json                      # Dependencies and scripts
├── env.qe                            # QE environment configuration
├── env.dev                           # Dev environment configuration (if present)
│
├── src/
│   ├── annotations/                  # Custom test annotation system
│   │   └── frameworkAnnotation.ts    #   annotate(), withAnnotation(), getAnnotation()
│   │
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
│   │   ├── envLoader.ts              #   Loads env.qe/dev/stag/prod files
│   │   ├── environmentManager.ts     #   Singleton for runtime env switching
│   │   ├── environments.ts           #   Environment definitions
│   │   └── dataSource.config.ts      #   Multi-source data path resolution
│   │
│   ├── constants/                    # Framework constants
│   │   └── frameworkConstants.ts
│   │
│   ├── context/                      # Execution & test context
│   │   ├── executionContext.ts        #   Run-level metadata (runId, branch, CI info)
│   │   ├── testMetrics.ts            #   Per-test metrics collection
│   │   └── testRunContext.ts          #   Iteration tracking & current test tracker
│   │
│   ├── data/                         # Test data files
│   │   ├── runnerManager.json        #   JSON test data
│   │   ├── runnerManager.csv         #   CSV test data
│   │   ├── runnerManager.xlsx        #   Excel test data
│   │   ├── runnerManager.db          #   SQLite test data
│   │   ├── DatabaseConfig.json       #   Database connection config
│   │   ├── email_config.json         #   Email reporter config
│   │   └── sqlQueries.json           #   SQL query definitions
│   │
│   ├── decorators/                   # TypeScript decorators
│   │   └── errorHandler.decorator.ts #   @HandleError decorator
│   │
│   ├── enums/                        # Enumerations
│   │   ├── configProperties.ts       #   ConfigProperties enum + getConfigValue()
│   │   └── categoryType.ts           #   Test categories (SMOKE, REGRESSION, etc.)
│   │
│   ├── exceptions/                   # Custom exception classes
│   │   └── frameworkExceptions.ts
│   │
│   ├── fixtures/                     # Playwright test fixtures & lifecycle
│   │   ├── base.fixture.ts           #   UI test fixtures + beforeEach/afterEach hooks
│   │   ├── api.fixture.ts            #   API test fixtures + ApiHelper class
│   │   ├── global-setup.ts           #   One-time setup (auth, context, data preprocessing)
│   │   └── global-teardown.ts        #   Cleanup (DB pools, reports, JSON restore)
│   │
│   ├── listeners/                    # Test lifecycle listeners
│   │   ├── testLifecycleManager.ts   #   onTestStart/onTestEnd, pass/fail/skip tracking
│   │   └── methodInterceptor.ts      #   Method-level interception
│   │
│   ├── pages/                        # Page Objects
│   │   ├── BasePage.ts               #   Abstract base — navigation, waits, actions, assertions
│   │   ├── LoginPage.ts              #   Keycloak login page
│   │   └── AccountReviewPage.ts      #   Account review page
│   │
│   ├── reporting/                    # Custom reporters
│   │   ├── emailReporter.ts          #   Email report with HTML attachment
│   │   ├── databaseAuditLogger.ts    #   MySQL audit logging
│   │   └── dashboard.ts              #   ELK dashboard integration
│   │
│   ├── types/                        # TypeScript type definitions
│   │   └── index.ts                  #   All interfaces & types
│   │
│   └── utils/                        # Utility modules
│       ├── DataProvider.ts           #   Singleton multi-source data provider
│       ├── DataPreprocessor.ts       #   CSV/Excel/DB → JSON conversion pipeline
│       ├── logger.ts                 #   Structured logger (file + console)
│       ├── networkHelper.ts          #   Route mocking, blocking, capture, HAR
│       ├── allureHelper.ts           #   Allure screenshot/metrics sync
│       ├── apiMockServer.ts          #   API mock server for stubbing
│       ├── apiResponseUtils.ts       #   JSON key-value verification
│       ├── databaseQueryExecutor.ts  #   SQL query execution helper
│       ├── softAssertions.ts         #   Soft assertion utilities
│       ├── visualRegression.ts       #   Visual diff/regression testing
│       ├── performanceMonitor.ts     #   Performance metrics collection
│       ├── customAssertions.ts       #   Extended assertion library
│       └── dataReaders/              #   Data reader implementations
│           ├── JsonDataReader.ts
│           ├── CsvDataReader.ts
│           ├── ExcelDataReader.ts
│           └── DatabaseDataReader.ts
│
├── tests/                            # Test specifications
│   └── collection/
│       └── guarantor/
│           └── collections-guarantor-note-create.spec.ts
│
├── test-data/                        # External test data
├── diagrams/                         # Architecture & workflow diagrams
└── logs/                             # Runtime log output
```

---

## 📦 Prerequisites

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x
- **Git**
- (Optional) **Docker** — for CI/CD pipeline execution
- (Optional) **MySQL** — for database audit logging and DB-sourced test data

---

## 🚀 Installation

```bash
# Clone the repository
git clone <repository-url>
cd playwright-pom-core-ts

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
| `env.qe` | QE/Test environment (default) |
| `env.dev` | Development environment |
| `env.stag` | Staging environment |
| `env.prod` | Production environment |

Switch environments by setting `TEST_ENV`:

```bash
# Run tests against the dev environment
TEST_ENV=dev npx playwright test

# Run tests against staging
TEST_ENV=stag npx playwright test
```

### Environment File Structure (`env.qe`)

```properties
# Application URLs
BASE_URL=https://your-app.example.com
API_URL=https://your-app.example.com/rest/actors

# Runtime Configuration
TEST_DATA_SOURCE=json          # json | csv | excel | db
RUN_MODE=local                 # local | remote
RETRY=0
LOG_RESPONSE=no                # yes | no

# Authentication (OAuth2)
AUTH_TYPE=oauth2                # oauth2 | basic | apikey | none
ACCESS_TOKEN_URL=https://keycloak.example.com/token
CLIENT_ID=my-client
CLIENT_SECRET=my-secret
AUTH_USERNAME=testuser
AUTH_PASSWORD=testpass

# Application Login (Keycloak)
APP_USERNAME=testuser
APP_PASSWORD=testpass

# Database
AUDIT_LOG_DB=true
DB_TYPE=mysql                  # mysql | sqlite

# Reporting
SEND_RESULT_ELK=no             # yes | no

# Framework
SERVICE_NAME=my-service
```

### Configuration Access in Code

Use the type-safe `ConfigProperties` enum and `getConfigValue()` helper:

```typescript
import { ConfigProperties, getConfigValue, getConfigBoolean } from '../enums/configProperties';

// Get string values
const baseUrl = getConfigValue(ConfigProperties.APP_URL);
const apiUrl  = getConfigValue(ConfigProperties.API_URL);

// Get boolean values
const shouldAudit = getConfigBoolean(ConfigProperties.AUDIT_LOG_DB, false);
const sendToElk   = getConfigBoolean(ConfigProperties.SEND_RESULT_ELK, false);
```

### Path Aliases (tsconfig.json)

The framework provides path aliases for cleaner imports:

```typescript
import { LoginPage }           from '@pages/LoginPage';
import { NavigationComponent } from '@components/NavigationComponent';
import { test }                from '@fixtures/base.fixture';
import { Logger }              from '@utils/logger';
import { getDataSourceConfig } from '@config/dataSource.config';
```

---

## 🏗 Architecture Overview

The framework is organized in **8 layered tiers**:

```
┌─────────────────────────────────────────────────────────────────┐
│  L1 — CI/CD & Trigger                                          │
│  GitLab CI → Docker → npm ci → npx playwright test             │
├─────────────────────────────────────────────────────────────────┤
│  L2 — Configuration                                            │
│  playwright.config.ts ← envLoader ← env.{name} files           │
├─────────────────────────────────────────────────────────────────┤
│  L3 — Global Lifecycle                                         │
│  global-setup → ExecutionContext → DataPreprocessor → Teardown  │
├─────────────────────────────────────────────────────────────────┤
│  L4 — Fixtures & Test Hooks                                    │
│  base.fixture → beforeEach/afterEach → Lifecycle Manager        │
├─────────────────────────────────────────────────────────────────┤
│  L5 — Page Object Model & Components                           │
│  BasePage → LoginPage, AccountReviewPage                        │
│  BaseComponent → Navigation, Modal, Form                        │
├─────────────────────────────────────────────────────────────────┤
│  L6 — Data Layer                                               │
│  DataProvider → JSON / CSV / Excel / DB Readers                 │
├─────────────────────────────────────────────────────────────────┤
│  L7 — Authentication & API                                     │
│  AuthorizationManager → RequestBuilder → AuthContextFactory     │
├─────────────────────────────────────────────────────────────────┤
│  L8 — Reporting & Utilities                                    │
│  HTML, Allure, Email, DB Audit, ELK, Logger, Network Helpers    │
└─────────────────────────────────────────────────────────────────┘
```

### Execution Workflow

```
Git Push → GitLab CI → Docker Container
  → npm ci → npx playwright test
    → Global Setup (auth dir, ExecutionContext, DataPreprocessor)
      → Auth Setup Project (browser login → storageState)
        → Test Execution (beforeEach → Test Body → afterEach)
          → Reporter Aggregation (HTML, Allure, Email, DB, ELK)
            → Global Teardown (close pools, restore data, summary)
              → CI Artifacts (playwright-report/, allure-results/, logs/)
```



---

## 🧩 Core Concepts

### 1. Page Object Model (POM)

Every page in the application extends `BasePage`, which provides 50+ built-in methods for navigation, waits, element interactions, state checks, and assertions.

**BasePage provides:**
- **Navigation**: `navigate()`, `navigateTo(url)`, `reload()`, `goBack()`, `goForward()`
- **Waits**: `waitForPageLoad()`, `waitForElement()`, `waitForText()`, `waitForUrl()`
- **Actions**: `click()`, `type()`, `clear()`, `check()`, `uncheck()`, `selectOption()`, `hover()`, `dragAndDrop()`
- **Getters**: `getText()`, `getValue()`, `getAttribute()`, `getCount()`, `getUrl()`, `getTitle()`
- **State Checks**: `isVisible()`, `isEnabled()`, `isChecked()`, `isEditable()`
- **Assertions**: `assertVisible()`, `assertText()`, `assertTitle()`, `assertUrl()`, `assertEnabled()`
- **Screenshots**: `takeScreenshot()`, `scrollIntoView()`

**Creating a Page Object:**

```typescript
// src/pages/DashboardPage.ts
import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
    // Required abstract properties
    readonly pageUrl: string = '/app/dashboard';
    readonly pageTitle: string | RegExp = /Dashboard/;

    // Page-specific locators
    readonly welcomeMessage: Locator;
    readonly statsCard: Locator;
    readonly settingsButton: Locator;

    constructor(page: Page) {
        super(page);
        this.welcomeMessage = page.getByRole('heading', { name: 'Welcome' });
        this.statsCard = page.locator('[data-testid="stats-card"]');
        this.settingsButton = page.getByRole('button', { name: 'Settings' });
    }

    // Page-specific actions
    async assertDashboardLoaded(): Promise<void> {
        this.logger.info('Asserting dashboard is loaded');
        await this.assertVisible(this.welcomeMessage);
        await this.assertVisible(this.statsCard);
    }

    async openSettings(): Promise<void> {
        this.logger.info('Opening settings');
        await this.click(this.settingsButton);
    }

    async getStatsCount(): Promise<number> {
        return await this.getCount(this.statsCard);
    }
}
```

### 2. Component-Based Architecture

Reusable UI fragments (navbars, modals, forms) extend `BaseComponent`. Each component is **scoped to a root locator**, so all child queries are relative — preventing selector collisions.

```typescript
// src/components/SearchBarComponent.ts
import { Locator, Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

export class SearchBarComponent extends BaseComponent {
    constructor(page: Page) {
        super(page, '[data-testid="search-bar"]');
    }

    async search(term: string): Promise<void> {
        await this.getByPlaceholder('Search…').fill(term);
        await this.getByRole('button', { name: 'Search' }).click();
    }

    async clearSearch(): Promise<void> {
        await this.getByPlaceholder('Search…').clear();
    }
}
```

**Built-in components available as fixtures:**
- `NavigationComponent` — Header/nav bar (logo, menu items, search, user menu)
- `ModalComponent` — Dialog/modal interactions (confirm, dismiss, assertions)
- `FormComponent` — Form fields (fill, submit, validate, error messages)

### 3. Custom Fixtures

The framework extends Playwright's test with custom fixtures:

```typescript
import { test } from '../src/fixtures/base.fixture';

// Available fixtures in every test:
test('example', async ({
    page,              // Standard Playwright page
    navigation,        // NavigationComponent instance
    modal,             // ModalComponent instance
    form,              // FormComponent instance
    logger,            // Per-test Logger instance
    authenticatedPage, // Page with pre-loaded auth state
    apiRequest,        // API request context for REST calls
    testCaseId,        // Test case ID (set via test.use)
    testCaseName,      // Test case name (set via test.use)
    testCaseData,      // Auto-loaded test data by testCaseId
}) => {
    // Your test code here
});
```

**For API-only tests**, use the API fixture:

```typescript
import { test } from '../src/fixtures/api.fixture';

test('API test', async ({
    apiContext,        // Raw Playwright API request context
    api,              // ApiHelper with typed methods + auth-retry
    authenticatedApi, // Pre-authenticated request context with Bearer token
}) => {
    // api.get(), api.post(), api.authGet(), api.authPost(), etc.
});
```

### 4. Test Lifecycle (beforeEach / afterEach)

The framework automatically manages the test lifecycle:

**beforeEach:**
1. Hydrates `ExecutionContext` from serialized env
2. Sets iteration number from retry count
3. Tracks current test in `CurrentTestTracker`
4. Calls `onTestStart()` in `TestLifecycleManager`

**afterEach:**
1. Calls `onTestEnd()` — records pass/fail/skip metrics
2. Captures screenshot on failure
3. Attaches page state on failure
4. Syncs test metrics to Allure
5. Logs result to database (if `AUDIT_LOG_DB=true`)
6. Pushes metrics to ELK (if `SEND_RESULT_ELK=yes`)

### 5. Data-Driven Testing

The framework supports **4 data sources** that are auto-unified to JSON during global setup:

| Source | File | Env Value |
|--------|------|-----------|
| JSON | `src/data/runnerManager.json` | `TEST_DATA_SOURCE=json` |
| CSV | `src/data/runnerManager.csv` | `TEST_DATA_SOURCE=csv` |
| Excel | `src/data/runnerManager.xlsx` | `TEST_DATA_SOURCE=excel` |
| Database | SQLite/MySQL | `TEST_DATA_SOURCE=db` |

**Data format** (same across all sources):

| Field | Description |
|-------|-------------|
| `id` | Unique test case ID (e.g., `TC-AUTH-001`) |
| `testName` | Programmatic test name |
| `testTitle` | Human-readable test title |
| `testDescription` | Detailed description |
| `shouldComplete` | Whether the test should run to completion |
| `expectedCount` | Expected result count |
| `tags` | Pipe-delimited tags (e.g., `smoke\|auth`) |
| `enabled` | `true`/`false` — controls test execution |

**How it works:**

1. **Global Setup** → `DataPreprocessor.preprocess()` reads the configured source and converts it to `runnerManager.json`
2. **Test Runtime** → `DataProvider.getInstance()` reads the unified JSON
3. **Per-test** → Use `testCaseId` fixture to auto-load specific test data

```typescript
// Link test to data row by ID
test.describe('Login Tests', () => {
    test.use({ testCaseId: 'TC-AUTH-001' });

    test('verify login page loads', async ({ page, testCaseData }) => {
        // testCaseData is auto-loaded from runnerManager.json
        // where id === 'TC-AUTH-001'
        console.log(testCaseData);
        // { id: 'TC-AUTH-001', testName: 'loginPageLoad', ... }
    });
});
```

### 6. Authentication

The framework supports multiple authentication strategies:

| Strategy | Config Value | Description |
|----------|--------------|-------------|
| **OAuth2** | `AUTH_TYPE=oauth2` | Client-credentials flow with auto-refresh |
| **Basic Auth** | `AUTH_TYPE=basic` | HTTP Basic Authentication |
| **API Key** | `AUTH_TYPE=apikey` | API Key in headers |
| **None** | `AUTH_TYPE=none` | No authentication |

**OAuth2 Flow:**
1. `AuthorizationManager` fetches token from `ACCESS_TOKEN_URL` using client credentials
2. Tokens are **cached in memory** and auto-refreshed on expiry
3. `executeWithAuthRetry()` automatically injects Bearer token and **retries on 401/403**

```typescript
import { executeWithAuthRetry } from '../src/auth/requestBuilder';

// Auto-authenticated API call with retry
const response = await executeWithAuthRetry(
    apiRequest,
    'GET',
    './guarantor/28114/notes?page=1&pageSize=10',
    {},       // options
    testInfo, // for metrics tracking
);
expect(response.status()).toBe(200);
```

**Browser Authentication (Storage State):**
- The `auth-setup` project runs before all browser tests
- Performs Keycloak login and saves session to `.auth/user.json`
- All browser projects load this storage state automatically

### 7. Custom Annotations

Tag tests with metadata that flows into Allure and HTML reports:

```typescript
import { withAnnotation } from '../src/annotations';
import { CategoryType } from '../src/enums/categoryType';

test('checkout flow', async ({ page }, testInfo) => {
    withAnnotation(testInfo, {
        authors: ['Alice', 'Bob'],
        categories: [CategoryType.SMOKE, CategoryType.UI],
        description: 'End-to-end checkout with payment validation',
    });

    // ... test steps
});
```

**Available categories:**
`HIGH_LEVEL` · `SMOKE` · `REGRESSION` · `SANITY` · `FULL_REGRESSION` · `API` · `UI` · `PERFORMANCE` · `ACCESSIBILITY` · `VISUAL`

---

## 📝 How to Create a Test Script

### Step-by-Step Guide

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
        this.logger.info(`Selecting product: ${name}`);
        await this.click(this.page.getByText(name));
    }

    async addToCart(): Promise<void> {
        this.logger.info('Adding product to cart');
        await this.click(this.addToCartButton);
    }

    async assertCartCount(expected: number): Promise<void> {
        await this.assertText(this.cartBadge, String(expected));
    }
}
```

#### Step 2: Create the Test Spec File

Test files go in the `tests/` directory and must match `**/*.spec.ts`.

```typescript
// tests/products/product-add-to-cart.spec.ts
import { test } from '../../src/fixtures/base.fixture';
import { expect } from '@playwright/test';
import { withAnnotation } from '../../src/annotations';
import { CategoryType } from '../../src/enums/categoryType';
import { ConfigProperties, getConfigValue } from '../../src/enums/configProperties';
import { LoginPage } from '@pages/LoginPage';
import { ProductPage } from '@pages/ProductPage';

test.describe('Product Cart Functionality', () => {
    // Link to test data row (optional)
    test.use({ testCaseId: 'TC-PROD-001' });

    test('verifyUserCanAddProductToCart', async ({ page }, testInfo) => {
        // 1. Add annotations for reporting
        withAnnotation(testInfo, {
            authors: ['YourName'],
            categories: [CategoryType.REGRESSION, CategoryType.UI],
            description: 'Verify user can add a product to cart and see updated badge count',
        });

        // 2. Initialize page objects
        const loginPage = new LoginPage(page);
        const productPage = new ProductPage(page);

        // 3. Login
        await loginPage.navigate();
        await loginPage.assertLoginPageLoaded();
        await loginPage.login(
            getConfigValue(ConfigProperties.APP_USERNAME),
            getConfigValue(ConfigProperties.APP_PASSWORD),
        );

        // 4. Perform test actions
        await productPage.navigate();
        await productPage.selectProduct('Widget Pro');
        await productPage.addToCart();

        // 5. Assert results
        await productPage.assertCartCount(1);
    });
});
```

#### Step 3: Run the Test

```bash
# Run specific test file
npx playwright test tests/products/product-add-to-cart.spec.ts

# Run with specific browser
npx playwright test tests/products/product-add-to-cart.spec.ts --project=chromium
```

---

## 📚 Examples

### Example 1: Real-World UI + API Validation Test

This is an actual test from the framework — creates a note via UI and validates it via API:

```typescript
// tests/collection/guarantor/collections-guarantor-note-create.spec.ts
import { test } from '../../../src/fixtures/base.fixture';
import { expect } from '@playwright/test';
import { withAnnotation } from '../../../src/annotations';
import { CategoryType } from '../../../src/enums/categoryType';
import { ConfigProperties, getConfigValue } from '../../../src/enums/configProperties';
import { LoginPage } from '@pages/LoginPage';
import { AccountReviewPage } from '@pages/AccountReviewPage';
import { executeWithAuthRetry } from '../../../src/auth/requestBuilder';
import { verifyJsonKeyValues } from '../../../src/utils/apiResponseUtils';
import { retrieveRowData } from '../../../src/utils/databaseQueryExecutor';

const NOTE_TEXT = 'test';

test.describe('Guarantor Account Note - UI to API Validation', () => {
    test.use({ testCaseId: 'TC-AUTH-002' });

    test('verifyUserCanCreateGuarantorAccountNote_AndValidateInAPI',
        async ({ page, apiRequest }, testInfo) => {
        // Fetch test data from database
        const row = await retrieveRowData(
            "SELECT * FROM guarantor_account WHERE guarantor_id IS NOT NULL LIMIT 1"
        );
        let guarantorId: string = row.guarantor_id;

        // Annotate for Allure reporting
        withAnnotation(testInfo, {
            authors: ['Gukan'],
            categories: [CategoryType.REGRESSION, CategoryType.UI],
            description: `Search guarantor ${guarantorId}, add note, verify in History & API`,
        });

        // UI Flow — Login → Search → Add Note → Save
        const loginPage = new LoginPage(page);
        const accountReviewPage = new AccountReviewPage(page);

        await loginPage.navigate();
        await loginPage.assertLoginPageLoaded();
        await loginPage.login(
            getConfigValue(ConfigProperties.APP_USERNAME),
            getConfigValue(ConfigProperties.APP_PASSWORD),
        );

        await accountReviewPage.assertTabIsActive();
        await accountReviewPage.searchGuarantor(guarantorId);
        await accountReviewPage.selectRow();
        await accountReviewPage.fillNote(NOTE_TEXT);
        await accountReviewPage.clickSave();
        await accountReviewPage.confirmSave();
        await accountReviewPage.assertSaveNotification();
        await accountReviewPage.assertNoteInHistory(NOTE_TEXT);

        // API Validation — verify note exists via REST endpoint
        const response = await executeWithAuthRetry(
            apiRequest, 'GET',
            `./guarantor/${guarantorId}/notes?page=1&pageSize=1&order=DESC&sort=createdDate`,
            {}, testInfo,
        );
        expect(
            await verifyJsonKeyValues(response, { accountNote: NOTE_TEXT }),
            `Expected accountNote to contain "${NOTE_TEXT}"`,
        ).toBeTruthy();
    });
});
```

### Example 2: Pure API Test

```typescript
// tests/api/user-api.spec.ts
import { test } from '../../src/fixtures/api.fixture';
import { expect } from '@playwright/test';

test.describe('User API Tests', () => {
    test('GET /users returns 200', async ({ api }) => {
        const response = await api.get<{ id: number; name: string }[]>('/users');
        api.assertSuccess(response);
        api.assertStatus(response, 200);
        expect(response.data.length).toBeGreaterThan(0);
    });

    test('authenticated GET with auto-retry', async ({ api }) => {
        // Uses OAuth2 token, auto-retries on 401/403
        const response = await api.authGet('./guarantor/28114/notes?page=1&pageSize=1');
        expect(response.status()).toBe(200);
    });
});
```

### Example 3: Test with Network Mocking

```typescript
// tests/mocking/mock-api-response.spec.ts
import { test } from '../../src/fixtures/base.fixture';
import { expect } from '@playwright/test';
import { mockRoute, blockResources, captureRequests } from '../../src/utils/networkHelper';

test('mock API response', async ({ page }) => {
    // Mock the API to return test data
    await mockRoute(page, '**/api/products', {
        status: 200,
        body: [
            { id: 1, name: 'Mocked Product', price: 9.99 },
        ],
    });

    // Block images and fonts for faster test execution
    await blockResources(page, ['image', 'font']);

    await page.goto('/products');
    await expect(page.getByText('Mocked Product')).toBeVisible();
});
```

### Example 4: Data-Driven Test with Database Query

```typescript
// tests/data-driven/dynamic-data.spec.ts
import { test } from '../../src/fixtures/base.fixture';
import { expect } from '@playwright/test';
import { retrieveRowData } from '../../src/utils/databaseQueryExecutor';
import { LoginPage } from '@pages/LoginPage';

test.describe('Data-Driven Tests', () => {
    test.use({ testCaseId: 'TC-AUTH-003' });

    test('verify account with DB data', async ({ page, testCaseData }) => {
        // testCaseData auto-loaded from runnerManager based on testCaseId
        console.log('Test data:', testCaseData);

        // Or fetch dynamic data from application database
        const dbRow = await retrieveRowData(
            "SELECT * FROM accounts WHERE status = 'active' LIMIT 1"
        );

        const loginPage = new LoginPage(page);
        await loginPage.navigate();
        await loginPage.login(dbRow.username, dbRow.password);
    });
});
```

---

## ▶️ Running Tests

### Basic Commands

```bash
# Run all tests (default browser)
npx playwright test

# Run specific project/browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Run specific test file
npx playwright test tests/collection/guarantor/collections-guarantor-note-create.spec.ts

# Run tests matching a grep pattern
npx playwright test --grep "login"
npx playwright test --grep "@smoke"

# Run in headed mode (see the browser)
npx playwright test --headed

# Run in debug mode (step through)
npx playwright test --debug

# Run with specific number of workers
npx playwright test --workers=4

# Run with retries
npx playwright test --retries=2
```

### Environment-Specific Execution

```bash
# Run against QE environment (default)
TEST_ENV=qe npx playwright test

# Run against dev environment
TEST_ENV=dev npx playwright test

# Run against staging
TEST_ENV=stag npx playwright test

# Override specific config values
RETRY=2 LOG_RESPONSE=yes npx playwright test
```

### View Reports

```bash
# Open HTML report
npx playwright show-report

# Generate and open Allure report
npx allure generate allure-results --clean -o allure-report
npx allure open allure-report
```

---

## 🔄 CI/CD Integration

### GitLab CI/CD

The framework includes a ready-to-use `.gitlab-ci.yml`:

```yaml
stages:
  - test

variables:
  npm_config_cache: "$CI_PROJECT_DIR/.npm"

cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - .npm
    - node_modules

playwright-tests:
  stage: test
  image: mcr.microsoft.com/playwright:v1.58.2-noble
  script:
    - npm install
    - npm ci
    - npx playwright test --project=chromium
  artifacts:
    when: always
    paths:
      - playwright-report/
      - allure-results/
      - test-results/
      - logs/
    expire_in: 30 days
  allow_failure: false
```

**CI-specific behavior:**
- Workers: Automatically set to **2** on CI (unlimited locally)
- Retries: Defaults to **2** on CI (0 locally), overridable via `RETRY` env var
- `test.only()`: **Blocked** on CI (`forbidOnly: true`)
- Artifacts: Reports, logs, and test results collected for 30 days

---

## 📊 Reporting

The framework generates **6 simultaneous reports**:

| Reporter | Output | Description |
|----------|--------|-------------|
| **List** | Console | Real-time test progress in terminal |
| **HTML** | `playwright-report/` | Interactive HTML report with traces |
| **JSON** | `test-results/results.json` | Machine-readable JSON results |
| **JUnit** | `test-results/junit.xml` | CI/CD compatible XML report |
| **Allure** | `allure-results/` | Rich report with screenshots, steps, metrics |
| **Email** | SMTP delivery | Custom reporter sends email with HTML report |

**Additional integrations:**
- **Database Audit Logger** — Logs every test result to MySQL (`AUDIT_LOG_DB=true`)
- **ELK Dashboard** — Pushes test metrics to Elasticsearch (`SEND_RESULT_ELK=yes`)

**Automatic artifacts on failure:**
- 📸 Screenshot capture
- 🎥 Video recording (on first retry)
- 📋 Trace file (on first retry)
- 📄 Page state (HTML snapshot)

---

## 🔧 Advanced Features

### Network Helpers

```typescript
import {
    mockRoute,           // Mock API responses
    blockResources,      // Block images/fonts/css for speed
    captureRequests,     // Capture network requests during action
    addLatency,          // Simulate network delays
    mockMultipleRoutes,  // Mock multiple endpoints at once
    interceptAndModify,  // Intercept and modify requests/responses
    waitForApiResponse,  // Wait for specific API response
    recordHar,           // Record HAR file for replay
    replayHar,           // Replay recorded HAR file
} from '../src/utils/networkHelper';
```

### API Mock Server

```typescript
import { ApiMockServer } from '../src/utils/apiMockServer';

// Create mock server for API stubbing
const mockServer = new ApiMockServer();
mockServer.stub('GET', '/api/users', { status: 200, body: [...] });
```

### Database Queries

```typescript
import { retrieveRowData } from '../src/utils/databaseQueryExecutor';

// Execute SQL and get a single row
const row = await retrieveRowData("SELECT * FROM users WHERE id = 1");
console.log(row.username);
```

### Soft Assertions

```typescript
import { SoftAssertions } from '../src/utils/softAssertions';

// Collect multiple assertion failures without stopping the test
const soft = new SoftAssertions();
soft.assertEqual(actual, expected, 'Values should match');
soft.assertTrue(condition, 'Condition should be true');
soft.assertAll(); // Throws if any assertion failed
```

### Visual Regression

```typescript
import { compareScreenshots } from '../src/utils/visualRegression';

// Compare current screenshot against baseline
await compareScreenshots(page, 'login-page-baseline');
```

### Performance Monitoring

```typescript
import { PerformanceMonitor } from '../src/utils/performanceMonitor';

// Track page load metrics
const monitor = new PerformanceMonitor(page);
const metrics = await monitor.getPageMetrics();
console.log(`Load time: ${metrics.loadTime}ms`);
```

### Error Handler Decorator

```typescript
import { HandleError } from '../src/decorators/errorHandler.decorator';

class MyPage extends BasePage {
    @HandleError('Failed to perform action')
    async riskyAction(): Promise<void> {
        // Automatically catches and logs errors with context
    }
}
```

### Execution Context

```typescript
import { ExecutionContext } from '../src/context/executionContext';

// Access run-level metadata
const ctx = ExecutionContext.snapshot();
console.log(ctx.runId);        // UUID for this test run
console.log(ctx.triggeredBy);  // 'gitlab-ci' | 'github-actions' | 'manual-run'
console.log(ctx.branch);       // Current git branch
console.log(ctx.environment);  // 'dev' | 'qe' | 'stag' | 'prod'
```
---
