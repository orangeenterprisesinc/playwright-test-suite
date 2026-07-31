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
- [The migrated web-pet suite](#-the-migrated-web-pet-suite-testswebpet)
- [Linting](docs/LINTING.md)
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
| **Observability** | Structured logging (file + console), execution context tracking, test metrics, screenshots/video/trace |
| **Utilities** | Run-unique test-data factories, SQL cleanup registry, Allure label derivation, direct JSON/CSV readers |

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

One folder per concern, at most two levels deep. The repo root holds only what a
tool discovers there by convention (`playwright.config.ts`, `tsconfig.json`,
`package.json`, `.mcp.json`); everything else is grouped. Each subsystem reads as
**mechanism / storage / consumers** — see [docs/STRUCTURE.md](docs/STRUCTURE.md)
for the full map and the rationale.

```
playwright-test-suite/
├── playwright.config.ts              # Playwright config (root by convention)
├── tsconfig.json                     # TS compiler config + path aliases
├── package.json                      # Dependencies and scripts
├── .mcp.json                         # MCP servers (Claude Code reads root only)
│
├── .env.local  .env.dev  .env.qa     # committed per-environment config; any
│                                     #   sensitive value stored as ENC(...)
├── .env.example                      # documented template
├── .env                              # personal overrides + SECRET_KEY (gitignored)
│
├── config/                           # ALL configuration, grouped by tool
│   ├── lint/.eslintrc.json           #   code standards
│   ├── lint/.prettierrc.json
│   ├── notifications/recipients.csv  #   per-branch/trigger email routing
│   └── scopes/anthony-vineyards.json #   per-customer segments + modules (TEST_SCOPE)
│
├── docker/                           # ALL Docker
│   ├── Dockerfile                    #   the test image
│   ├── Dockerfile.dockerignore       #   BuildKit per-Dockerfile ignore
│   ├── e2e/                          #   containerized app stack (compose + DB restore)
│   └── db-backup/                    #   local SQL backups (gitignored, never committed)
│
├── .vscode/                          # Editor: points at config/lint, debug configs
├── .github/workflows/                # 4 pipelines (journey + webpet, dev + local)
│
├── artifacts/                        # ALL run output — one .gitignore line
│   ├── results/                      #   results.json, traces, videos, screenshots
│   ├── html/                         #   Playwright HTML report
│   ├── allure/results  allure/report #   Allure raw + generated (report/history = trends)
│   └── logs/                         #   app-<date>.log
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
│   │   ├── FormComponent.ts          #   Form field interactions
│   │   └── DataGridComponent.ts      #   The PET Tiger list grid (filters, rows, totals)
│   │
│   ├── config/                       # Configuration management
│   │   ├── envLoader.ts              #   Loads .env.local/dev/qa files
│   │   ├── dataSource.config.ts      #   Runner directory / JSON+CSV path resolution
│   │   └── scope.ts                   #   TEST_SCOPE segment + module filtering
│   │
│   ├── context/                       # Execution & test context
│   │   ├── executionContext.ts        #   Run-level metadata (runId, branch, CI trigger)
│   │   ├── testMetrics.ts            #   Per-test metrics collection
│   │   └── testRunContext.ts          #   Iteration tracking & current test tracker
│   │
│   ├── core/                          # Single-file framework primitives (no folder each)
│   │   ├── frameworkConstants.ts      #   Framework-wide path constants
│   │   └── frameworkExceptions.ts     #   FrameworkError and subclasses
│   │
│   ├── data/                          # ONE data home — four kinds + the mechanism
│   │   ├── runner/                    #   STORAGE: runner rows, one file per journey
│   │   │   ├── journey-a.csv          #     authored (Excel-friendly)
│   │   │   ├── journey-a.json         #     generated mirror (npm run runner:sync)
│   │   │   ├── journey-b..f.{csv,json}
│   │   │   ├── system.{csv,json}      #     login/auth — not catalog workflows
│   │   │   └── ../runnerList.json     #     runtime override by row id (ships as {})
│   │   ├── static/                    #   STORAGE: typed value bags (fixed data)
│   │   │   ├── journey-a/userSetupData.ts
│   │   │   ├── system/loginModuleData.ts
│   │   │   └── shared/                #     modules.ts, segments.ts, cleanupTargets.ts
│   │   ├── generated/                 #   RANDOMIZED: run-unique factories
│   │   │   ├── userFactory.ts         #     makeUser(overrides) → unique NewUserData
│   │   │   └── random.ts              #     uid(), randomInitials(), randomEmail()
│   │   ├── catalog/workflow-catalog.json  # REFERENCE: 69 workflows (npm run catalog:import)
│   │   ├── readers/                   #   MECHANISM: how any of it is read
│   │   │   ├── DataProvider.ts        #     singleton JSON/CSV provider (no conversion step)
│   │   │   ├── BaseDataReader.ts      #     shared caching/filtering/availability
│   │   │   ├── JsonDataReader.ts  CsvDataReader.ts
│   │   │   ├── MultiFileDataReader.ts #     reads the per-journey runner dir as one set
│   │   │   └── TypeCoercionHelper.ts  #     coerces CSV strings to typed values
│   │   └── webpet/                    #   the migrated suite's own rows + ids (separate)
│   │
│   ├── fixtures/                      # Playwright fixtures, gate, and run lifecycle
│   │   ├── base.fixture.ts            #   UI fixtures + the 3-layer execution gate
│   │   ├── pages.fixture.ts           #   Lazy `pages` accessor for every page object
│   │   ├── api.fixture.ts             #   API-only test fixtures + ApiHelper class
│   │   ├── webpet*.fixture.ts         #   the migrated suite's fixtures (separate)
│   │   ├── gate/                      #   run-or-skip decision (the Runner Manager)
│   │   │   ├── executionGate.ts       #     the 3-layer rules
│   │   │   ├── methodInterceptor.ts   #     layer 1: runnerList.json override
│   │   │   └── webpetGate.ts          #     the migrated suite's gate wrapper
│   │   └── lifecycle/                 #   one-time + per-test lifecycle
│   │       ├── global-setup.ts        #     auth dir, artifact dirs, Allure categories
│   │       ├── global-teardown.ts     #     Allure env/executor metadata, cleanup sweep
│   │       └── testLifecycleManager.ts#     onTestStart/onTestEnd, pass/fail/skip tracking
│   │
│   ├── pages/                         # Page Objects — grouped by app menu area
│   │   ├── BasePage.ts                #   Abstract base — navigation, waits, screenshots
│   │   ├── SetupScreenPage.ts         #   Shared list+form base: grid, on-blur save, edit bar
│   │   ├── shell/                     #   LoginPage, LeftNavigationPage
│   │   ├── admin/                     #   File > Administration — UsersPage, ...
│   │   ├── setup/                     #   Input > Setup — Ranch, Field, Crop, Job, Crew, ...
│   │   ├── processing/                #   Input > Transfer to Job Card, Multi-edit
│   │   ├── payroll/                   #   Export to Accounting, Reverse Export
│   │   ├── connectivity/              #   Import Internet (Post Office)
│   │   └── analysis/                  #   Reports, dashboards
│   │
│   ├── reporting/                     # generation / delivery / recipients
│   │   ├── summary/runSummary.ts      #   ONE render-agnostic model, every channel reuses it
│   │   ├── generate/allure/           #   MECHANISM: how a report is built
│   │   │   ├── report.ts              #     Allure generation (CI + lean email variant)
│   │   │   └── labels.ts              #     Allure labels + resolves the runner row id
│   │   ├── deliver/                   #   CHANNELS: where the summary goes
│   │   │   ├── slackReporter.ts       #     PRIMARY: one report per suite, per CI run
│   │   │   ├── slack/                 #     the Slack module
│   │   │   │   ├── gate.ts            #       CI-events-only rule (no local, no manual)
│   │   │   │   ├── blocks.ts          #       Block Kit layout (report + reminder)
│   │   │   │   └── slackApi.ts        #       webhook, chat.postMessage, file upload
│   │   │   ├── emailReporter.ts       #     DEPRECATED: email + lean Allure attachment
│   │   │   └── dashboard.ts           #     ELK/Elasticsearch dashboard push
│   │   └── recipients/recipients.ts   #   WHO: per-branch/trigger routing (email only)
│   │                                  #     (table: config/notifications/recipients.csv)
│   │                                  #   WHERE reports are STORED: artifacts/ (above)
│   │
│   ├── types/                         # TypeScript type definitions
│   │   └── index.ts                   #   All interfaces & types
│   │
│   └── utils/                         # Genuinely cross-cutting only — 3 files
│       ├── logger.ts                  #   Structured logger (file + console)
│       └── db/                        #   Direct SQL access for setup/cleanup
│           ├── sqlClient.ts           #   runSql(), sqlLiteral()
│           └── cleanupRegistry.ts     #   `cleanup` fixture + end-of-run sweep
│
├── tests/                             # Specs — TWO folders (browser vs no browser), journey inside
│   ├── auth.setup.ts                  #   Keycloak login → storageState (auth-setup project)
│   ├── seed.spec.ts
│   ├── api/                           #   API-only (api.fixture) — browserless `api` project
│   │   ├── journey-a-setup/           #     A6 biometric enrollment
│   │   ├── journey-b-field/           #     B1-B15 device capture — reserved
│   │   └── journey-c-packhouse/       #     C1-C10 kiosk capture — reserved
│   ├── web/                           #   Browser-driven (base.fixture + POM): UI-only AND
│   │   │                              #     UI+API(+DB) hybrids, the latter tagged @Workflow
│   │   ├── system/login-module.spec.ts#     logged-out login module
│   │   ├── journey-a-setup/           #     A1-A14 — a01-user-setup.spec.ts is the reference
│   │   ├── journey-b-field/           #     B14 real-time field dashboard
│   │   ├── journey-d-office/          #     D1-D8, plus D9-D10 transfer-time calculations
│   │   ├── journey-e-payroll/         #     E8-E11, plus E1-E7/E12-E13 payroll calculations
│   │   └── journey-f-analysis/        #     F1-F7
│   └── webpet/                        #   migrated web-pet suite — 406 tests, runs separately
│                                      #     own fixture/pages/runner/projects; see below
│
├── test-plans/                             # One markdown plan per workflow (written first)
│   ├── _template.md
│   └── journey-a/a01-user-setup.md    #   worked example
│
├── docs/                              # STRUCTURE.md, FRAMEWORK-GUIDE.md, LINTING.md,
│   ├── catalog/                       #   PET-Tiger-Workflow-Catalog.docx — source of truth
│   └── media/                         #   screen recordings referenced by the plans
└── scripts/                           # npm-script helpers, grouped by what they serve
    ├── run-playwright.js              #   shim-free launcher (paths with & / spaces)
    ├── runner/                        #   the Runner Manager's tooling
    │   ├── sync.js                    #     runner CSV -> JSON mirror
    │   ├── check.js                   #     validates rows <-> specs <-> catalog
    │   ├── coverage.js                #     69-workflow automation coverage
    │   └── lib/runner-data.js         #     shared loader for src/data/runner/
    ├── report/                        #   allure-generate.js, allure-open.js, ensure-java.js
    ├── catalog/import-catalog.js      #   docx -> workflow-catalog.json
    └── webpet/                        #   the migrated suite's own tooling
        ├── runner-sync.js             #     runner sync / drift check
        ├── ids-check.js               #     static gate: annotations, id maps, tags, imports
        └── baseline{,-diff}.js        #     per-test baseline capture + regression diff
```

The `src/` tree carries a parallel `webpet/` subtree in four places —
`src/pages/webpet/`, `src/components/webpet/`, `src/data/webpet/` and the
`webpet*.fixture.ts` files — for the migrated suite described below. That mirroring
is deliberate: the migrated suite stays structurally parallel to the journey
suites and shares no runtime state with them.

---

## 🐯 The migrated web-pet suite (`tests/webpet/`)

Alongside the journey suites this repo hosts the **PET Tiger app repo's own
Playwright suite** — 406 tests in 56 spec files, lifted from
`web-pet/apps/web/e2e` and converted onto this framework's conventions (page
objects, fixtures, `testCaseId` annotations, tags, path aliases).

