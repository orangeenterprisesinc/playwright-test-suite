import { test as base, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { API_BASE_URL } from './support/webpet-env'
import { applyWebpetGate } from './support/webpet-gate'

export { expect }
// Some specs import the Page type from here (e.g. reconcile-job-cards.spec.ts).
// The source repo never typechecked its e2e folder so the missing re-export
// went unnoticed; this repo's `npm run typecheck` covers tests/**.
export type { Page } from '@playwright/test'

// Migration note: the source repo resolved these from process.cwd()/e2e —
// anchored to this file instead so the suite is location-independent.
const ADMIN_STORAGE = join(__dirname, '.auth', 'storage.json')
const RESTRICTED_STORAGE = join(__dirname, '.auth', 'storage-restricted.json')

// Cookie names the Go API uses for the CSRF token, gated on PT_COOKIE_SECURE
// (mirrors global-setup.ts's CSRF_COOKIE_NAMES and the browser's own
// readCsrfToken() in shared/lib/csrf.ts).
const CSRF_COOKIE_NAMES = ['__Host-pt_csrf', 'pt_csrf']

/**
 * Reads the CSRF token cookie out of a persisted storageState file so it can
 * be echoed as X-CSRF-Token on every request made through the authed
 * `request` fixture below. Without this, every PUT/POST/DELETE issued via
 * `request` silently 403s on the API's RequireCSRF double-submit check —
 * `extraHTTPHeaders` is fixed at context-creation time (Playwright has no
 * per-call override), so the token has to be read up front, before the
 * context is created, not attached after the fact. Returns undefined (no
 * header added) if the file or cookie is missing.
 */
function csrfTokenFromStorageFile(path: string): string | undefined {
  if (!existsSync(path)) return undefined
  const state = JSON.parse(readFileSync(path, 'utf-8')) as {
    cookies?: Array<{ name: string; value: string }>
  }
  const cookies = state.cookies ?? []
  for (const name of CSRF_COOKIE_NAMES) {
    const hit = cookies.find((c) => c.name === name)
    if (hit) return decodeURIComponent(hit.value)
  }
  return undefined
}

/**
 * Extended test fixture that starts each page inside a browser context
 * pre-seeded with the pt_session + pt_csrf cookies captured in global-setup.
 *
 * With the /api/session/me bootstrap contract, authentication is driven by
 * cookies rather than sessionStorage. Tests that need a clean (unauthenticated)
 * context should import `test` from `@playwright/test` directly instead.
 */
export const test = base.extend<{ _webpetGate: void }>({
  // Per-test run control against src/data/webpet/webpetRunnerManager.json
  // (WP-#### rows; fail-open — see support/webpet-gate.ts).
  _webpetGate: [
    async ({}, use, testInfo) => {
      applyWebpetGate(testInfo)
      await use()
    },
    { auto: true },
  ],
  context: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: ADMIN_STORAGE })

    // L7 — Pin every spec to English so text assertions are language-stable
    // regardless of the seeded user's Users.Language value or OS locale.
    //
    // addInitScript runs before any app code on every page in this context,
    // making it the earliest possible hook for localStorage writes.
    //
    // Per-test locale override: if a spec needs to test Spanish copy, call
    //   await page.context().addInitScript(() => {
    //     window.localStorage.setItem('pt.locale', 'es-MX');
    //   });
    // _before_ the first page.goto() in that test, which will shadow this default.
    await ctx.addInitScript(() => {
      window.localStorage.setItem('pt.locale', 'en')
    })

    // L7 follow-up — intercept the session bootstrap and rewrite user.language
    // to 'en' so the AuthProvider's hydration effect can't override the
    // localStorage pin above when the seeded user has language='es' or 'es-MX'
    // in the DB. Without this, the localStorage pin is clobbered immediately
    // after login by AuthProvider.useEffect → i18n.changeLanguage(user.language).
    //
    // This is a test-only patch of the response body; the DB is untouched.
    await ctx.route('**/api/session/me', async (route) => {
      const response = await route.fetch()
      const body = await response.json().catch(() => null)
      if (body?.user && typeof body.user === 'object') {
        body.user.language = 'en'
      }
      await route.fulfill({ response, json: body })
    })

    await use(ctx)
    await ctx.close()
  },
  page: async ({ context }, use) => {
    const page = await context.newPage()
    await use(page)
    await page.close()
  },
  // WEBPET-1021: Playwright's built-in `request` fixture is NOT seeded with the
  // captured cookies (only `context`/`page` are above), so specs that use
  // `{ request }` from this module hit /api/* unauthenticated → 401. Override it
  // to carry the admin storageState (Origin + X-CSRF-Token, so any mutating
  // call satisfies both the API's Origin check AND its RequireCSRF
  // double-submit check — Origin alone is not sufficient; without the token
  // header every PUT/POST/DELETE through this fixture silently 403s, which
  // was masking real conflicts in the 409-handling specs), matching this
  // fixture's documented contract that `./fixtures` `test` is authed across
  // the board.
  request: async ({ playwright, baseURL }, use) => {
    const csrfToken = csrfTokenFromStorageFile(ADMIN_STORAGE)
    const ctx = await playwright.request.newContext({
      // API_BASE_URL === the web origin on localhost (Vite proxy, byte-identical
      // to the source repo); on dev staging it is the separate API host — the
      // SPA host serves index.html for every /api/* path. Origin stays the web
      // origin either way (the API's Origin check requires it).
      baseURL: API_BASE_URL,
      storageState: ADMIN_STORAGE,
      extraHTTPHeaders: {
        ...(baseURL ? { Origin: baseURL } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
    })
    await use(ctx)
    await ctx.dispose()
  },
})

