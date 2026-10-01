/**
 * Offline unit specs for framework plumbing — `tests/tools/*.unit.spec.ts`.
 *
 * Deliberately a separate config rather than a project in `playwright.config.ts`.
 * These specs touch no app, no tenant, no browser and no auth state, so everything
 * the suite config exists for — the eight reporters, the Allure reset, the warm-up
 * probe, both residue passes, per-test traces and video — is cost with nothing to
 * buy. Wired as a project it took minutes to reach an assertion that runs in
 * milliseconds; standalone it is seconds, which is what makes it a thing anyone
 * will actually run.
 *
 * `npm run test:unit`. Never part of a suite run, never scheduled, never in CI's
 * matrix — it is what proves the pieces a suite run cannot: the UI-first write
 * guard's Proxy is only ever *not* exercised when it works, and a broken one
 * surfaces days later as an unrelated failure.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/tools',
    testMatch: '**/*.unit.spec.ts',
    // One worker: these assert on process-wide state (env vars, the guard's ledger).
    workers: 1,
    fullyParallel: false,
    retries: 0,
    // No artifacts: there is no browser to trace and no screen to shoot.
    use: { trace: 'off', video: 'off', screenshot: 'off' },
    reporter: [['list']],
    timeout: 30_000,
    expect: { timeout: 10_000 },
});
