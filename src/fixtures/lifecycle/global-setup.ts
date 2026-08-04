/**
 * @fileoverview Global Setup configuration
 * @description Performs one-time setup before all tests run.
 */

import { FullConfig, request } from '@playwright/test';
import { Logger } from '../../utils/logger';
import { ConfigProperties, getConfigValue } from '../../config/configProperties';
import fs from 'fs';
import path from 'path';

const AUTH_DIR = '.auth';

/**
 * Total budget for the warm-up probe, per target. Set `WARMUP_TIMEOUT_MS=0` to
 * skip warm-up entirely (e.g. when pointing at an already-hot environment).
 */
const WARMUP_TIMEOUT_MS = Number(process.env.WARMUP_TIMEOUT_MS ?? 90_000);

/** Per-attempt request budget — a cold app pool can sit on a socket for a while. */
const WARMUP_ATTEMPT_TIMEOUT_MS = 15_000;

/** Pause between probes, so a slow-starting server is not hammered. */
const WARMUP_RETRY_DELAY_MS = 2_000;

const USER_AUTH_FILE = path.join(AUTH_DIR, 'user.json');

const ALLURE_RESULTS_DIR = path.join('artifacts', 'allure', 'results');

/**
 * Allure defect categories — groups tests in the report's "Categories" tab by
 * outcome. Written into `artifacts/allure/results/categories.json`, which Allure
 * reads by convention. Without it the Categories tab is empty.
 */
const ALLURE_CATEGORIES = [
    { name: 'Ignored / skipped tests', matchedStatuses: ['skipped'] },
    { name: 'Product defects', matchedStatuses: ['failed'] },
    { name: 'Test defects (broken)', matchedStatuses: ['broken'] },
    { name: 'Timeouts', matchedStatuses: ['broken'], messageRegex: '.*[Tt]imeout.*' },
];

/**
 * Global setup function
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
    const resultsDir = path.join('artifacts', 'results');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
    }

    const screenshotsDir = path.join(resultsDir, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Start every run from CLEAN allure results, so the report reflects THIS
    // run only. Otherwise result files accumulate across runs and the report
    // shows inflated counts and duplicated tests. Trend history is preserved
    // separately (from the previous report's history/ folder at generate time),
    // so cleaning here does not lose trends.
    fs.rmSync(ALLURE_RESULTS_DIR, { recursive: true, force: true });
    fs.mkdirSync(ALLURE_RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
        path.join(ALLURE_RESULTS_DIR, 'categories.json'),
        JSON.stringify(ALLURE_CATEGORIES, null, 2),
    );
    logger.info(`Reset ${ALLURE_RESULTS_DIR} and wrote categories.json`);

    await warmUpTargets(logger);

    logger.info('Global setup completed');
}

/**
 * Warm the app so a cold environment's start-up cost lands here, not on the
 * auth-setup login. Seen in CI: `goto('/login')` took 28s and blew the redirect
 * wait; the retry against the warm app loaded in under a second.
 *
 * BASE_URL only. API_URL was dropped — browser specs enter through the app and
 * API specs build their own context, so it warmed nothing, and on dev its
 * routeless root logged a misleading `HTTP 404`.
 *
 * Never throws; auth-setup is the real gate.
 */
async function warmUpTargets(logger: Logger): Promise<void> {
    if (!Number.isFinite(WARMUP_TIMEOUT_MS) || WARMUP_TIMEOUT_MS <= 0) {
        logger.info('Warm-up disabled (WARMUP_TIMEOUT_MS=0) — skipping the readiness probe');
        return;
    }

    const url = getConfigValue(ConfigProperties.APP_URL);
    if (!url) {
        logger.warn('No BASE_URL configured — skipping the readiness probe');
        return;
    }

    try {
        new URL(url);
    } catch {
        logger.warn(`BASE_URL is not parseable, skipping warm-up: ${url}`);
        return;
    }

    await probeUntilReady(logger, 'App', url);
}

/**
 * Poll one URL until the server answers, or until the warm-up budget runs out.
 *
 * ANY HTTP status counts as ready — a 302 to /login, a 401, even a 404 on an
 * API root all prove the server is listening and no longer cold, which is the
 * only thing being established here. Redirects are followed on purpose: that
 * lands on the login page and warms it too.
 */
async function probeUntilReady(logger: Logger, label: string, url: string): Promise<void> {
    const context = await request.newContext({ ignoreHTTPSErrors: true });
    const startedAt = Date.now();
    const deadline = startedAt + WARMUP_TIMEOUT_MS;
    let attempts = 0;
    let lastError = 'none';

    try {
        while (Date.now() < deadline) {
            attempts++;
            try {
                const response = await context.get(url, { timeout: WARMUP_ATTEMPT_TIMEOUT_MS });
                const elapsed = Date.now() - startedAt;
                // Log the elapsed time even on success: a multi-second number
                // here is the cold-start signature, and seeing it is how you
                // know the warm-up earned its keep on this run.
                logger.info(
                    `${label} ready in ${elapsed} ms (HTTP ${response.status()}, attempt ${attempts}) — ${url}`,
                );
                return;
            } catch (error) {
                lastError = error instanceof Error ? error.message.split('\n')[0] : String(error);
                if (Date.now() + WARMUP_RETRY_DELAY_MS >= deadline) break;
                await new Promise((resolve) => setTimeout(resolve, WARMUP_RETRY_DELAY_MS));
            }
        }

        const detail = `${label} at ${url} did not answer within ${WARMUP_TIMEOUT_MS} ms (${attempts} attempt(s), last error: ${lastError}) — tests will run, but expect login/navigation timeouts`;
        logger.warn(detail);
        if (process.env.CI) {
            console.log(`::warning::${detail}`);
        }
    } finally {
        await context.dispose();
    }
}

// There is no cleanup-connectivity probe here any more. It existed to catch a
// silently-unreachable SQL Server; cleanup now goes through the same API the tests
// themselves use, so auth-setup failing is already the signal that it cannot run.

export default globalSetup;
