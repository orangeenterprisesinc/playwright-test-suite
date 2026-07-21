import { defineConfig, devices } from '@playwright/test';
import { loadEnvFiles } from './src/config/envLoader';

/**
 * Playwright configuration for the PET Tiger UI + API test suite.
 *
 * This file is the single source of truth for how tests run in this repo:
 * environment loading, timeouts, parallelism, retries, artifacts, reporters,
 * and browser projects. It follows Playwright's recommended defaults, with
 * only deliberate, documented deviations.
 *
 * @see https://playwright.dev/docs/test-configuration
 */

// Load environment variables from `.env` + `env.<TEST_ENV>` before the config
// is built, so `process.env` is populated when read below. OS/CI variables
// always take precedence (see src/config/envLoader.ts).
loadEnvFiles({ cwd: __dirname });

/** Application under test — provided per environment via env files / CI secrets. */
const BASE_URL = process.env.BASE_URL || process.env.APP_URL;

/** True when running in CI (GitHub Actions and most CI providers set `CI`). */
const IS_CI = !!process.env.CI;

/**
 * Retry policy: an explicit `RETRY` value always wins; otherwise retry twice
 * in CI to absorb infrastructure flakiness, and never locally so failures
 * surface immediately while developing.
 */
function resolveRetries(): number {
    const raw = process.env.RETRY;
    if (raw !== undefined && raw !== '') {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
    return IS_CI ? 2 : 0;
}

export default defineConfig({
    // Where tests live and which files are treated as tests.
    testDir: './tests',
    testMatch: '**/*.spec.ts',

    // Per-test budget. The app is a Vite-served SPA whose first load can be
    // slow (especially cold on CI), so this is set above Playwright's 30s
    // default. Override per run with the CLI `--timeout`.
    timeout: 110 * 1000,

    // Per-assertion budget for web-first auto-retrying `expect(...)` matchers.
    expect: {
        timeout: 10 * 1000,
    },

    // Run test files in parallel by default.
    fullyParallel: true,

    // Never let a stray `test.only` silently shrink the CI suite.
    forbidOnly: IS_CI,

    // See resolveRetries() above.
    retries: resolveRetries(),

    // Tests share a single authenticated session (see the `auth-setup`
    // project), so CI runs on a single worker to keep that session stable and
    // results deterministic. Locally Playwright chooses a worker count from the
    // available CPUs. Override per run with the CLI `--workers`.
    workers: IS_CI ? 1 : 1,

    // Optional fail-fast; set MAX_FAILURES to stop the run after N failures.
    maxFailures: process.env.MAX_FAILURES ? parseInt(process.env.MAX_FAILURES, 10) : undefined,

    // Reporters: `list` for the console, `html`/`json`/`github` for inspection
    // and CI, and `allure-playwright` for the rich Allure report. The three
    // custom reporters are self-gating — each does nothing unless its `SEND_*`
    // env flag is set — and must stay last: the email reporter generates the
    // Allure HTML from allure-results/, so every earlier reporter's output must
    // already be flushed to disk.
    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['json', { outputFile: 'test-results/results.json' }],
        ['github'],
        ['allure-playwright', { outputFolder: 'allure-results', detail: true, suiteTitle: false }],
        ['./src/reporting/emailReporter.ts'], // gated by SEND_EMAIL + SMTP_*
        ['./src/reporting/slackReporter.ts'], // gated by SEND_SLACK + SLACK_WEBHOOK_URL
        ['./src/reporting/dashboard.ts'],     // gated by SEND_RESULT_ELK + ELK_URL
    ],

    // Root folder for per-test artifacts (traces, videos, screenshots).
    outputDir: 'test-results/',

    // One-time setup/teardown around the whole run.
    globalSetup: require.resolve('./src/fixtures/global-setup.ts'),
    globalTeardown: require.resolve('./src/fixtures/global-teardown.ts'),

    // Defaults applied to every project below.
    use: {
        // Base URL so tests and page objects can navigate with relative paths.
        baseURL: BASE_URL,

        // Full artifact capture on every test. Screenshots give the Allure
        // report visual context on every result; traces and videos provide
        // complete step-by-step debugging. To trim artifact size/time, switch
        // trace/video to 'retain-on-failure' or 'on-first-retry'.
        screenshot: 'on',
        trace: 'on',
        video: 'on',
    },

    projects: [
        // Logs in once with the configured credentials and persists the session
        // to .auth/user.json, which the browser projects below reuse so tests
        // start already authenticated.
        {
            name: 'auth-setup',
            testMatch: /.*\.setup\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },

        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                storageState: '.auth/user.json',
            },
            dependencies: ['auth-setup'],
        },

        // Enable more browsers by uncommenting; each reuses the shared
        // authenticated session from `auth-setup`.
        // {
        //     name: 'firefox',
        //     use: {
        //         ...devices['Desktop Firefox'],
        //         storageState: '.auth/user.json',
        //     },
        //     dependencies: ['auth-setup'],
        // },
        // {
        //     name: 'webkit',
        //     use: {
        //         ...devices['Desktop Safari'],
        //         storageState: '.auth/user.json',
        //     },
        //     dependencies: ['auth-setup'],
        // },
    ],
});
