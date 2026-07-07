/**
 * @fileoverview Global Setup configuration
 * @description Performs one-time setup before all tests run.
 * @module fixtures/global-setup
 * @since 1.0.0
 */

import { FullConfig } from '@playwright/test';
import { Logger } from '../utils/logger';
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
 * - Creates the auth directory and an empty storage-state placeholder
 *   (the real session is written by the auth-setup project)
 * - Creates test results directories
 */
async function globalSetup(_config: FullConfig): Promise<void> {
    const logger = new Logger('GlobalSetup');
    logger.info('Starting global setup...');

    // Ensure auth directory exists
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        logger.info('Created auth directory');
    }

    // Create an empty storage-state placeholder so browser projects can
    // reference it before the auth-setup project has run.
    if (!fs.existsSync(USER_AUTH_FILE)) {
        const emptyState = {
            cookies: [],
            origins: [],
        };
        fs.writeFileSync(USER_AUTH_FILE, JSON.stringify(emptyState, null, 2));
        logger.info('Created empty auth state file');
    }

    // Create test results directories
    const resultsDir = 'test-results';
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
    }

    const screenshotsDir = path.join(resultsDir, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    logger.info('Global setup completed');
}

export default globalSetup;
