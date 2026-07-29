/**
 * Environment resolution for the migrated web-pet suite (tests/webpet).
 *
 * The source repo (apps/web/e2e) always talked to the API via baseURL-relative
 * `/api/...` paths through the Vite dev proxy. That works on localhost but not
 * on dev staging, where the SPA host (app.ptdev.xyz) returns index.html for
 * every path and the API lives on a separate host (api.ptdev.xyz). These two
 * constants keep localhost behavior byte-identical while letting env.dev
 * reroute direct API calls.
 */

/**
 * Web (SPA) origin — what the browser navigates to and what the Origin header
 * carries on direct API calls. PLAYWRIGHT_BASE_URL is honored first for parity
 * with the source repo's config; BASE_URL/APP_URL are this repo's canonical
 * vars (env.local / env.dev / CI).
 */
export const WEB_BASE_URL: string =
    process.env.PLAYWRIGHT_BASE_URL ??
    process.env.BASE_URL ??
    process.env.APP_URL ??
    'http://localhost:3000';

/**
 * Base URL for DIRECT API request contexts (the authed `request` fixture in
 * tests/webpet/fixtures.ts, the admin/restricted login in support/provision.ts,
 * and the side request contexts in data-scoping / equiv specs).
 *
 * - localhost: WEBPET_API_ORIGIN is unset → falls back to WEB_BASE_URL so calls
 *   go through the Vite proxy exactly as in the source repo (parity is
 *   load-bearing — same-origin cookies + Origin checks).
 * - dev staging: env.dev sets WEBPET_API_ORIGIN=https://api.ptdev.xyz. Logging
 *   in against the API host means its host-only (`__Host-` prefixed) session +
 *   CSRF cookies are captured for api.ptdev.xyz — the host the deployed SPA
 *   fetches cross-origin with credentials, so browser contexts seeded with the
 *   captured storage state authenticate too.
 */
export const API_BASE_URL: string = (process.env.WEBPET_API_ORIGIN ?? WEB_BASE_URL).replace(
    /\/+$/,
    '',
);

/**
 * Admin login used by support/provision.ts and notifications.spec.ts.
 *
 * E2E_ADMIN_* are the source repo's variables and always win (env.local and
 * both webpet CI workflows set them explicitly). When absent — e.g. a local
 * `npm run test:webpet:dev`, where env.dev deliberately carries no password —
 * fall back to the framework's own USER_NAME/PASSWORD (env.dev supplies
 * USER_NAME=su, the gitignored .env supplies the real dev PASSWORD), so a dev
 * run needs no secret duplication. The final 'Admin' default matches the
 * source repo and is dead in every real environment (login goes through
 * TigerMaster) — it only produces a clear 401 instead of an undefined crash.
 */
export const ADMIN_USER: string =
    process.env.E2E_ADMIN_USER ?? process.env.USER_NAME ?? 'Admin';
export const ADMIN_PASSWORD: string =
    process.env.E2E_ADMIN_PASSWORD ?? process.env.PASSWORD ?? 'Admin';