/**
 * PET-441: parallel fixture for the restricted (UserCrew-scoped) user.
 *
 * The restricted storage state is provisioned by `global-setup.ts`. If
 * provisioning failed for any reason (no crews seeded, API rejected the
 * create, etc.), `storage-restricted.json` won't exist and any spec using
 * this fixture should skip — read `restrictedAuthAvailable` and call
 * `test.skip(!restrictedAuthAvailable, '...')` in the test body.
 *
 * Locale-pin + session/me language-rewrite mirror the admin fixture above
 * so language-stable assertions still hold.
 */
export const restrictedAuthAvailable = existsSync(RESTRICTED_STORAGE)

export const testAsRestricted = base.extend<{ _webpetGate: void }>({
  _webpetGate: [
    async ({}, use, testInfo) => {
      applyWebpetGate(testInfo)
      await use()
    },
    { auto: true },
  ],
  context: async ({ browser }, use) => {
    if (!restrictedAuthAvailable) {
      throw new Error(
        `Restricted-user storage state is not provisioned. ` +
          `Use \`test.skip(!restrictedAuthAvailable, '...')\` to gate this spec, ` +
          `or run global-setup against a dev DB where POST /api/users + GET /api/crews work.`
      )
    }
    const ctx = await browser.newContext({ storageState: RESTRICTED_STORAGE })

    await ctx.addInitScript(() => {
      window.localStorage.setItem('pt.locale', 'en')
    })
    await ctx.route('**/api/session/me', async (route) => {
      const response = await route.fetch()
      const body = await response.json().catch(() => null)
      if (body?.user && typeof body.user === 'object') {
        body.user.language = 'en'
      }
      await route.fulfill({ response, json: body })
    })

    await use(ctx)
    await ctx.close()
  },
  page: async ({ context }, use) => {
    const page = await context.newPage()
    await use(page)
    await page.close()
  },
  // WEBPET-1021: authed `request` override seeded with the restricted user's
  // storageState (mirrors the admin override on `test`, including the
  // X-CSRF-Token fix — see that fixture's comment for why Origin alone
  // isn't enough).
  request: async ({ playwright, baseURL }, use) => {
    const csrfToken = csrfTokenFromStorageFile(RESTRICTED_STORAGE)
    const ctx = await playwright.request.newContext({
      // See the admin `request` override above for why API_BASE_URL.
      baseURL: API_BASE_URL,
      storageState: RESTRICTED_STORAGE,
      extraHTTPHeaders: {
        ...(baseURL ? { Origin: baseURL } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
    })
    await use(ctx)
    await ctx.dispose()
  },
})
