/**
 * @fileoverview Custom Playwright test fixtures for UI testing.
 *
 * Extends Playwright's base `test` object with:
 * - **navigation** — Pre-built {@link NavigationComponent} fixture
 * - **modal** — Pre-built {@link ModalComponent} fixture
 * - **form** — Pre-built {@link FormComponent} fixture
 * - **logger** — Per-test {@link Logger} instance
 * - **authenticatedPage** — Page with pre-loaded auth state from `.auth/user.json`
 * - **workerLogger** — Per-worker logger (worker-scoped)
 *
 * Also sets up `beforeEach` / `afterEach` hooks for lifecycle management,
 * metrics collection, Allure reporting, DB audit logging, and ELK push.
 *
 * @module fixtures/base.fixture
 * @author Vicky
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
import { attachPageStateOnFailure, attachScreenshotOnFailure, syncTestMetricsToAllure } from '../utils/allureHelper';
import { onTestStart, onTestEnd } from '../listeners/testLifecycleManager';
import { TestMetrics } from '../context/testMetrics';
import { ExecutionContext } from '../context/executionContext';
import { TestRunContext, CurrentTestTracker } from '../context/testRunContext';
import { logResult as dbLogResult } from '../reporting/databaseAuditLogger';
import { pushTestMetricToElk } from '../utils/elkDashboard';
import { getTestCaseById, getRunnerData } from '../utils/DataProvider';
import type { TestCaseData } from '../types';

/**
 * Per-test fixture types.
 * @typedef {object} CustomFixtures
 */
type CustomFixtures = {
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
     * Test case name for data-driven lookup by `testName` field (e.g. `'searchCriteriaFields'`).
     * Set via `test.use({ testCaseName: 'searchCriteriaFields' })` in each describe block.
     * When set, the {@link testCaseData} fixture auto-loads the matching record.
     * Use this when the test needs to find a record by `testName` instead of `id`.
     */
    testCaseName: string;

    /**
     * Auto-resolved test case data from the unified data source.
     *
     * Handles all boilerplate internally:
     * - Loads test case by `testCaseId` or `testCaseName`
     * - Validates the record exists (throws if not found)
     * - Logs test case info (`id`, `testTitle`)
     * - Skips the test if `enabled === false`
     *
     * @example
     * ```typescript
     * test.use({ testCaseId: 'TC-AUTH-001' });
     *
     * test('my test', async ({ page, testCaseData, logger }) => {
     *     // testCaseData is already loaded, validated, logged, and skip-checked
     *     logger.info(`Expected count: ${testCaseData.expectedCount}`);
     * });
     * ```
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

test.beforeEach(async ({ }, testInfo) => {
    if (process.env.EXECUTION_CONTEXT) {
        try {
            ExecutionContext.hydrate(process.env.EXECUTION_CONTEXT);
        } catch {
            /* already hydrated */
        }
    }
    TestRunContext.setIterationFromRetry(testInfo.retry);
    CurrentTestTracker.set(testInfo.title);
    onTestStart(testInfo);
});

test.afterEach(async ({ page, logger }, testInfo) => {
    // 1. Capture lifecycle end metrics
    onTestEnd(testInfo);

    // 2. Attach artifacts on failure
    await attachScreenshotOnFailure(page, testInfo);
    await attachPageStateOnFailure(page, testInfo);

    // 3. Sync collected metrics to Allure
    await syncTestMetricsToAllure();

    const snapshot = TestMetrics.snapshot();
    const ctx = ExecutionContext.snapshot();
    dbLogResult({
        runId: ctx.runId,
        iterationId: testInfo.retry + 1,
        serviceName: ctx.serviceName,
        testCaseName: snapshot.testName,
        status: snapshot.status,
        environment: ctx.branch,
        executionTime: new Date(),
        responseTimeMs: snapshot.responseTimeMs,
        httpStatusCode: snapshot.httpStatusCode,
        buildVersion: ctx.buildVersion,
        triggeredBy: ctx.triggeredBy,
        errorMessage: snapshot.errorMessage ?? undefined,
    }).catch((err) => {
        logger.warn(`DB audit log failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    pushTestMetricToElk(snapshot, ctx.runId, ctx.branch, ctx.branch).catch((err) => {
        logger.warn(`ELK push failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    TestRunContext.clear();
    CurrentTestTracker.clear();
});

export { expect };
