/**
 * @fileoverview Test fixture for the migrated web-pet suite.
 *
 * Extends `@playwright/test` and composes the framework's building blocks —
 * `executionGate`, `applyAllureLabels`, the lifecycle listeners — rather than
 * extending `src/fixtures/base.fixture.ts`.
 *
 * ## Why not extend base.fixture
 *
 * `base.fixture`'s gate resolves ids through `DataProvider`, a process-wide
 * singleton bound to `src/data/runner/`. Web-pet rows live in
 * `src/data/webpet/`, so every `WP-####` would fall into the "has no runner row
 * — configuration error" branch: **all 406 tests skip and the run reports
 * green.** There is no per-project escape hatch (`DataProvider.forSource()`
 * overrides the source *type*, never the directory), which is why this suite
 * gets its own row source and its own gate call site but the *same* decision
 * function.
 *
 * ## Why the gate is an auto fixture
 *
 * A module-level `test.beforeEach` attaches to whichever file suite is loading at
 * that instant, and the fixture module body runs once per worker process, so it
 * fires for the **first spec file each worker loads and no others** — measured,
 * not inferred. An auto fixture fires for every test, and resolves before the test
 * function's declared parameters, so a skip prevents `context`/`page`/`request`
 * from ever being created.
 *
 * `base.fixture` made exactly that mistake and has since been converted to a
 * `gate` auto fixture too; neither suite may go back to a `beforeEach`.
 *
 * ## What must not change
 *
 * The `context` / `page` / `request` overrides are relocated verbatim from
 * `tests/webpet/fixtures.ts`, down to **which keys are passed** to
 * `browser.newContext()` and `playwright.request.newContext()`. Playwright
 * injects a project's `use` options only where a key is *absent*, so today
 * `locale` reaches the browser context while `Accept-Language` does **not**
 * reach the authed request context (that call already passes
 * `extraHTTPHeaders`). Passing an extra key here — even a "more correct" one —
 * silently changes what the API sees.
 */
import { expect, test as base } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { API_BASE_URL } from '../config/webpetEnv';
import { WEBPET_ADMIN_STORAGE, WEBPET_RESTRICTED_STORAGE } from '../config/webpetPaths';
import { applyWebpetGate } from './gate/webpetGate';
import { createWebpetPages, type WebpetPages } from './webpetPages.fixture';
import { onTestStart, onTestEnd } from './lifecycle/testLifecycleManager';

export { expect };
/** Re-exported so specs can type a helper's `page` parameter without a second import. */
export type { Page } from '@playwright/test';

/**
 * Cookie names the Go API uses for the CSRF token, gated on `PT_COOKIE_SECURE`
 * (mirrors `provision.ts`'s `CSRF_COOKIE_NAMES` and the browser's own
 * `readCsrfToken()` in `shared/lib/csrf.ts`).
 */
const CSRF_COOKIE_NAMES = ['__Host-pt_csrf', 'pt_csrf'];

/**
 * Whether the crew-scoped `RestrictedTest_*` user was provisioned.
 *
 * Evaluated at **module load**, exactly as before. Do not make this lazy during
 * the conversion batches: it decides a skip, and moving when it is evaluated
 * could flip one, which would read as a regression in the baseline diff.
 */
export const restrictedAuthAvailable: boolean = existsSync(WEBPET_RESTRICTED_STORAGE);

/**
 * Reads the CSRF token cookie out of a persisted storageState file so it can be
 * echoed as `X-CSRF-Token` on every request made through the authed `request`
 * fixture. Without it every PUT/POST/DELETE silently 403s on the API's
 * double-submit check — `extraHTTPHeaders` is fixed at context-creation time
 * (Playwright has no per-call override), so the token has to be read up front,
 * before the context exists, not attached after the fact.
 */
function csrfTokenFromStorageFile(path: string): string | undefined {
    if (!existsSync(path)) return undefined;
    const state = JSON.parse(readFileSync(path, 'utf-8')) as {
        cookies?: Array<{ name: string; value: string }>;
    };
    const cookies = state.cookies ?? [];
    for (const name of CSRF_COOKIE_NAMES) {
        const hit = cookies.find((c) => c.name === name);
        if (hit) return decodeURIComponent(hit.value);
    }
    return undefined;
}

