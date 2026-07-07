/**
 * @fileoverview Allure reporting integration helpers.
 *
 * Provides functions to sync {@link TestMetrics} labels/tags into Allure,
 * attach failure screenshots, capture page state, and attach arbitrary logs.
 *
 * @module utils/allureHelper
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { syncTestMetricsToAllure, attachScreenshotOnFailure } from '@utils/allureHelper';
 *
 * test.afterEach(async ({ page }, testInfo) => {
 *   await syncTestMetricsToAllure();
 *   await attachScreenshotOnFailure(page, testInfo);
 * });
 * ```
 */
import {Page, TestInfo} from '@playwright/test';
import {allure} from 'allure-playwright';
import fs from 'fs';
import path from 'path';
import {TestMetrics} from '../context/testMetrics';
import {Logger} from './logger';

/** @private Logger instance for allure helper operations */
const logger = new Logger('AllureHelper');

/**
 * Synchronises current {@link TestMetrics} snapshot into Allure labels and parameters.
 *
 * Copies authors → `owner` labels, categories/tags → Allure tags,
 * and HTTP status / response time → Allure parameters.
 *
 * @returns {Promise<void>}
 */
export async function syncTestMetricsToAllure(): Promise<void> {
    try {
        const snapshot = TestMetrics.snapshot();

        // Sync Authors/Owners
        for (const author of snapshot.authors) {
            await allure.label('owner', author);
        }

        // Sync Categories/Tags
        for (const category of snapshot.categories) {
            await allure.tag(category);
        }

        // Sync parsed tags from title
        for (const tag of snapshot.tags) {
            await allure.tag(tag.replace('@', ''));
        }

        // Sync API Metrics as parameters if they exist
        if (snapshot.httpStatusCode) {
            await allure.parameter('HTTP Status', snapshot.httpStatusCode.toString());
        }

        if (snapshot.responseTimeMs) {
            await allure.parameter('Response Time', `${snapshot.responseTimeMs} ms`);
        }
    } catch (error) {
        logger.warn(`Failed to sync metrics to Allure: ${error}`);
    }
}

/**
 * Captures a full-page screenshot on test failure and attaches it to both
 * the Allure report and the local `test-results/screenshots/` directory.
 *
 * @param {Page} page - The Playwright page instance
 * @param {TestInfo} testInfo - Playwright's TestInfo for the current test
 * @returns {Promise<void>}
 */
export async function attachScreenshotOnFailure(page: Page, testInfo: TestInfo): Promise<void> {
    if (testInfo.status !== testInfo.expectedStatus) {
        const screenshotName = `failure-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '_')}`;

        try {
            const screenshot = await page.screenshot({fullPage: true});

            // Attach to Allure
            await allure.attachment(`${screenshotName}.png`, screenshot, 'image/png');

            // Also save to disk
            const screenshotDir = path.join('test-results', 'screenshots');
            if (!fs.existsSync(screenshotDir)) {
                fs.mkdirSync(screenshotDir, {recursive: true});
            }

            const screenshotPath = path.join(screenshotDir, `${screenshotName}.png`);
            fs.writeFileSync(screenshotPath, screenshot);

            logger.info(`Screenshot saved: ${screenshotPath}`);
        } catch (error) {
            logger.warn(`Failed to capture failure screenshot: ${error}`);
        }
    }
}

/**
 * Captures page state (URL, title, viewport, errors) on failure and attaches
 * it as a JSON attachment in the Allure report.
 *
 * @param {Page} page - The Playwright page instance
 * @param {TestInfo} testInfo - Playwright's TestInfo for the current test
 * @returns {Promise<void>}
 */
export async function attachPageStateOnFailure(page: Page, testInfo: TestInfo): Promise<void> {
    if (testInfo.status !== testInfo.expectedStatus) {
        try {
            const pageState = {
                url: page.url(),
                title: await page.title(),
                viewport: page.viewportSize(),
                timestamp: new Date().toISOString(),
                testTitle: testInfo.title,
                testFile: testInfo.file,
                duration: testInfo.duration,
                error: testInfo.error?.message,
            };

            await allure.attachment(
                'Page State on Failure',
                JSON.stringify(pageState, null, 2),
                'application/json',
            );
        } catch (error) {
            logger.warn(`Failed to capture page state: ${error}`);
        }
    }
}

/**
 * Attaches an arbitrary text log message to the Allure report.
 *
 * @param {string} message - The log content to attach
 * @param {string} [name='Log'] - Display name for the attachment
 * @returns {Promise<void>}
 */
export async function attachLogToAllure(message: string, name: string = 'Log'): Promise<void> {
    try {
        await allure.attachment(name, message, 'text/plain');
    } catch (error) {
        logger.warn(`Failed to attach log to Allure: ${error}`);
    }
}
