/**
 * @fileoverview Global Setup configuration
 * @description Performs one-time setup before all tests run.
 * @module fixtures/global-setup
 * @since 1.0.0
 */

import { FullConfig, request } from '@playwright/test';
import { Logger } from '../utils/logger';
import { ConfigProperties, getConfigValue } from '../enums/configProperties';
import { isDbCleanupEnabled, runSql } from '../utils/db/sqlClient';
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

const ALLURE_RESULTS_DIR = 'allure-results';

/**
 * Allure defect categories — groups tests in the report's "Categories" tab by
 * outcome. Written into `allure-results/categories.json`, which Allure reads by
 * convention. Without it the Categories tab is empty.
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

    // Start every run from a CLEAN allure-results, so the report reflects THIS
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
    logger.info('Reset allure-results and wrote categories.json');

    await warmUpTargets(logger);
    await verifyDbReachable(logger);

    logger.info('Global setup completed');
}

/**
 * Wait for the app (and the API, when it lives on another host) to actually
 * answer before any test starts.
 *
 * A cold environment charges its start-up cost to whichever request arrives
 * first, and that request is the auth-setup login. A CI run has been seen where
 * `goto('/login')` alone took 28s and the login POST then blew the redirect
 * wait, while the retry — against the now-warm app — loaded the same page in
 * under a second. Paying that cost here instead means the cost lands on setup,
 * where it is visible and harmless, rather than on a test with a deadline.
 *
 * Deliberately never throws: the probe is an optimisation, and a URL that
 * answers oddly (or not at all) should not discard the run before the tests
 * have had their say. auth-setup remains the real gate — it now reports a
 * credential rejection distinctly from a slow app, so a genuine outage still
 * fails loudly with an accurate message.
 */
async function warmUpTargets(logger: Logger): Promise<void> {
    if (!Number.isFinite(WARMUP_TIMEOUT_MS) || WARMUP_TIMEOUT_MS <= 0) {
        logger.info('Warm-up disabled (WARMUP_TIMEOUT_MS=0) — skipping the readiness probe');
        return;
    }

    const candidates = [
        { label: 'App', url: getConfigValue(ConfigProperties.APP_URL) },
        { label: 'API', url: getConfigValue(ConfigProperties.API_URL) },
    ];

    // The SPA and the API can share a host (local) or be split across two
    // (dev: S3 SPA + api.*), so probe by distinct origin — one GET per host is
    // enough to wake it, and probing the same origin twice just wastes time.
    const seenOrigins = new Set<string>();
    const targets: Array<{ label: string; url: string }> = [];
    for (const candidate of candidates) {
        if (!candidate.url) continue;
        let origin: string;
        try {
            origin = new URL(candidate.url).origin;
        } catch {
            logger.warn(`${candidate.label} URL is not parseable, skipping warm-up: ${candidate.url}`);
            continue;
        }
        if (seenOrigins.has(origin)) continue;
        seenOrigins.add(origin);
        targets.push({ label: candidate.label, url: candidate.url });
    }

    if (targets.length === 0) {
        logger.warn('No BASE_URL/API_URL configured — skipping the readiness probe');
        return;
    }

    for (const target of targets) {
        await probeUntilReady(logger, target.label, target.url);
    }
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

/**
 * Probe the cleanup database once, up front, when cleanup is switched on.
 *
 * Cleanup that silently does nothing is worse than cleanup that fails loudly:
 * the run still reports green while the test users it created pile up in a shared
 * database, and nobody notices for weeks. `runSql` swallows its own failures by
 * design (an exception in `afterEach` would mask the real test result), so
 * without this the first sign of a blocked port or a bad credential is a warning
 * buried in the middle of the log.
 *
 * Deliberately never throws — a database blip should not discard a whole E2E run.
 * It reports and moves on, emitting a GitHub Actions error annotation in CI so
 * the run summary surfaces it. Change the `::error::` line to also `throw` if you
 * would rather a run hard-fail when cleanup is unavailable.
 *
 * This reuses `runSql`, so it exercises exactly the transport the tests will use
 * — driver or `sqlcmd`, same `DB_SERVER` parsing, same credentials — rather than
 * testing a separate connection path that could succeed where the real one fails.
 */
async function verifyDbReachable(logger: Logger): Promise<void> {
    if (!isDbCleanupEnabled()) {
        logger.info('DB cleanup is off — skipping the connectivity check');
        return;
    }

    const server = getConfigValue(ConfigProperties.DB_SERVER);
    const database = getConfigValue(ConfigProperties.DB_CLIENT);
    const result = await runSql('SELECT 1;', 'connectivity check');

    if (result.ok) {
        logger.info(`Cleanup database reachable (${server}, db=${database})`);
        return;
    }

    const detail = `cannot reach the cleanup database at ${server} (db=${database}) — tests will run, but every user they create will be LEFT BEHIND`;
    logger.warn(detail);
    if (process.env.CI) {
        // Picked up by Actions from stdout and shown on the run summary.
        console.log(`::error::${detail}`);
    }
}

export default globalSetup;
