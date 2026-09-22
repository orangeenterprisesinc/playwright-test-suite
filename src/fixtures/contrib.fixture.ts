/**
 * @fileoverview Test fixture for the developer-contribution lane (`tests/contrib/`).
 *
 * A thin extension of `webpet.fixture`'s `test`: it keeps that fixture's
 * browser context (locale-pinned, session-bootstrap patched), its CSRF-seeded
 * `request`, and its `pages` registry, and swaps **only** the gate — contrib
 * specs resolve their ids against `src/data/contrib/`, not
 * `src/data/webpet/`.
 *
 * ## Why swapping the gate is the whole job
 *
 * A contrib spec importing `webpet.fixture` directly would look fine and pass
 * review: its `testCaseId` is simply absent from `webpetRunnerManager.csv`, so
 * `webpetGate` takes the "claimed id with no row is a configuration error"
 * branch and **skips it green**. Nothing fails, nothing is reported, and the
 * contribution silently never runs. `contrib:runner:check` therefore rejects a
 * spec in this directory that imports any other fixture — the import line is a
 * correctness constraint here, not a style preference.
 *
 * ## Why extend web-pet's fixture rather than base.fixture
 *
 * Contrib specs test web-pet features against the same dev-staging app the
 * web-pet suite drives, so they need that suite's auth (the `webpet-setup`
 * project's storage state, not `.auth/user.json`), its page objects, and its
 * CSRF handling. Extending `base.fixture` would mean reimplementing all three
 * and binding ids to `src/data/runner/` — every contrib id would resolve to
 * "no runner row" and skip.
 */
import { expect, probeAdminSession, test as webpetTest } from './webpet.fixture';
import { applyContribGate } from './gate/contribGate';
import { onTestStart, onTestEnd } from './lifecycle/testLifecycleManager';

export { expect };
export type { Page } from '@playwright/test';

export const test = webpetTest.extend<{ _webpetGate: void }>({
    /**
     * Replaces the inherited web-pet gate wholesale — same mid-run session
     * self-heal, different row source.
     *
     * No `{ auto: true }` here: Playwright takes the option from the fixture
     * being overridden and rejects an override that restates it. It is already
     * auto in `webpet.fixture`, and this still fires for every test.
     */
    _webpetGate: async ({ playwright }, use, testInfo) => {
        onTestStart(testInfo);
        await applyContribGate(testInfo);
        await probeAdminSession(playwright, testInfo);
        await use();
        onTestEnd(testInfo);
    },
});
