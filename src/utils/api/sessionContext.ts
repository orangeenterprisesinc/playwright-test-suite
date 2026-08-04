/**
 * @fileoverview An API request context authenticated as the session `auth-setup`
 * already persisted to `.auth/user.json`.
 *
 * The Go API needs three things on a mutating call: the session cookie, an
 * `Origin` matching the web app, and the `pt_csrf` cookie echoed back as
 * `X-CSRF-Token` (its double-submit check). Origin alone still returns 403.
 * `extraHTTPHeaders` is fixed when the context is created and Playwright has no
 * per-call override, so the token has to be read out of the storage-state file up
 * front rather than attached later.
 *
 * On dev staging the API is a separate host from the app, so the session cookie
 * belongs to `api.ptdev.xyz` while `Origin` stays the app's own URL.
 */
import { existsSync, readFileSync } from 'node:fs';
import { request as defaultRequest, type APIRequestContext } from '@playwright/test';
import { ConfigProperties, getConfigValue } from '../../config/configProperties';
import { Logger } from '../logger';

const logger = new Logger('SessionContext');

/** Where `auth-setup` persists the session — mirrors playwright.config.ts's `storageState`. */
export const SESSION_STORAGE_STATE = '.auth/user.json';

/** `__Host-` prefixed under HTTPS, bare over HTTP. Mirrors `webpet.fixture.ts`. */
const CSRF_COOKIE_NAMES = ['__Host-pt_csrf', 'pt_csrf'];

/**
 * Anything exposing Playwright's `request.newContext` — a fixture's
 * `playwright.request` inside a worker, or the module export in global teardown.
 */
export type RequestFactory = Pick<typeof defaultRequest, 'newContext'>;

/** Read the CSRF token out of a persisted storage-state file. */
export function csrfTokenFromStorageFile(path: string = SESSION_STORAGE_STATE): string | undefined {
    if (!existsSync(path)) return undefined;

    const state = JSON.parse(readFileSync(path, 'utf-8')) as {
        cookies?: Array<{ name: string; value: string }>;
    };
    for (const name of CSRF_COOKIE_NAMES) {
        const hit = (state.cookies ?? []).find((cookie) => cookie.name === name);
        if (hit) return decodeURIComponent(hit.value);
    }
    return undefined;
}

/**
 * Build an API context carrying the persisted session, or return `null` when
 * there is nothing to build it from.
 *
 * Null rather than throwing: the callers are cleanup paths, where a missing
 * session must produce a warning, not a failed test or a failed teardown.
 */
export async function createSessionRequestContext(
    factory: RequestFactory = defaultRequest,
): Promise<APIRequestContext | null> {
    if (!existsSync(SESSION_STORAGE_STATE)) {
        logger.warn(`No session at ${SESSION_STORAGE_STATE} — cannot make authenticated API calls`);
        return null;
    }

    const apiUrl = getConfigValue(ConfigProperties.API_URL);
    if (!apiUrl) {
        logger.warn('API_URL is not set — cannot make authenticated API calls');
        return null;
    }

    const origin = getConfigValue(ConfigProperties.APP_URL);
    const csrfToken = csrfTokenFromStorageFile();

    return factory.newContext({
        // Trailing slash so a relative path resolves under `/api` instead of replacing it.
        baseURL: apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`,
        storageState: SESSION_STORAGE_STATE,
        extraHTTPHeaders: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(origin ? { Origin: origin } : {}),
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
    });
}
