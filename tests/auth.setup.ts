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
import { ConfigProperties, getConfigValue } from '@config/configProperties';

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

    // `|| undefined` keeps the fail-loud check below working: getConfigValue
    // returns '' when unset.
    const userName = getConfigValue(ConfigProperties.USER_NAME) || undefined;
    const password = getConfigValue(ConfigProperties.PASSWORD) || undefined;

    // Without this the failure surfaces deep inside locator.fill() as
    // "expected string, got undefined", which says nothing about the real
    // cause: .env.dev/env.qa ship without PASSWORD by design, so it has to come
    // from .env locally or from repo secrets in CI.
    if (!userName || !password) {
        const missing = [!userName && 'USER_NAME', !password && 'PASSWORD'].filter(Boolean);
        throw new Error(
            `Missing credential(s) for TEST_ENV=${process.env.TEST_ENV || 'local'}: ${missing.join(', ')}. ` +
                `Set them in your gitignored .env (locally) or as CI secrets.`,
        );
    }
    // Narrowed copies for the closure below — TypeScript does not carry the
    // guard's narrowing into a nested function declaration.
    const loginUser: string = userName;
    const loginPassword: string = password;

    // Ride out a dev-API restart: when the login POST answers 5xx, wait and
    // re-attempt instead of failing the whole suite. Playwright-level retries
    // already exist but all three land within ~8 seconds — far shorter than an
    // API restart. Two real incidents (2026-08-30 16:58Z, 2026-09-01 00:50Z)
    // took the suite down with a 500 that had cleared minutes later. Only 5xx
    // is retried; 4xx and UI rejections are credential problems and still fail
    // immediately. Backoffs (10s + 25s + 50s) plus the fast-failing 5xx
    // attempts fit inside this test's 180s budget because a 5xx answers in
    // milliseconds, long before any 60s redirect wait matters.
    const serverErrorBackoffsMs = [10_000, 25_000, 50_000];
    for (let attempt = 0; ; attempt++) {
        try {
            await attemptUiLogin();
            break;
        } catch (err) {
            const is5xx = err instanceof Error && /returned HTTP 5\d\d/.test(err.message);
            const waitMs = serverErrorBackoffsMs[attempt];
            if (!is5xx || waitMs === undefined) throw err;
            console.warn(
                `auth setup: login attempt ${attempt + 1} hit a server error — ` +
                    `likely a mid-deploy restart; retrying in ${waitMs / 1000}s. (${err.message.slice(0, 120)})`,
            );
            await new Promise((r) => setTimeout(r, waitMs));
        }
    }

    // One full UI login attempt: navigate, click, and race the three outcomes.
    // Throws with the HTTP status in the message on an API failure, which the
    // retry loop above uses to distinguish 5xx (retry) from 4xx (fail now).
    async function attemptUiLogin(): Promise<void> {
    await loginPage.gotoPetTiger();

    // Registered after the page is up but BEFORE the click, so the response
    // cannot land before anyone is listening.
    //
    // `timeout: 0` is load-bearing. This watcher is a notification, not a
    // deadline — the redirect wait below owns the deadline. With a timeout of
    // its own it can expire while the login form is still rendering, and since
    // its handler is not attached until after loginPetTiger() returns, that
    // rejection is unhandled and aborts the whole test with a phantom
    // "waitForResponse timeout" that hides what was actually happening. A cold
    // CI run did exactly that: the Email field took ~47s to appear and the
    // real 500 never got a chance to be reported.
    const failedLogin = page.waitForResponse(
        (response) =>
            /\/auth\/login\/?$/.test(new URL(response.url()).pathname) && !response.ok(),
        { timeout: 0 },
    );
    // On a successful login this stays pending and then rejects when the
    // context closes, so it needs a handler from the moment it exists.
    failedLogin.catch(() => {});

    await loginPage.loginPetTiger(loginUser, loginPassword);

    // Clicking Login has three possible outcomes and only one is success, so
    // watch for all of them. A bare waitForURL cannot tell them apart: wrong
    // credentials, a 500 from the API, and a genuinely slow app all leave the
    // browser sitting on /login, and all three report the same useless
    // "Timeout ... waiting for navigation". That cost a CI run 4 minutes of
    // retries to say nothing, when the API had already answered HTTP 500 in 4ms
    // and the reason was sitting in its log.
    const redirected = page.waitForURL((url) => !url.toString().includes('/login'), {
        timeout: REDIRECT_TIMEOUT_MS,
    });

    // The HTTP status is the authoritative signal — it distinguishes "the app
    // said no" from "the app broke" without depending on UI copy.
    const apiRejected = failedLogin.then(async (response) => {
        const status = response.status();
        const body = (await response.text().catch(() => '')).trim().slice(0, 300);
        const diagnosis =
            status === 401 || status === 403
                ? `The API rejected these credentials. Check USER_NAME/PASSWORD in your .env (locally) or ` +
                  `the CI secrets for this environment.`
                : `The API itself failed — this is NOT a test or credential problem. Check the API's own log ` +
                  `(api.log in the runner workspace on CI, or the apps/api console locally); a schema mismatch ` +
                  `between the app build and the local databases surfaces exactly like this.`;
        throw new Error(
            `Login POST returned HTTP ${status} for user "${userName}" ` +
                `(TEST_ENV=${process.env.TEST_ENV || 'local'}). ${diagnosis}` +
                (body ? ` Response body: ${body}` : ''),
        );
    });

    // Kept as a backstop for an app that renders a rejection without failing the
    // request, which no status check would catch.
    const uiRejected = loginPage.invalidCredentialsErrorMessage
        .waitFor({ state: 'visible', timeout: REDIRECT_TIMEOUT_MS })
        .then(() => {
            throw new Error(
                `Login rejected by the app for user "${userName}" (TEST_ENV=${process.env.TEST_ENV || 'local'}): ` +
                    `it displayed "Invalid username or password.". The app is reachable — this is a credential ` +
                    `problem, so check USER_NAME/PASSWORD in your .env or the CI secrets for this environment.`,
            );
        });

    // Whichever settles first decides the outcome. The losers stay pending and
    // reject later (on their own timeout, or when the context closes), so give
    // each a no-op handler — Promise.race leaves a loser's rejection unhandled,
    // which crashes the worker.
    const outcomes = [redirected, apiRejected, uiRejected];
    for (const outcome of outcomes) outcome.catch(() => {});

    await Promise.race(outcomes);
    }

    // Confirm a post-login landmark before persisting the session, so a session
    // that redirected but never actually rendered the shell is not saved.
    await expect(leftNavigationPage.searchMenu).toBeVisible({ timeout: 30000 });

    await page.context().storageState({ path: '.auth/user.json' });
});
