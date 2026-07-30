/**
 * @fileoverview Custom Playwright test fixtures for UI testing.
 *
 * Extends Playwright's base `test` object with:
 * - **pages** — Every page object, lazily built (`pages.users`, `pages.leftNav`, …)
 * - **navigation** — Pre-built {@link NavigationComponent} fixture
 * - **modal** — Pre-built {@link ModalComponent} fixture
 * - **form** — Pre-built {@link FormComponent} fixture
 * - **logger** — Per-test {@link Logger} instance
 * - **authenticatedPage** — Page with pre-loaded auth state from `.auth/user.json`
 * - **apiRequest** — Standalone API request context
 * - **cleanup** — Tracks created records and removes them after the test
 * - **testCaseId / testCaseName / testCaseData** — Data-driven lookup fixtures
 * - **workerLogger** — Per-worker logger (worker-scoped)
 *
 * Its `beforeEach` also applies the three-layer execution gate — `runnerList.json`
 * override, the runner row's `enabled` flag, then the `TEST_SCOPE` segment/module
 * filter (see `src/config/scope.ts`).
 *
 * @module fixtures/base.fixture
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { test, expect } from '../fixtures/base.fixture';
 *
 * test('login flow', async ({ page, navigation, logger }) => {
 *   await page.goto('/login');
 *   await navigation.clickLogin();
 *   logger.info('Login test completed');
 * });
 * ```
 */
import { APIRequestContext, expect, Page, test as base } from '@playwright/test';
import { NavigationComponent } from '../components/NavigationComponent';
import { ModalComponent } from '../components/ModalComponent';
import { ConfigProperties, getConfigValue } from '../config/configProperties';
import { FormComponent } from '../components/FormComponent';
import { Logger } from '../utils/logger';
import { getTestCaseById, getRunnerData } from '../data/readers/DataProvider';
import { decideExecution } from './gate/executionGate';
import { LoginPage } from '../pages/shell/LoginPage';
import { LeftNavigationPage } from '../pages/shell/LeftNavigationPage';
import { UsersPage } from '../pages/admin/UsersPage';
import { createPageObjects, type PageObjects } from './pages.fixture';
import { CleanupRegistry } from '../utils/db/cleanupRegistry';
import type { TestCaseData } from '../types';
import { applyAllureLabels, resolveCaseId } from '../reporting/generate/allure/labels';
import { onTestStart, onTestEnd } from './lifecycle/testLifecycleManager';

/**
 * Per-test fixture types.
 * @typedef {object} CustomFixtures
 */
type CustomFixtures = {
    /**
     * Every page object, lazily constructed — `pages.users`, `pages.leftNav`, …
     * This is the way to reach a screen; the three named fixtures below are
     * shortcuts for the ones the existing specs already use.
     */
    pages: PageObjects;
    /** Page Object for the PET Tiger login page. */
    loginPage: LoginPage;
    /** Page Object for the authenticated shell's left navigation. */
    leftNavigationPage: LeftNavigationPage;
    /** Page Object for the Users administration screen and New User form. */
    usersPage: UsersPage;
    /** Navigates to the login page before the test body runs. */
    gotoUrl: void;
    /** Pre-built navigation component for the current page. */
    navigation: NavigationComponent;
    /** Pre-built modal component for the current page. */
    modal: ModalComponent;
    /** Pre-built form component for the current page. */
    form: FormComponent;
    /** Per-test logger (logs test start/end automatically). */
    logger: Logger;
    /** Page pre-loaded with authentication state from `.auth/user.json`. */
    authenticatedPage: Page;
    /** Standalone Playwright API request context (not tied to browser context). */
    apiRequest: APIRequestContext;

    /**
     * Tracks records the test creates and removes them afterwards —
     * `cleanup.track('user', name)`. Drained automatically after the test, even
     * when it fails. See `src/utils/db/cleanupRegistry.ts`.
     */
    cleanup: CleanupRegistry;

    /**
     * Test case ID for data-driven lookup (e.g. `'TC-AUTH-001'`).
     * Set via `test.use({ testCaseId: 'TC-AUTH-001' })` in each describe block.
     * When set, the {@link testCaseData} fixture auto-loads the matching record.
     */
    testCaseId: string;

    /**
     * Test case name for data-driven lookup by `testName` field.
     * Set via `test.use({ testCaseName: 'searchCriteriaFields' })`.
     */
    testCaseName: string;

    /**
     * Auto-resolved test case data, read DIRECTLY from the configured data
     * source (JSON or CSV — no conversion step). Validates the record exists
     * and skips the test if `enabled === false`.
     */
    testCaseData: TestCaseData;

    /**
     * Auto fixture applying the framework's three-layer execution gate and the
     * per-test lifecycle hooks. Never referenced by a spec — see the fixture
     * implementation for why it must be a fixture and not a `beforeEach`.
     */
    gate: void;
};

