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
 * The migrated web-pet suite (tests/webpet) is opt-in: its projects are only
 * materialized when explicitly requested, so a bare `npx playwright test`
 * (developer machines, e2e.yml, e2e-local.yml) never picks up its ~406 tests
 * (~48 min, requires the full local web-pet stack). Activated by WEBPET=1 or
 * by asking for the project on the CLI (`--project=webpet`); the npm scripts
 * and scripts/run-playwright.js set the env var for worker processes too.
 */
const WEBPET_ENABLED =
    process.env.WEBPET === '1' ||
    process.argv.some(
        (arg, i, argv) =>
            arg.startsWith('--project=webpet') ||
            (arg === '--project' && (argv[i + 1] ?? '').startsWith('webpet')),
    );
// Worker processes re-evaluate this config with a different argv, so persist
// the decision into the environment — children inherit it and materialize the
// same project list (otherwise workers die with "Project not found").
if (WEBPET_ENABLED) process.env.WEBPET = '1';

/**
 * Parity mode for the migrated suite. ON by default: the `webpet` project keeps
 * the SOURCE repo's run settings (30s test / 5s expect / retries 0 / no video),
 * so a run of the converted suite is still comparable with the source repo's
 * localhost acceptance baseline (362 passed / 18 skipped / 26 failed).
 *
 * `WEBPET_PARITY=0` previews the end state — this repo's globals (110s / 10s /
 * CI retries 2 / video+screenshot on / trace retain-on-failure) — which is a
 * genuinely different beast: video-on across 406 tests is multi-gigabyte and CI
 * retries turn flake into green. Preview it before committing to it.
 *
 * ## Why this flag outlived the conversion (Batch 15)
 *
 * The plan had the final batch delete it. It is deliberately still here, because
 * deleting it now would destroy the only regression signal the alignment has
 * left. The per-test baseline manifest (`src/data/webpet/baselines/`) was never
 * captured — it needs the seeded stack — so the 362/18/26 aggregate is the sole
 * remaining check that fourteen batches of rewriting preserved behaviour. Flip
 * the run settings first and any delta becomes unattributable: conversion bug or
 * a 110s timeout papering over a hang? No way to tell.
 *
 * Deleting this flag and its conditionals is therefore gated on exactly one
 * thing: **a parity run of the converted suite on the seeded stack that
 * reproduces 362/18/26** (or explains each delta). After that, capture the
 * per-test manifest, delete the flag, and re-capture the manifest under the
 * framework globals — the config should not settle into a permanent two-mode
 * state.
 */
