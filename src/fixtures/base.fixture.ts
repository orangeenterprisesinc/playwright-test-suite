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
import { getRunnerListDecision } from '../listeners/methodInterceptor';
import { LoginPage } from '../pages/LoginPage';
import { LeftNavigationPage } from '../pages/LeftNavigationPage';
import { UsersPage } from '../pages/UsersPage';
import type { TestCaseData } from '../types';
import { applyAllureLabels, resolveCaseId } from '../utils/allureLabels';
import { onTestStart, onTestEnd } from '../listeners/testLifecycleManager';

/**
 * Per-test fixture types.
 * @typedef {object} CustomFixtures
 */
type CustomFixtures = {
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

    usersPage: async ({ page }, use) => {
        await use(new UsersPage(page));
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

test.beforeEach(async ({ testCaseId }, testInfo) => {
    onTestStart(testInfo);

    // Resolve the runner row for this test (from the testCaseId option or a
    // { type: 'testCaseId' } annotation), then apply the two-layer gate:
    // runnerList.json overrides, runnerManager `enabled` is the baseline.
    const caseId = resolveCaseId(testInfo, testCaseId);
    const row = caseId ? await getTestCaseById<TestCaseData>(caseId) : null;

    // Layer 1 — runnerList.json wins outright for any id it lists, including
    // re-enabling a row whose `enabled` is false. Per-entry, so an id absent from
    // the list falls through to runnerManager rather than being implicitly
    // excluded — adding one entry must not silently disable everything else.
    // Normally runnerList.json is `{}` and this is always null.
    const override = caseId ? getRunnerListDecision(caseId) : null;

    if (override === false) {
        test.skip(true, `Test case '${caseId}' is disabled in runnerList (execute=no)`);
    } else if (override === null) {
        // Layer 2 — no override, so runnerManager governs.
        //
        // A test that claims a testCaseId with no matching row is a configuration
        // error, and it must NOT run: previously this gate only checked
        // `row && row.enabled === false`, so an unknown ID fell through and executed
        // completely ungoverned — USR-000 ran (and burned both CI retries) for exactly
        // this reason while every other user-setup case was correctly disabled. The
        // `caseId &&` guard is load-bearing: unannotated tests such as auth.setup.ts
        // resolve to '' and must still run, or every browser project loses its session.
        if (caseId && !row) {
            test.skip(true, `Test case '${caseId}' has no runnerManager row — add one (enabled true/false) or remove the annotation.`);
        }
        if (row && row.enabled === false) {
            test.skip(true, `Test case '${row.id}' is disabled in runnerManager (enabled=false)`);
        }
    }
    // override === true → runs regardless of runnerManager, by design.

    await applyAllureLabels(testInfo, row);
});

test.afterEach(async ({ }, testInfo) => {
    onTestEnd(testInfo);
});

export { expect };