export const test = base.extend<{ _webpetGate: void; pages: WebpetPages }>({
    /**
     * Every web-pet page object, lazily built — `pages.cropForm`, `pages.cropList`, …
     * Unconverted specs simply never destructure it and pay nothing.
     */
    pages: async ({ page }, use) => {
        await use(createWebpetPages(page));
    },

    /** Per-test run control. Auto so it fires for every test, in every spec file. */
    _webpetGate: [
        async ({}, use, testInfo) => {
            onTestStart(testInfo);
            await applyWebpetGate(testInfo);
            await use();
            onTestEnd(testInfo);
        },
        { auto: true },
    ],

    context: async ({ browser }, use) => {
        const ctx = await browser.newContext({ storageState: WEBPET_ADMIN_STORAGE });

        // Pin every spec to English so text assertions are language-stable
        // regardless of the seeded user's Users.Language value or OS locale.
        // addInitScript runs before any app code on every page in this context,
        // making it the earliest possible hook for localStorage writes.
        //
        // Per-test override: call
        //   await page.context().addInitScript(() => {
        //     window.localStorage.setItem('pt.locale', 'es-MX');
        //   });
        // BEFORE the first page.goto() in that test, to shadow this default.
        await ctx.addInitScript(() => {
            window.localStorage.setItem('pt.locale', 'en');
        });

        // Intercept the session bootstrap and rewrite user.language to 'en' so
        // the AuthProvider's hydration effect cannot override the pin above when
        // the seeded user has language='es' in the DB. Without this the pin is
        // clobbered immediately after login by
        // AuthProvider.useEffect → i18n.changeLanguage(user.language).
        // Test-only patch of the response body; the DB is untouched.
        await ctx.route('**/api/session/me', async (route) => {
            try {
                const response = await route.fetch();
                const body = (await response.json().catch(() => null)) as {
                    user?: Record<string, unknown>;
                } | null;
                if (body?.user && typeof body.user === 'object') {
                    body.user.language = 'en';
                }
                await route.fulfill({ response, json: body });
            } catch (error) {
                // This handler does a real round trip, so it can still be in
                // flight when the page closes — any test whose last assertion
                // resolves on the first poll (toHaveCount(0), toBeHidden on an
                // element that never mounts) ends before the session bootstrap
                // lands. Playwright fails the test on a throwing route callback,
                // so a teardown race would be reported as a product failure.
                if (!/has been closed/i.test(String(error))) throw error;
            }
        });

        await use(ctx);
        await ctx.close();
    },

    page: async ({ context }, use) => {
        const page = await context.newPage();
        await use(page);
        await page.close();
    },

    /**
     * Playwright's built-in `request` fixture is NOT seeded with the captured
     * cookies (only `context`/`page` are), so specs using `{ request }` would hit
     * `/api/*` unauthenticated → 401. Carries the admin storage state plus
     * `Origin` and `X-CSRF-Token`, satisfying both the API's Origin check and its
     * RequireCSRF double-submit check — Origin alone is not sufficient, and
     * without the token header every mutating call silently 403s, which was
     * masking real conflicts in the 409-handling specs.
     */
    request: async ({ playwright, baseURL }, use) => {
        const csrfToken = csrfTokenFromStorageFile(WEBPET_ADMIN_STORAGE);
        const ctx = await playwright.request.newContext({
            // API_BASE_URL === the web origin on localhost (Vite proxy,
            // byte-identical to the source repo); on dev staging it is the
            // separate API host — the SPA host serves index.html for every /api/*
            // path. Origin stays the web origin either way.
            baseURL: API_BASE_URL,
            storageState: WEBPET_ADMIN_STORAGE,
            extraHTTPHeaders: {
                ...(baseURL ? { Origin: baseURL } : {}),
                ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
            },
        });
        await use(ctx);
        await ctx.dispose();
    },
});
