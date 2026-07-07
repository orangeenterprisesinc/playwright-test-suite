/**
 * @fileoverview Global Teardown configuration
 * @description Performs cleanup actions after all tests have finished.
 * @module fixtures/global-teardown
 * @since 1.0.0
 */

import { FullConfig } from '@playwright/test';
import { Logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

/**
 * Global teardown function
 *
 * @async
 * @param {FullConfig} _config - Playwright full configuration
 * @returns {Promise<void>}
 *
 * @description
 * Logs a run summary from Playwright's native JSON output (when present).
 */
async function globalTeardown(_config: FullConfig): Promise<void> {
    const logger = new Logger('GlobalTeardown');
    logger.info('Starting global teardown...');

    // Generate summary report from Playwright's native output
    const resultsFile = path.join('test-results', 'results.json');
    if (fs.existsSync(resultsFile)) {
        try {
            const results = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
            const summary = {
                total: results.stats?.expected || 0,
                passed: results.stats?.expected || 0,
                failed: results.stats?.unexpected || 0,
                skipped: results.stats?.skipped || 0,
                duration: results.stats?.duration || 0,
            };
            logger.info(`Test Summary: ${JSON.stringify(summary)}`);
        } catch {
            logger.warn('Could not parse results file');
        }
    }

    logger.info('Global teardown completed');
}

export default globalTeardown;
