/**
 * @fileoverview Environment resolution for the migrated web-pet suite.
 *
 * Moved verbatim from `tests/webpet/support/webpet-env.ts` (which now re-exports
 * this module) as part of the framework alignment. The resolution chains and
 * their module-load evaluation timing are unchanged — both are behavioural, and
 * this suite's baseline is only meaningful if they stay identical.
 *
 * Deliberately does NOT call `loadEnvFiles()`. `playwright.config.ts` loads the
 * env files before the config object is built, and worker processes re-evaluate
 * that config, so `process.env` is already populated by the time any of these
 * constants are read. Adding a second load here would change the precedence
 * order for a suite whose whole acceptance criterion is "nothing changed".
 */
import { decryptIfNeeded } from './secrets';

/**
 * Web (SPA) origin — what the browser navigates to and what the `Origin` header
 * carries on direct API calls. `PLAYWRIGHT_BASE_URL` is honoured first for parity
 * with the source repo's config; `BASE_URL`/`APP_URL` are this repo's canonical
 * vars (.env.dev / CI). There is no default host — dev staging always supplies
 * BASE_URL, and a missing one should fail loudly rather than aim somewhere.
 */
export const WEB_BASE_URL: string = (() => {
    const url = process.env.PLAYWRIGHT_BASE_URL ?? process.env.BASE_URL ?? process.env.APP_URL;
    if (!url) {
        throw new Error(
            'webpet: no BASE_URL. .env.dev supplies it — check TEST_ENV (defaults to dev) ' +
                'and that the env files loaded. There is no fallback host on purpose: a ' +
                'default would silently point the suite somewhere nobody asked for.',
        );
    }
    return url;
})();

/**
 * Base URL for DIRECT API request contexts (the authed `request` fixture, the
 * admin/restricted login in `provision.ts`, and the side request contexts in
 * `data-scoping` / `equiv` specs).
 *
 * - **containerized stack**: `WEBPET_API_ORIGIN` is unset → falls back to
 *   `WEB_BASE_URL` so calls go same-origin through Caddy's `/api` proxy, exactly
 *   as they went through Vite's in the source repo (parity is load-bearing —
 *   same-origin cookies + Origin checks).
 * - **dev staging**: `.env.dev` sets `WEBPET_API_ORIGIN=https://api.ptdev.xyz`.
 *   Logging in against the API host means its host-only (`__Host-` prefixed)
 *   session + CSRF cookies are captured for `api.ptdev.xyz` — the host the
 *   deployed SPA fetches cross-origin with credentials, so browser contexts
 *   seeded with the captured storage state authenticate too.
 */
export const API_BASE_URL: string = (process.env.WEBPET_API_ORIGIN ?? WEB_BASE_URL).replace(
    /\/+$/,
    '',
);

/**
 * Absolute URL for an API path, for `page.request.*` and in-page `fetch` calls.
 *
 * A relative `/api/…` resolves against the **web** origin. On dev that host is an
 * SPA fallback which answers every path — `/api/*` included — with `index.html`,
 * so the call returns HTML and the first `.json()` throws
 * `Unexpected token '<', "<!doctype "…`. On the containerized stack `API_BASE_URL`
 * is the web origin, so this is a no-op there and same-origin parity is preserved.
 */
export const apiUrl = (path: string): string =>
    `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

/**
 * Admin login used by `provision.ts` and `notifications.spec.ts`.
 *
 * `E2E_ADMIN_*` are the source repo's variables and always win (.env.dev and
 * both web-pet CI workflows set them explicitly). When absent — e.g. a local
 * `npm run test:webpet:dev`, where .env.dev deliberately carries no password —
 * fall back to the framework's own `USER_NAME`/`PASSWORD` (.env.dev supplies
 * `USER_NAME=su`, the gitignored `.env` supplies the real dev `PASSWORD`), so a
 * dev run needs no secret duplication. The final `'Admin'` default matches the
 * source repo and is dead in every real environment (login goes through
 * TigerMaster) — it only produces a clear 401 instead of an undefined crash.
 */
// decryptIfNeeded, not getConfigValue: this module deliberately keeps the source
// repo's own resolution chain (see the file header) rather than routing through
// the framework's config layer. Wrapping preserves that chain exactly while still
// decrypting an `ENC(...)` credential — without it, an encrypted PASSWORD would
// reach the admin API login as ciphertext and surface as an opaque 401.
export const ADMIN_USER: string = decryptIfNeeded(
    process.env.E2E_ADMIN_USER ?? process.env.USER_NAME ?? 'Admin',
);
export const ADMIN_PASSWORD: string = decryptIfNeeded(
    process.env.E2E_ADMIN_PASSWORD ?? process.env.PASSWORD ?? 'Admin',
);

/**
 * Non-empty ⇒ `employee-documents.spec.ts` runs (it needs MinIO). Read at module
 * load, matching how that spec evaluates its own gate, so the skip count cannot
 * drift between the two.
 */
export const S3_ENDPOINT: string = process.env.S3_ENDPOINT ?? '';

/**
 * Non-SU credentials for the WEBPET-2006 third-gate-term test
 * (employee.spec.ts). Empty by default; that test self-skips when either is
 * unset — see the skip-allowlist entry for "WEBPET_NONSU_USER / ...".
 */
export const WEBPET_NONSU_USER: string = process.env.WEBPET_NONSU_USER ?? '';
export const WEBPET_NONSU_PASSWORD: string = process.env.WEBPET_NONSU_PASSWORD ?? '';
