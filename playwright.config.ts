import { defineConfig, devices } from '@playwright/test';
import { loadEnvFiles } from './src/config/envLoader';

// Load environment variables from `.env` + `env.<TEST_ENV>`
loadEnvFiles({ cwd: __dirname });

// Environment configuration
const BASE_URL = process.env.BASE_URL || process.env.APP_URL;

// Dynamic retry: RETRY env/config > CI default (2) > local default (0)
function resolveRetries(): number {
    const raw = process.env.RETRY;
    if (raw !== undefined && raw !== '') {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
    return process.env.CI ? 2 : 0;
}

/**
 * Playwright Test Configuration
 *
 * Timeouts, artifact policy and CI worker count are carried over from the
 * original demo framework — they are proven against the PET Tiger app and
 * its full-stack CI environment.
 */
export default defineConfig({
    // Test directory
    testDir: './tests',

    // Test file pattern
    testMatch: '**/*.spec.ts',

    // Maximum time for a single test — the PET Tiger stack (Vite dev server
    // on CI) can be slow on first load; 110s is the proven value.
    timeout: 110 * 1000,

    // Maximum time for expect() assertions
    expect: {
        timeout: 10 * 1000,
    },

    // Run tests in parallel
    fullyParallel: true,

    // Fail the build on CI if test.only is present
    forbidOnly: !!process.env.CI,

    // Retry failed tests (configurable via RETRY env variable)
    retries: resolveRetries(),

    // Auth state is shared across tests via storageState, so keep execution
    // serial on CI.
    workers: process.env.CI ? 1 : undefined,

    // Reporter configuration
    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['json', { outputFile: 'test-results/results.json' }],
        ['github'],
        ['allure-playwright', { outputFolder: 'allure-results', detail: true, suiteTitle: false }],
        // Emails a run summary; self-gating — does nothing unless
        // SEND_EMAIL=yes and the SMTP_* settings are present. Must stay last:
        // it generates the Allure HTML report from allure-results/ above and
        // needs every other reporter's output already flushed to disk.
        ['./src/reporting/emailReporter.ts'],
        // Posts a run summary to Slack via Incoming Webhook; self-gating —
        // does nothing unless SEND_SLACK=yes and SLACK_WEBHOOK_URL is set.
        ['./src/reporting/slackReporter.ts'],
    ],

    // Output directory for test artifacts
    outputDir: 'test-results/',

    // Global setup/teardown
    globalSetup: require.resolve('./src/fixtures/global-setup.ts'),
    globalTeardown: require.resolve('./src/fixtures/global-teardown.ts'),

    // Shared settings for all projects
    use: {
        // Base URL for navigation
        baseURL: BASE_URL,

        // Collect artifacts only when a test fails
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },

    // Project configurations
    projects: [
        // Authentication setup project — logs in once and persists the
        // session to .auth/user.json for the browser projects below.
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