const WEBPET_PARITY = process.env.WEBPET_PARITY !== '0';

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
    workers: IS_CI ? 2 : 4,

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
        ['html', { outputFolder: 'artifacts/html', open: 'never' }],
        ['json', { outputFile: 'artifacts/results/results.json' }],
        ['github'],
        // NOTE: the key is `resultsDir`, NOT `outputFolder`. allure-playwright v3
        // reads `options.resultsDir` (AllurePlaywrightReporterConfig extends
        // allure-js-commons' ReporterConfig); an `outputFolder` key is silently
        // ignored, and its default happens to be `allure-results` — so the old
        // `outputFolder: 'allure-results'` only ever "worked" by coincidence and
        // would have kept writing to the repo root once that default no longer
        // matched. Playwright types reporter options as `any`, so nothing warns.
        ['allure-playwright', { resultsDir: 'artifacts/allure/results', detail: true, suiteTitle: false }],
        ['./src/reporting/deliver/emailReporter.ts'], // gated by SEND_EMAIL + SMTP_*
        ['./src/reporting/deliver/slackReporter.ts'], // gated by SEND_SLACK + SLACK_WEBHOOK_URL
        ['./src/reporting/deliver/dashboard.ts'],     // gated by SEND_RESULT_ELK + ELK_URL
    ],

    // Root folder for per-test artifacts (traces, videos, screenshots). Every
    // run output in this repo lives under a single `artifacts/` tree — results,
    // the HTML report, the Allure results/report, and the framework logs — so
    // "where did the report go" has one answer and .gitignore has one line.
    // See docs/STRUCTURE.md.
    outputDir: 'artifacts/results/',

    // One-time setup/teardown around the whole run.
    globalSetup: require.resolve('./src/fixtures/lifecycle/global-setup.ts'),
    globalTeardown: require.resolve('./src/fixtures/lifecycle/global-teardown.ts'),

    // Defaults applied to every project below.
    use: {
        // Base URL so tests and page objects can navigate with relative paths.
        baseURL: BASE_URL,

        // Full artifact capture on every test. Screenshots give the Allure
        // report visual context on every result; traces and videos provide
        // complete step-by-step debugging. To trim artifact size/time, switch
        // trace/video to 'retain-on-failure' or 'on-first-retry'.
        screenshot: 'on',
        trace: 'retain-on-failure',
        video: 'on',
    },

    projects: [
        // Logs in once with the configured credentials and persists the session
        // to .auth/user.json, which the browser projects below reuse so tests
        // start already authenticated.
        {
            name: 'auth-setup',
            // Scoped to the exact file: the previous /.*\.setup\.ts/ regex was
            // unanchored and would also capture unrelated setup files (e.g. the
            // migrated suite's webpet.setup.ts, which has its own project).
            testMatch: '**/auth.setup.ts',
            use: { ...devices['Desktop Chrome'] },
        },

        {
            name: 'chromium',
            // API specs run in their own browserless `api` project below; ignore
            // them here so they don't double-run (and needlessly pull in
            // auth-setup / browser storageState) under the browser project.
            // tests/webpet is the migrated web-pet suite — it runs only under
            // its own opt-in `webpet` project (different auth + parity settings).
            // tests/seed.spec.ts is the Playwright agents' scratch page, not a
            // test: it has no runner row and no tier tag, so collecting it would
            // put an untagged no-op in every run and fail `npm run runner:check`.
            testIgnore: ['**/tests/api/**', '**/tests/webpet/**', '**/tests/seed.spec.ts'],
            use: {
                ...devices['Desktop Chrome'],
                storageState: '.auth/user.json',
            },
            dependencies: ['auth-setup'],
        },

        // API-only specs (tests/api/*.spec.ts). No browser, no storageState, and
        // no auth-setup dependency — src/fixtures/api.fixture.ts creates its own
        // request context and applies the configured AUTH_TYPE strategy itself.
        {
            name: 'api',
            testDir: './tests/api',
        },

        // ── Migrated web-pet suite (tests/webpet) — opt-in, see WEBPET_ENABLED ──
        // Two run states, selected by WEBPET_PARITY (see above):
        //   parity (default) — 30s test / 5s expect / retries 0 / no video,
        //                      reproducing the source repo's localhost baseline
        //                      so each conversion batch is provably behaviour-
        //                      preserving.
        //   framework        — inherits this file's globals, simply by not
        //                      overriding them.
        // `locale` + `Accept-Language` are NOT parity pins: the suite asserts
        // English copy and the fixture pins pt.locale to match, so they survive
        // the flip. Same for the deliberate absence of storageState.
        ...(WEBPET_ENABLED
            ? [
                  {
                      // Ports the source repo's globalSetup (admin API login →
                      // storage state + best-effort RestrictedTest provisioning)
                      // as a dependency project: its failure fails ONLY the
                      // webpet project below (this repo's globalSetup slot is
                      // already taken by src/fixtures/global-setup.ts).
                      name: 'webpet-setup',
                      testDir: './tests/webpet',
                      testMatch: '**/webpet.setup.ts',
                      timeout: 120 * 1000,
                      retries: 0,
                      use: {
                          trace: 'off' as const,
                          video: 'off' as const,
                          screenshot: 'off' as const,
                      },
                  },
                  {
                      name: 'webpet',
                      testDir: './tests/webpet',
                      dependencies: ['webpet-setup'], // NOT auth-setup; no .auth/user.json
                      ...(WEBPET_PARITY
                          ? {
                                timeout: 30 * 1000,
                                retries: 0,
                                expect: { timeout: 5 * 1000 },
                            }
                          : {}),
                      use: {
                          ...devices['Desktop Chrome'],
                          locale: 'en-US',
                          extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
                          ...(WEBPET_PARITY
                              ? {
                                    trace: 'on-first-retry' as const,
                                    video: 'off' as const,
                                    screenshot: 'off' as const,
                                }
                              : {}),
                          // NO storageState: src/fixtures/webpet.fixture.ts seeds its
                          // own contexts from tests/webpet/.auth, and notifications.spec.ts's
                          // clean-context tests must start unauthenticated (matching
                          // the source config).
                      },
                  },
              ]
            : []),

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
