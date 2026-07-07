import { defineConfig, devices } from '@playwright/test';
import { loadEnvFiles } from './src/config/envLoader';

// Load environment variables from `.env` + `env.<TEST_ENV>`
const { envName } = loadEnvFiles({ cwd: __dirname });

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
 * Comprehensive setup demonstrating all major Playwright features
 */
export default defineConfig({
    // Test directory
    testDir: './tests',

    // Test file pattern
    testMatch: '**/*.spec.ts',

    // Maximum time for a single test
    timeout: 30 * 1000,

    // Maximum time for expect() assertions
    expect: {
        timeout: 10 * 1000,
        toHaveScreenshot: {
            maxDiffPixels: 100,
            threshold: 0.2,
        },
        toMatchSnapshot: {
            maxDiffPixelRatio: 0.1,
        },
    },

    // Run tests in parallel
    fullyParallel: true,

    // Fail the build on CI if test.only is present
    forbidOnly: !!process.env.CI,

    // Retry failed tests (configurable via RETRY env variable)
    retries: resolveRetries(),

    // Number of parallel workers
    workers: process.env.CI ? 2 : undefined,

    // Reporter configuration
    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: "always" }],
        ['json', { outputFile: 'test-results/results.json' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
        // Custom email reporter — sends results + Playwright HTML report via email
        ['./src/reporting/emailReporter.ts'],
        // Allure reporter with screenshot attachments
        ['allure-playwright', {
            outputFolder: 'allure-results',
            detail: true,
            suiteTitle: true,
            environmentInfo: {
                node_version: process.version,
                os_platform: process.platform,
                test_env: envName || 'qe',
                project: 'Playwright POM Framework',
                branch: process.env.CI_COMMIT_REF_NAME || process.env.GITHUB_REF_NAME || 'local',
                user: process.env.USERNAME || process.env.USER || 'Unknown',
            },
        }],
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

        // Collect trace on first retry (attached to Allure)
        trace: 'on-first-retry',

        // Capture screenshot on failure (auto-attached to Allure)
        screenshot: 'on',

        // Record video on failure (attached to Allure)
        video: 'on-first-retry',

        // Full-screen viewport (works across all browsers including WebKit)
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
            args: ['--start-maximized'],
        },

        // Ignore HTTPS errors
        ignoreHTTPSErrors: true,

        // Action timeout
        actionTimeout: 15 * 1000,

        // Navigation timeout
        navigationTimeout: 30 * 1000,

        // Locale and timezone
        locale: 'en-US',
        timezoneId: 'America/New_York',

        // Geolocation (for location-based tests)
        geolocation: { longitude: -73.935242, latitude: 40.730610 },
        permissions: ['geolocation'],

        // Extra HTTP headers
        extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
        },
    },

    // Project configurations for different browsers and devices
    projects: [
        // Authentication setup project
        {
            name: 'auth-setup',
            testMatch: /.*\.setup\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },

        // Desktop Browsers
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1920, height: 1080 },
                storageState: '.auth/user.json',
            },
            dependencies: ['auth-setup'],
        },
        {
            name: 'firefox',
            use: {
                ...devices['Desktop Firefox'],
                viewport: { width: 1920, height: 1080 },
                storageState: '.auth/user.json',
            },
            dependencies: ['auth-setup'],
        },
        {
            name: 'webkit',
            use: {
                ...devices['Desktop Safari'],
                viewport: { width: 1920, height: 1080 },
                storageState: '.auth/user.json',
            },
            dependencies: ['auth-setup'],
        },

        // // Mobile Devices
        // {
        //     name: 'mobile-chrome',
        //     use: {
        //         ...devices['Pixel 5'],
        //         storageState: '.auth/user.json',
        //     },
        //     dependencies: ['auth-setup'],
        // },
        // {
        //     name: 'mobile-safari',
        //     use: {
        //         ...devices['iPhone 12'],
        //         storageState: '.auth/user.json',
        //     },
        //     dependencies: ['auth-setup'],
        // },

        // // Tablet Devices
        // {
        //     name: 'tablet',
        //     use: {
        //         ...devices['iPad Pro 11'],
        //         storageState: '.auth/user.json',
        //     },
        //     dependencies: ['auth-setup'],
        // },

        // API Testing (no browser needed for pure API tests)
        // {
        //     name: 'api',
        //     testMatch: /.*api.*\.spec\.ts/,
        //     use: {
        //         baseURL: process.env.API_URL || 'https://jsonplaceholder.typicode.com',
        //     },
        // },

        // // Visual Regression Tests
        // {
        //     name: 'visual',
        //     testMatch: /.*visual.*\.spec\.ts/,
        //     use: {
        //         ...devices['Desktop Chrome'],
        //         // Consistent viewport for visual tests
        //         viewport: { width: 1920, height: 1080 },
        //     },
        // },

        // // Accessibility Tests
        // {
        //     name: 'accessibility',
        //     testMatch: /.*a11y.*\.spec\.ts/,
        //     use: { ...devices['Desktop Chrome'] },
        // },

        // // No-auth project — runs auth tests without pre-authenticated storageState
        // {
        //     name: 'no-auth',
        //     testDir: './tests/auth',
        //     use: { ...devices['Desktop Chrome'] },
        // },

    ],

    // Web server configuration (optional - for local development)
    // webServer: {
    //   command: 'npm run start',
    //   url: 'http://localhost:3000',
    //   reuseExistingServer: !process.env.CI,
    //   timeout: 120 * 1000,
    // },
});
