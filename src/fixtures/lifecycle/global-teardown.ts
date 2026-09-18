/**
 * @fileoverview Global Teardown configuration
 * @description Performs cleanup actions after all tests have finished.
 */

import { FullConfig } from '@playwright/test';
import { Logger } from '../../utils/logger';
import { ConfigProperties, getConfigValue } from '../../config/configProperties';
import { sweepLeftovers } from '../../utils/cleanup/cleanupRegistry';
import { reconcileFixtureDays } from '../../utils/cleanup/fixtureReconcile';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ALLURE_RESULTS_DIR = path.join('artifacts', 'allure', 'results');

/** One Environment line per residue-sweep phase that ran, read from its summary file. */
function residueSweepLines(): [string, string][] {
    const lines: [string, string][] = [];
    for (const phase of ['start', 'end'] as const) {
        const file = path.join('artifacts', 'results', `residue-sweep-${phase}.json`);
        if (!fs.existsSync(file)) continue;
        try {
            const s = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
                auth: string;
                dryRun: boolean;
                totals: { candidates: number; deleted: number; conflict: number; other: number };
            };
            lines.push([
                `Residue sweep (${phase})`,
                `auth ${s.auth}, candidates ${String(s.totals.candidates)}, deleted ${String(s.totals.deleted)}, ` +
                    `409 ${String(s.totals.conflict)}, other ${String(s.totals.other)}${s.dryRun ? ' (dry run)' : ''}`,
            ]);
        } catch {
            /* a malformed summary is not worth failing teardown over */
        }
    }
    return lines;
}

function fixtureReconcileLines(): [string, string][] {
    const lines: [string, string][] = [];
    for (const phase of ['start', 'end'] as const) {
        const file = path.join('artifacts', 'results', `fixture-reconcile-${phase}.json`);
        if (!fs.existsSync(file)) continue;
        try {
            const s = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
                enabled: boolean;
                auth: string;
                probe: { latestRunId: number | null };
                quiesce: { inFlight: number[]; settled: number[]; unsettled: unknown[]; verdict: string | null };
                mailbox: { drained: number };
                sweep: { matched: number; deleted: number; skippedTransferred: number; failed: number };
            };
            lines.push([
                `Fixture reconcile (${phase})`,
                s.enabled
                    ? `auth ${s.auth}, latest run ${String(s.probe.latestRunId ?? 'n/a')}, in-flight ${String(s.quiesce.inFlight.length)} ` +
                      `(settled ${String(s.quiesce.settled.length)}, unsettled ${String(s.quiesce.unsettled.length)}` +
                      `${s.quiesce.verdict ? `, ${s.quiesce.verdict}` : ''}), mailbox drained ${String(s.mailbox.drained)}, ` +
                      `cards matched ${String(s.sweep.matched)} deleted ${String(s.sweep.deleted)} skipped(409) ` +
                      `${String(s.sweep.skippedTransferred)} failed ${String(s.sweep.failed)}`
                    : 'disabled (FIXTURE_RECONCILE=0)',
            ]);
        } catch {
            /* a malformed summary is not worth failing teardown over */
        }
    }
    return lines;
}

/**
 * Writes `artifacts/allure/results/environment.properties` — Allure reads this file
 * by convention and renders it as the report's "Environment" panel.
 */
function writeAllureEnvironmentInfo(config: FullConfig): void {
    const projectNames = config.projects.map((p) => p.name).join(', ') || 'n/a';
    const lines: [string, string][] = [
        ['Environment', getConfigValue(ConfigProperties.TEST_ENV, 'dev')],
        ['Base URL', getConfigValue(ConfigProperties.APP_URL, 'n/a')],
        ['Browsers', projectNames],
        ['Node', process.version],
        ['OS', process.platform],
        ['CI', process.env.CI ? 'yes' : 'no'],
        ...residueSweepLines(),
        ...fixtureReconcileLines(),
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
            buildName: `Local run — ${getConfigValue(ConfigProperties.TEST_ENV, 'dev')}`,
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

    // End-of-run sweep: this run's own residue (rows a timed-out test never got to
    // delete) plus anything past the age gate. Table-driven by
    // src/data/static/shared/cleanupTargets.ts; never throws, logs in for itself.
    // Before the Allure metadata so its summary can appear there.
    if (process.env.RESIDUE_SWEEP_STANDALONE !== '1') {
        await reconcileFixtureDays({ phase: 'end' });
        try {
            await sweepLeftovers();
        } catch (error) {
            logger.warn(`Leftover sweep failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    writeAllureEnvironmentInfo(config);
    writeAllureExecutorInfo();

    logger.info('Global teardown completed');
}

export default globalTeardown;