It **runs separately by design** and shares no runtime state with the journey
suites:

| | journey suites | `tests/webpet/` |
|---|---|---|
| fixture | `@fixtures/base.fixture` / `api.fixture` | `@fixtures/webpet.fixture` |
| page objects | `src/pages/` | `src/pages/webpet/` (47 screens, 9 components) |
| runner rows | `src/data/runner/` | `src/data/webpet/webpetRunnerManager.csv` |
| ids / tags | `A1-001`, `@JourneyA` | `WP-0001`, `@WebPet` / `@wp-*` |
| projects | `auth-setup` → `chromium` / `api` | `webpet-setup` → `webpet` (opt-in) |
| CI | `e2e.yml`, `e2e-local.yml` | `webpet-e2e-local.yml`, `webpet-e2e-dev.yml` |
| daily run | `dry-run-daily.yml` calls `e2e.yml` … | … then `webpet-e2e-dev.yml` |

```bash
npm run test:webpet                        # whole suite against localhost
npm run test:webpet:dev                    # against dev staging
npm run test:webpet:list                   # collection check — prints 407 tests / 57 files
npm run test:webpet -- --grep @wp-crop     # one module
```

A bare `npx playwright test` never picks it up: the `chromium` project ignores the
folder and the web-pet projects materialize only under `WEBPET=1` or
`--project=webpet`. It also needs the full local web-pet stack (Vite `:3000` → Go
API `:8080` → SQL Server, MinIO, Gotenberg), which is why it is opt-in.