/**
 * Worker-scoped fixture types.
 * @typedef {object} WorkerFixtures
 */
type WorkerFixtures = {
    /** Per-worker logger. */
    workerLogger: Logger;
};

export const test = base.extend<CustomFixtures, WorkerFixtures>({

    // ── Option fixtures (set via test.use) ──────────────────────────
    testCaseId: ['', { option: true }],
    testCaseName: ['', { option: true }],

    /**
     * Run control + per-test lifecycle, applied to every test automatically.
     *
     * ## Why this is a fixture and not a `test.beforeEach`
     *
     * It used to be a module-level `test.beforeEach` here, and that silently only
     * half-worked. A hook registered at module scope inside a fixture module
     * attaches to whichever file suite is loading at that instant, and this module
     * body runs once per worker process (Node's module cache) — so the gate fired
     * for the FIRST spec file each worker loaded and no others. Tests in every
     * other file ran completely ungoverned: `enabled=0` rows executed anyway.
     * See `src/fixtures/executionGate.ts` for the two-spec measurement.
     *
     * An auto fixture also resolves BEFORE the test function's declared
     * parameters, so a skip decided here prevents `context`/`page`/`request` from
     * ever being created. That is both faster and the only way a gate can stop a
     * test that would otherwise fail during fixture setup — which is why this
     * depends on nothing but the `testCaseId` option.
     *
     * The three gate layers themselves live in {@link decideExecution}, shared with
     * the web-pet suite's `webpetGate.ts`. Do not re-inline them: the rules must
     * not fork just because the row source did.
     */
    gate: [
        async ({ testCaseId }, use, testInfo) => {
            onTestStart(testInfo);

            // Resolve the runner row for this test, from the testCaseId option or a
            // { type: 'testCaseId' } annotation.
            const caseId = resolveCaseId(testInfo, testCaseId);
            const row = caseId ? await getTestCaseById<TestCaseData>(caseId) : null;

            const decision = decideExecution(caseId, row);
            if (decision.skip) testInfo.skip(true, decision.reason);

            // Labelling must never be able to fail a test — the Allure runtime binds
            // to the running test through async-local state, and this now runs from
            // inside a fixture rather than a `beforeEach`. Mirrors webpetGate.ts.
            try {
                await applyAllureLabels(testInfo, row);
            } catch (error: unknown) {
                new Logger('Gate').warn(
                    `Allure labelling failed for '${testInfo.title}': ${String(error)}`,
                );
            }

            await use();

            onTestEnd(testInfo);
        },
        { auto: true },
    ],

    // ── Page Object fixtures ────────────────────────────────────────
    // `pages` is the general accessor — one fixture for every screen, each built
    // on first use. The three named fixtures below resolve through it, so a spec
    // can keep using `usersPage` or move to `pages.users` and get the same object.
    pages: async ({ page }, use) => {
        await use(createPageObjects(page));
    },

    loginPage: async ({ pages }, use) => {
        await use(pages.login);
    },

    leftNavigationPage: async ({ pages }, use) => {
        await use(pages.leftNav);
    },

    usersPage: async ({ pages }, use) => {
        await use(pages.users);
    },

    // Navigate to the login page before the test body runs.
    gotoUrl: async ({ loginPage }, use) => {
        await loginPage.gotoPetTiger();
        await use();
    },

    // ── Component fixtures ──────────────────────────────────────────
    navigation: async ({ page }, use) => {
        const navigation = new NavigationComponent(page);
        await use(navigation);
    },

    modal: async ({ page }, use) => {
        const modal = new ModalComponent(page);
        await use(modal);
    },

    form: async ({ page }, use) => {
        const form = new FormComponent(page);
        await use(form);
    },

    logger: async ({ }, use, testInfo) => {
        const logger = new Logger(`Test: ${testInfo.title}`);
        logger.info(`Starting test: ${testInfo.title}`);

        await use(logger);

        logger.info(`Finished test: ${testInfo.title} - ${testInfo.status}`);
    },

    // ── Test-data cleanup ───────────────────────────────────────────
    // Draining after `use` means it runs whether the test passed or failed, which
    // is the whole point: a failed test is exactly when records get left behind.
    cleanup: async ({ }, use) => {
        const registry = new CleanupRegistry();
        await use(registry);
        await registry.drain();
    },

    // ── Data-driven test case fixture ───────────────────────────────
    testCaseData: async ({ testCaseId, testCaseName, logger }, use) => {
        let testCase: TestCaseData | null | undefined;

        if (testCaseId) {
            // Pattern 1: Lookup by ID (e.g. 'TC-AUTH-001')
            testCase = await getTestCaseById<TestCaseData>(testCaseId);
            if (!testCase) {
                logger.info(`Test case '${testCaseId}' not found in data source — skipping`);
                test.skip(true, `Test case '${testCaseId}' not found in data source. Verify the ID exists in your test data file.`);
                return;
            }
        } else if (testCaseName) {
            // Pattern 2: Lookup by testName (e.g. 'searchCriteriaFields')
            const runnerData = await getRunnerData<TestCaseData>();
            testCase = runnerData.testCases.find((tc) => tc.testName === testCaseName);
            if (!testCase) {
                logger.info(`Test case with testName '${testCaseName}' not found in data source — skipping`);
                test.skip(true, `Test case with testName '${testCaseName}' not found in data source. Verify the testName exists in your test data file.`);
                return;
            }
        } else {
            logger.info('Neither testCaseId nor testCaseName was provided — skipping');
            test.skip(true, 'Neither testCaseId nor testCaseName was provided. Set one via test.use({ testCaseId: "TC-XXX" }) or test.use({ testCaseName: "myTest" }).');
            return;
        }

        // ── Centralised logging & skip logic ────────────────────────
        logger.info(`Running test case: ${testCase.id} — ${testCase.testTitle}`);

        if (!testCase.enabled) {
            test.skip(true, 'Test disabled via data source (enabled=false)');
        }

        await use(testCase);
    },

    authenticatedPage: async ({ browser }, use) => {
        const context = await browser.newContext({
            storageState: '.auth/user.json',
        });
        const page = await context.newPage();

        await use(page);
        await context.close();
    },

    apiRequest: async ({ playwright }, use) => {
        // Ensure baseURL ends with '/' so Playwright resolves relative paths correctly
        // e.g. baseURL 'https://host/rest/' + './guarantors/...' → 'https://host/rest/guarantors/...'
        const rawBaseUrl = getConfigValue(ConfigProperties.API_URL);
        const baseURL = rawBaseUrl.endsWith('/') ? rawBaseUrl : `${rawBaseUrl}/`;
        const apiContext = await playwright.request.newContext({
            baseURL,
            extraHTTPHeaders: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        });

        await use(apiContext);
        await apiContext.dispose();
    },

    workerLogger: [
        async ({ }, use, workerInfo) => {
            const logger = new Logger(`Worker ${workerInfo.workerIndex}`);
            logger.info(`Worker ${workerInfo.workerIndex} started`);

            await use(logger);

            logger.info(`Worker ${workerInfo.workerIndex} finished`);
        },
        { scope: 'worker' },
    ],

});

export { expect };
