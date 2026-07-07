/**
 * @fileoverview Global Teardown configuration
 * @description Performs cleanup actions after all tests have finished.
 * @module fixtures/global-teardown
 * @author Vicky
 * @since 1.0.0
 */

import { FullConfig } from '@playwright/test';
import { Logger } from '../utils/logger';
import { closePool } from '../reporting/databaseAuditLogger';
import { closeConnection } from '../utils/databaseConnectionManager';
import { DataPreprocessor } from '../utils/DataPreprocessor';
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
 * Performs cleanup after all tests:
 * - Flushes reports
 * - Sends email notifications
 * - Closes database connections
 * - Generates summary logs
 */
async function globalTeardown(_config: FullConfig): Promise<void> {
    const logger = new Logger('GlobalTeardown');
    logger.info('Starting global teardown...');

    // Example: Clean up test data
    // Uncomment and modify for your application
    /*
    // Clean up auth files (optional - keep for faster subsequent runs)
    const authDir = '.auth';
    if (fs.existsSync(authDir) && process.env.CLEAN_AUTH === 'true') {
      fs.rmSync(authDir, { recursive: true });
      logger.info('Cleaned up auth directory');
    }
    */

    // Example: Clean up test database
    /*
    const dbCleanup = async () => {
      // Connect to test database
      // Delete test records
      // Close connection
    };
    await dbCleanup();
    */



    // ── NOTE: Email notification is now handled by EmailReporter (src/reporting/emailReporter.ts) ──
    // The custom reporter has access to test counts via onTestEnd and fires after all results are ready.

    // ── Lifecycle: Close database connection pool (audit logger) ──
    try {
        await closePool();
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`DB pool close failed: ${msg}`);
    }

    // ── Lifecycle: Close database connection (connection manager) ──
    try {
        await closeConnection();
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`DB connection close failed: ${msg}`);
    }

    // Example: Generate summary report from Playwright's native output
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
        } catch (error) {
            logger.warn('Could not parse results file');
        }
    }



    // ── Lifecycle: Restore original JSON after preprocessing ──
    try {
        const restored = DataPreprocessor.restoreOriginalJson();
        if (restored) {
            logger.info('Restored original runnerManager.json from backup');
        } else {
            logger.debug('No preprocessing backup to restore');
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to restore preprocessing backup: ${msg}`);
    }

    logger.info('Global teardown completed');
}

export default globalTeardown;
