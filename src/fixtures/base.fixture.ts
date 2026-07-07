/**
 * @fileoverview Custom Playwright test fixtures for UI testing.
 *
 * Extends Playwright's base `test` object with:
 * - **navigation** — Pre-built {@link NavigationComponent} fixture
 * - **modal** — Pre-built {@link ModalComponent} fixture
 * - **form** — Pre-built {@link FormComponent} fixture
 * - **logger** — Per-test {@link Logger} instance
 * - **authenticatedPage** — Page with pre-loaded auth state from `.auth/user.json`
 * - **apiRequest** — Standalone API request context
 * - **testCaseId / testCaseName / testCaseData** — Data-driven lookup fixtures
 * - **workerLogger** — Per-worker logger (worker-scoped)
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
import { ConfigProperties, getConfigValue } from '../enums/configProperties';
import { FormComponent } from '../components/FormComponent';
import { Logger } from '../utils/logger';
import { getTestCaseById, getRunnerData } from '../utils/DataProvider';
import { LoginPage } from '../pages/LoginPage';
import { LeftNavigationPage } from '../pages/LeftNavigationPage';
import type { TestCaseData } from '../types';

/**
 * Per-test fixture types.
 * @typedef {object} CustomFixtures
 */
type CustomFixtures = {
    /** Page Object for the PET Tiger login page. */
    loginPage: LoginPage;
    /** Page Object for the authenticated shell's left navigation. */
    leftNavigationPage: LeftNavigationPage;
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

    // ── Page Object fixtures ────────────────────────────────────────
    loginPage: async ({ page }, use) => {
        await use(new LoginPage(page));
    },

    leftNavigationPage: async ({ page }, use) => {
        await use(new LeftNavigationPage(page));
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