Full documentation: [tests/webpet/README.md](tests/webpet/README.md) — including
the run-control runner, the baseline acceptance gate, and the one rule that must
never be broken (**a web-pet spec may not import `base.fixture`**, or all 406
tests skip while the run reports green).

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
| `.env.local` | Local environment (default) |
| `.env.dev` | Development environment |
| `.env.qa` | QA environment |

Switch environments by setting `TEST_ENV`:

```bash
# Run tests against the dev environment
TEST_ENV=dev npm test

# Run tests against QA
TEST_ENV=qa npm test
```

### Environment File Structure (`.env.qa`)

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
                → CI Artifacts (artifacts/html/, artifacts/allure/report/)
```

---

## 🧩 Core Concepts

### 1. Page Object Model (POM)

Every page in the application extends `BasePage`, which deliberately does **not** wrap Playwright's own `Locator`/`expect` API — those are already one-liners. It keeps only the handful of things that aren't:

**BasePage provides:**
- **Navigation**: `navigate()` (goes to the page object's own `pageUrl`), `navigateTo(url)`
- **Non-trivial helpers**: `waitForCondition()` (custom async-predicate polling — no native equivalent), `takeScreenshot()` / `takeElementScreenshot()` (enforce the repo's `artifacts/results/screenshots/<name>.png` path convention)

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

Managed by `src/fixtures/lifecycle/testLifecycleManager.ts` via `base.fixture.ts`'s `beforeEach`/`afterEach` hooks:

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
| JSON | `src/data/runner/*.json` (generated mirror) | `TEST_DATA_SOURCE=json` (default) |
| CSV | `src/data/runner/*.csv` (authored) | `TEST_DATA_SOURCE=csv` |

**Data format** (same across both sources):

| Field | Description |
|-------|-------------|
| `id` | Unique test case ID (e.g., `UI-001`, `USR-001`) |
| `category` | Test category — `ui` \| `api` \| `workflow`. Three values, two folders: `ui`/`workflow` → `tests/web/`, `api` → `tests/api/` (enforced by `runner:check`) |
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

A row is bound either via a per-test **annotation** (the live pattern in `tests/web/journey-a-setup/a01-user-setup.spec.ts`) or via `test.use({ testCaseId })` — both resolve the same way:

```typescript
// Live pattern — annotation on the test options
test('[User Setup] Verify that ... appears in the Users list.', {
    tag: ['@UI', '@Smoke', '@Local'],
    annotation: { type: 'testCaseId', description: 'A1-002' },
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
> real screen (see `src/pages/admin/UsersPage.ts` for a live reference).

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
// tests/web/products/product-add-to-cart.spec.ts
import { test } from '../../../src/fixtures/base.fixture';

test.describe('Product Cart Functionality', () => {
    test('verifyUserCanAddProductToCart', {
        tag: ['@Regression', '@UI'],
        annotation: { type: 'testCaseId', description: 'A2-001' }, // must exist in src/data/runner/
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
npx playwright test tests/web/products/product-add-to-cart.spec.ts
npx playwright test tests/web/products/product-add-to-cart.spec.ts --project=chromium
```

---

## 📚 Examples

### Example 1: UI Login Test (starts logged out)

```typescript
// tests/web/system/login-module.spec.ts
import { expect, test } from '../../src/fixtures/base.fixture';
import { loginModuleData } from '@data/system/loginModuleData';

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

### Example 3: Workflow — Create in the UI, Verify via the API

A UI + API hybrid: act through Page Objects, then confirm the result through the
REST API in the same test. Import from `base.fixture` (it provides `apiRequest`).

```typescript
// tests/web/journey-a-setup/user-create-verify.spec.ts
import { test, expect } from '../../src/fixtures/base.fixture';
import { executeWithAuthRetry } from '../../src/auth/requestBuilder';
import { makeUser } from '../../src/data/generated';

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
            const body = await response.json();
            expect(JSON.stringify(body)).toContain(user.email);
        });
});
```

> Prefer `/api-script-generator` and `/workflow-script-generator` (repo skills) to
> generate `tests/api/` and `@Workflow`-tagged `tests/web/` specs that follow these conventions.

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

`.github/workflows/e2e.yml` runs the user-journey suite against the **dev staging** deployment. It does **not** boot an app (see `e2e-local.yml` for the localhost variant).

It no longer schedules itself. **`dry-run-daily.yml` owns the daily 4:00 PM IST run** and calls `e2e.yml` first, then `webpet-e2e-dev.yml`, so the two suites never run at the same time against the same dev data:

```
3:50 PM IST   dry-run-reminder.yml   →  one informational Slack message
4:00 PM IST   dry-run-daily.yml      →  User Journey  →  its own Slack report
                                              ↓ (needs:)
                                          WebPet      →  its own Slack report
```

Each suite keeps its own tests, artifacts, Allure report and Slack message — nothing is merged. `e2e.yml` still runs on push to `main`, manual dispatch, and `repository_dispatch` (triggered externally by the app repo); those runs post **no** Slack message (see the Slack section below).

The target comes from `TEST_ENV: dev` in the job env, which makes the framework load `.env.dev` (`BASE_URL=https://app.ptdev.xyz`, `API_URL=https://api.ptdev.xyz/api` — the API is a separate host from the static SPA).

Credentials are split by sensitivity: the password is the **`DEV_PASSWORD` secret** (never committed), and the username is the **`DEV_USER_NAME` variable**, defaulting to `su`. A login name isn't a credential, and storing a short one as a secret is actively harmful — Actions masks every literal occurrence of a secret's value, so `su` gets redacted inside unrelated words (`playwright-test-***ite`, `allure-re***lts`), making logs hard to read. Both are dev-staging-specific with no fallback to generic names: `e2e-local.yml` uses its own `LOCAL_USER_NAME`/`LOCAL_PASSWORD`, and an earlier generic-`PASSWORD` fallback silently logged the dev-staging run in with localhost credentials.

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
  workflow_call:            # dry-run-daily.yml calls this as the User Journey job
  repository_dispatch:
    types: [run-playwright]

# github.workflow is the CALLER's name in a reusable workflow, so an orchestrated
# dry run and a direct push/dispatch run cannot cancel each other.
concurrency:
  group: e2e-${{ github.workflow }}-${{ github.ref }}
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
        with: { path: artifacts/allure/report/history, key: allure-history-${{ github.ref_name }}-${{ github.run_id }} }
      - run: node scripts/report/allure-generate.js
        if: always()
      - uses: actions/upload-artifact@v4    # artifacts/html/ and artifacts/allure/report/
        if: always()
      # Opt-in (SEND_S3=yes): sync artifacts/results/ (traces, videos, results.json) to S3
      - run: aws s3 sync artifacts/results "s3://.../test-results" --no-progress
        if: always() && env.SEND_S3 == 'yes'
```

**CI-specific behavior:**
- Workers: forced to **1** on CI (auth storage state is shared across tests); unlimited locally
- Retries: defaults to **2** on CI (0 locally), overridable via `RETRY`
- `test.only()`: **blocked** on CI (`forbidOnly: true`)
- Test-user cleanup: PET Tiger has no delete-user action in either the UI or the API, so tests that create users remove them in SQL (`DB_CLEANUP=yes`). `DB_TRUSTED` selects the transport — `no` uses the `mssql` driver (pure JS, arrives with `npm ci`, works on GitHub-hosted runners), `yes` uses the `sqlcmd` CLI with Windows integrated auth (local and self-hosted). The remaining requirement is a network route: `DB_SERVER` must accept connections from GitHub runner IPs. `global-setup.ts` probes the connection once at the start of every run and emits a CI error annotation if it fails, because cleanup that skips silently leaves test users behind in a shared database while the run still reports green.
- Notifications & artifact upload are all opt-in: **Slack** (`SEND_SLACK=yes` + `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID`, or a webhook — and only on the CI events in `SLACK_NOTIFY_EVENTS`), **S3 report upload** (`SEND_S3=yes` + AWS secrets), and **Email** (deprecated; `SEND_EMAIL` is pinned to `no`). Unset → each step logs a line and does nothing.

---

## 📊 Reporting

| Reporter | Output | Description |
|----------|--------|-------------|
| **List** | Console | Real-time test progress in terminal |
| **HTML** | `artifacts/html/` | Interactive HTML report with traces |
| **JSON** | `artifacts/results/results.json` | Machine-readable JSON results |
| **GitHub** | Console annotations | Inline failure annotations on GitHub Actions |
| **Allure** | `artifacts/allure/results/` → `artifacts/allure/report/` | Rich report with steps, metrics, trend history |
| **Slack** | Incoming Webhook, or Web API with a bot token | **The primary channel.** Self-gating (`SEND_SLACK=yes`) *and* CI-only — see below. One report per suite: counts, duration, top-5 failing modules, and buttons for the Allure report / workflow run / artifacts. With `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID` it also uploads the lean single-file Allure report into the message's thread |
| **Email** | SMTP delivery | **Deprecated** — still works, but `SEND_EMAIL` is pinned to `no` in every workflow. Attaches a lean single-file Allure report; recipients are routed per branch + trigger — see below |
| **ELK Dashboard** | HTTP POST to `ELK_URL` | Self-gating (`SEND_RESULT_ELK=yes`); pushes a JSON run summary |

### When Slack posts — and when it stays quiet

Slack is a **CI results** channel, so the reporter refuses to post from anywhere else. Three
things must all be true (`src/reporting/deliver/slack/gate.ts`):

1. `SEND_SLACK=yes`
2. `GITHUB_ACTIONS=true` — so `npm test`, `npx playwright test`, `--debug`, `--ui` and any
   laptop run are silent no matter how the env is set
3. the GitHub event is listed in `SLACK_NOTIFY_EVENTS` (default `schedule`) — so a manual
   `workflow_dispatch` and a `repository_dispatch` are silent too

Each refusal logs one line naming the setting that blocked it, so "why didn't it post?" is
answerable from the run log. To get a message out of a test run deliberately, set
`SLACK_NOTIFY_EVENTS` to include that event; to check the layout without a token, use
`SLACK_DRY_RUN=1` and paste the logged payload into Slack's Block Kit Builder.

The reminder message at 3:50 PM IST is the one Slack post that is not a reporter —
`scripts/notify/slack-reminder.ts`, run by `dry-run-reminder.yml`. It applies the same gate.
Preview it with `npm run notify:reminder -- --dry-run`.

### Getting the Allure report into Slack

An Incoming Webhook can only post text — it cannot carry a file. So the Slack reporter
has two modes, and it picks the first one that is fully configured:

| Configured | What lands in Slack |
|------------|---------------------|
| `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID` | Summary via `chat.postMessage`, then the lean single-file **Allure report uploaded as a thread reply** on that message |
| `SLACK_WEBHOOK_URL` only | Summary only. The report appears as a link when `ALLURE_REPORT_URL` is set (CI does this when `SEND_S3=yes`) |

To enable uploads, create a Slack app in the workspace, give the bot the **`chat:write`**
and **`files:write`** scopes, install it, invite it to the channel, then set the token
(`xoxb-…`) and the channel id (`C…`). In CI those are the `SLACK_BOT_TOKEN` secret and the
`SLACK_CHANNEL_ID` variable — already wired into all four workflows.

The uploaded file is the same screenshots-only, single-file report that gets emailed
(video and trace are stripped, so it stays small); it is generated once per run and
shared by both channels. `SLACK_MAX_UPLOAD_MB` (default 20) drops it if it is oversized,
and every failure here — no JVM, bad scope, oversized file — is logged and swallowed:
the summary still posts and the run never fails because of a notification.

### Who gets the email (deprecated)

Recipients are **not** a single list. They are routed per run from
[`config/notifications/recipients.csv`](config/notifications/recipients.csv), so the
nightly cron can reach the whole team while a push to `main` or a laptop run reaches
one person. Edit that CSV — no code change needed.

Each row's `scope` is one of `<branch>:<trigger>`, a bare `<branch>`, a bare
`<trigger>`, or `default`, and the most specific match wins:

```
branch:trigger   →   branch   →   trigger   →   default
```

The trigger tokens are exactly the ones the reporters already produce — `push`,
`scheduled`, `manual`, `external dispatch`, `ci`, `local run` — so there is only one
vocabulary to learn. An **empty** `recipients` cell mutes that context deliberately;
if the file is missing or nothing matches, delivery falls back to the `EMAIL_TO`
variable so a misconfigured table can never silence a report that used to send.

Override the file location with `EMAIL_RECIPIENTS_FILE`. Resolution logic lives in
[`src/reporting/recipients/recipients.ts`](src/reporting/recipients/recipients.ts).

> The 4:00 PM IST scheduled run tests the **`dry-run`** branch (both called workflows pin
> `ref: dry-run` on a `schedule` event), even though `dry-run-daily.yml` itself must live
> on `main` — GitHub only fires `schedule:` from the default branch. `BRANCH_OVERRIDE`
> in those jobs makes the reports, and therefore this routing, name `dry-run`.

**Automatic artifacts** — the config captures all three on **every** test (`screenshot`/`trace`/`video: 'on'`):
- 📸 Screenshot capture
- 🎥 Video recording
- 📋 Trace file

> To trim artifact size/time, switch `trace`/`video` to `'retain-on-failure'` or `'on-first-retry'` in `playwright.config.ts`.

---

## 🔧 Advanced Features

> **Note on network mocking, soft/custom assertions, visual regression,
> performance monitoring and the `@HandleError` decorator:** these were
> speculative utilities that no spec ever imported, and they were removed rather
> than left as a menu of things that had never been exercised. Playwright covers
> each natively — `page.route()`, `expect.soft()`, `toHaveScreenshot()` — so reach
> for the built-in first. The removed implementations are still in git history if
> one turns out to be worth reviving.

### Execution Context

```typescript
import { ExecutionContext } from '../src/context/executionContext';

const ctx = ExecutionContext.snapshot();
console.log(ctx.runId);        // UUID for this test run
console.log(ctx.triggeredBy);  // 'github-actions' | 'gitlab-ci' | 'manual-run'
console.log(ctx.branch);       // Current git branch
console.log(ctx.environment);  // 'local' | 'dev' | 'qa'
```
