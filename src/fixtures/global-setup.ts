/**
 * @fileoverview Global Setup configuration
 * @description Performs one-time setup before all tests run.
 * @module fixtures/global-setup
 * @author Vicky
 * @since 1.0.0
 */

import { FullConfig } from '@playwright/test';
import { Logger } from '../utils/logger';
import { ExecutionContext } from '../context/executionContext';
import { DataPreprocessor } from '../utils/DataPreprocessor';
import fs from 'fs';
import path from 'path';

const AUTH_DIR = '.auth';

const USER_AUTH_FILE = path.join(AUTH_DIR, 'user.json');

/**
 * Global setup function
 *
 * @async
 * @param {FullConfig} _config - Playwright full configuration
 * @returns {Promise<void>}
 *
 * @description
 * Performs one-time setup before all tests:
 * - Creates auth directory
 * - Creates empty auth state file
 * - Creates test results directories
 * - Initializes execution context
 *
 * @example
 * // In playwright.config.ts
 * export default defineConfig({
 *   globalSetup: './src/fixtures/global-setup.ts',
 * });
 */
async function globalSetup(_config: FullConfig): Promise<void> {
    const logger = new Logger('GlobalSetup');
    logger.info('Starting global setup...');

    // Ensure auth directory exists
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        logger.info('Created auth directory');
    }

    // Create empty auth file if it doesn't exist (for demo purposes)
    // In a real app, you would perform actual authentication here
    if (!fs.existsSync(USER_AUTH_FILE)) {
        // Create a minimal storage state file
        const emptyState = {
            cookies: [],
            origins: [],
        };
        fs.writeFileSync(USER_AUTH_FILE, JSON.stringify(emptyState, null, 2));
        logger.info('Created empty auth state file');
    }

    // Example: Perform authentication and save state
    // Uncomment and modify for your application
    /*
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to login page
    await page.goto(config.projects[0].use?.baseURL + '/login');

    // Perform login
    await page.getByLabel('Username').fill(process.env.AUTH_USERNAME || 'testuser');
    await page.getByLabel('Password').fill(process.env.AUTH_PASSWORD || 'password');
    await page.getByRole('button', { name: 'Login' }).click();

    // Wait for successful login
    await page.waitForURL('**\/dashboard');

    // Save authentication state
    await context.storageState({ path: USER_AUTH_FILE });
    logger.info('Saved authentication state');

    await browser.close();
    */

    // ── Lifecycle: Initialise ExecutionContext (mirrors ISuiteListener.onStart) ──
    ExecutionContext.init();
    const ctx = ExecutionContext.snapshot();
    logger.info(
        `ExecutionContext initialised — runId=${ctx.runId}, triggeredBy=${ctx.triggeredBy}, branch=${ctx.branch}`,
    );

    // Serialise context for cross-worker sharing via process.env
    process.env.EXECUTION_CONTEXT = ExecutionContext.serialise();

    // Create test results directory
    const resultsDir = 'test-results';
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
    }

    const screenshotsDir = path.join(resultsDir, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // ── Data Preprocessing: Convert CSV/Excel/DB → unified JSON ──
    try {
        const preprocessResult = await DataPreprocessor.preprocess();
        if (preprocessResult.converted) {
            logger.info(
                `Data preprocessing complete — converted ${preprocessResult.recordCount} records ` +
                `from ${preprocessResult.sourceType} → ${preprocessResult.outputPath}`,
            );
        } else {
            logger.info(
                `Data preprocessing skipped — source is already JSON ` +
                `(${preprocessResult.recordCount} records in ${preprocessResult.outputPath})`,
            );
        }
    } catch (error) {
        logger.error(`Data preprocessing failed: ${error}`);
        throw error;
    }

    logger.info('Global setup completed');
}

export default globalSetup;
