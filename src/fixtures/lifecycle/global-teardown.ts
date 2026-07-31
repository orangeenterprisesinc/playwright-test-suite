/**
 * @fileoverview Global Teardown configuration
 * @description Performs cleanup actions after all tests have finished.
 */

import { FullConfig } from '@playwright/test';
import { Logger } from '../../utils/logger';
import { ConfigProperties, getConfigValue } from '../../config/configProperties';
import { isDbCleanupEnabled } from '../../utils/db/sqlClient';
import { sweepLeftovers } from '../../utils/db/cleanupRegistry';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ALLURE_RESULTS_DIR = path.join('artifacts', 'allure', 'results');

/**
 * Writes `artifacts/allure/results/environment.properties` — Allure reads this file
 * by convention and renders it as the report's "Environment" panel.
 */
function writeAllureEnvironmentInfo(config: FullConfig): void {
    const projectNames = config.projects.map((p) => p.name).join(', ') || 'n/a';
    const lines: [string, string][] = [
        ['Environment', getConfigValue(ConfigProperties.TEST_ENV, 'local')],
        ['Base URL', getConfigValue(ConfigProperties.APP_URL, 'n/a')],
        ['Browsers', projectNames],
        ['Node', process.version],
        ['OS', process.platform],
        ['CI', process.env.CI ? 'yes' : 'no'],
    ];

    fs.mkdirSync(ALLURE_RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
        path.join(ALLURE_RESULTS_DIR, 'environment.properties'),
        lines.map(([key, value]) => `${key}=${value}`).join('\n'),
    );
}

/**
 * Writes `artifacts/allure/results/executor.json` — Allure reads this file by convention
 * and renders it as the report's "Executor" panel. On GitHub Actions it carries
 * the run URL; locally it records a plain "Local" executor so the panel isn't
 * empty.
 */
function writeAllureExecutorInfo(): void {
    const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_NUMBER } = process.env;
    fs.mkdirSync(ALLURE_RESULTS_DIR, { recursive: true });

    let executorInfo: Record<string, unknown>;
    if (GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID) {
        const buildUrl = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
        executorInfo = {
            name: 'GitHub Actions',
            type: 'github',
            buildOrder: GITHUB_RUN_NUMBER ? parseInt(GITHUB_RUN_NUMBER, 10) : undefined,
            buildName: `Run #${GITHUB_RUN_NUMBER ?? GITHUB_RUN_ID}`,
            buildUrl,
            reportUrl: buildUrl,
            reportName: 'Allure Report',
        };
    } else {
        executorInfo = {
            name: `Local (${os.hostname()})`,
            type: 'local',
            buildName: `Local run — ${getConfigValue(ConfigProperties.TEST_ENV, 'local')}`,
            reportName: 'Allure Report',
        };
    }

    fs.writeFileSync(path.join(ALLURE_RESULTS_DIR, 'executor.json'), JSON.stringify(executorInfo));
}

/**
 * Global teardown function
 *
 * @description
 * Logs a run summary from Playwright's native JSON output (when present)
 * and writes the Allure environment/executor metadata files.
 */
async function globalTeardown(config: FullConfig): Promise<void> {
    const logger = new Logger('GlobalTeardown');
    logger.info('Starting global teardown...');

    // Generate summary report from Playwright's native output
    const resultsFile = path.join('artifacts', 'results', 'results.json');
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

    writeAllureEnvironmentInfo(config);
    writeAllureExecutorInfo();

    // Safety-net sweep: soft-delete any leftover test records the suites created
    // (e.g. from an interrupted run) so they never accumulate. Per-test cleanup
    // already removes the happy-path records; this catches the rest. Driven by
    // src/data/static/shared/cleanupTargets.ts, so a new entity is swept by adding a row
    // there rather than by editing this file.
    if (isDbCleanupEnabled()) {
        await sweepLeftovers();
    }

    logger.info('Global teardown completed');
}

export default globalTeardown;
