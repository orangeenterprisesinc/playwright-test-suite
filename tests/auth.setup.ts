/**
 * @fileoverview Authentication setup — runs once before the browser projects.
 *
 * Logs into PET Tiger with the configured credentials and persists the
 * session to `.auth/user.json`, which every browser project loads as its
 * storageState so authenticated tests skip the login UI.
 *
 * The redirect wait and sidebar landmark assertion below confirm the login
 * actually succeeded before the session is saved; keep their ordering.
 */
import { expect, test as setup } from '@fixtures/base.fixture';

/**
 * How long to wait for the post-login redirect. Generous on purpose: this is
 * the first real interaction with the app, so it absorbs any start-up cost the
 * global-setup warm-up did not (the auth-setup project raises its own test
 * timeout to match). Override with `LOGIN_REDIRECT_TIMEOUT_MS`.
 */
const REDIRECT_TIMEOUT_MS = Number(process.env.LOGIN_REDIRECT_TIMEOUT_MS ?? 60_000);

setup('Global setup for Auto Login', async ({ page, loginPage, leftNavigationPage }) => {
    // Above the config's 110s global timeout. This single test gates every
    // browser test and is the first thing to touch the app, so it absorbs any
    // cold-start cost the global-setup warm-up did not. Its own waits (60s
    // redirect + 30s landmark) have to fit inside this budget — otherwise the
    // test times out mid-wait and the precise failure message those waits
    // produce is thrown away and replaced by a bare "test timeout exceeded".
    setup.setTimeout(180_000);

    const userName = process.env.USER_NAME;
    const password = process.env.PASSWORD;

    // Without this the failure surfaces deep inside locator.fill() as
    // "expected string, got undefined", which says nothing about the real
    // cause: env.dev/env.qa ship without PASSWORD by design, so it has to come
    // from .env locally or from repo secrets in CI.
    if (!userName || !password) {
        const missing = [!userName && 'USER_NAME', !password && 'PASSWORD'].filter(Boolean);
        throw new Error(
            `Missing credential(s) for TEST_ENV=${process.env.TEST_ENV || 'local'}: ${missing.join(', ')}. ` +
                `Set them in your gitignored .env (locally) or as CI secrets.`,
        );
    }

    await loginPage.gotoPetTiger();
    await loginPage.loginPetTiger(userName, password);

    // Wait for the redirect out of /login into the authenticated app shell —
    // but race it against the app's own rejection message, because the two
    // failures are indistinguishable from a bare navigation wait. Wrong
    // credentials leave the browser sitting on /login exactly like a slow app
    // does, so a plain waitForURL reports "Timeout ... waiting for navigation"
    // for both, and a bad CI secret gets triaged as flakiness for hours.
    const redirected = page.waitForURL((url) => !url.toString().includes('/login'), {
        timeout: REDIRECT_TIMEOUT_MS,
    });
    const rejected = loginPage.invalidCredentialsErrorMessage
        .waitFor({ state: 'visible', timeout: REDIRECT_TIMEOUT_MS })
        .then(() => {
            throw new Error(
                `Login rejected by the app for user "${userName}" (TEST_ENV=${process.env.TEST_ENV || 'local'}): ` +
                    `it displayed "Invalid username or password.". The app is reachable — this is a credential ` +
                    `problem, so check USER_NAME/PASSWORD in your .env or the CI secrets for this environment.`,
            );
        });

    // Whichever settles first decides the outcome. The loser stays pending and
    // rejects later (on its own timeout, or when the context closes), so give
    // both a no-op handler — Promise.race leaves the loser's rejection
    // unhandled, which crashes the worker with an unhandled rejection.
    redirected.catch(() => {});
    rejected.catch(() => {});

    await Promise.race([redirected, rejected]);

    // Confirm a post-login landmark before persisting the session, so a session
    // that redirected but never actually rendered the shell is not saved.
    await expect(leftNavigationPage.searchMenu).toBeVisible({ timeout: 30000 });

    await page.context().storageState({ path: '.auth/user.json' });
});
