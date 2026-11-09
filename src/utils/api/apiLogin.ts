/**
 * An API context authenticated by logging in, not by reading a storage-state file.
 *
 * Global setup runs before any Playwright project, so at that point CI has no
 * session on disk — `global-setup.ts` writes an empty `.auth/user.json` placeholder
 * and `tests/webpet/.auth/storage.json` is written later by the `webpet-setup`
 * project. Credentials, however, are already in the environment, and the Go API's
 * `POST /api/auth/login` sets the session and CSRF cookies on the calling context.
 *
 * The returned context has the same shape as `createSessionRequestContext()`:
 * baseURL ending in `/api/` (relative paths), `Origin`, and the CSRF cookie echoed as
 * `X-CSRF-Token` for the API's double-submit check.
 */
import { request as defaultRequest, type APIRequestContext, type APIResponse } from '@playwright/test';
import { Logger } from '../logger';
import { guardApiContext, type WriteAllowance } from './writeGuard';
import type { RequestFactory } from './sessionContext';

const logger = new Logger('ApiLogin');

// `__Host-` prefixed under HTTPS, bare over HTTP — mirrors the browser's readCsrfToken().
const CSRF_COOKIE_NAMES = ['__Host-pt_csrf', 'pt_csrf'] as const;

/**
 * POST /api/auth/login, retrying only the statuses worth retrying.
 *
 * Dev rate-limits its login path in memory, so a burst of runs answers 429 for a
 * while; a single-shot login reports that as "credentials may have drifted". Any other
 * 4xx is a real answer and returns immediately, so a wrong password still fails fast.
 */
export async function loginWithBackoff(
    ctx: APIRequestContext,
    username: string,
    password: string,
    label: string,
): Promise<APIResponse> {
    const send = () =>
        ctx.post('/api/auth/login', {
            data: { username, password },
            headers: { 'Content-Type': 'application/json' },
        });

    let res = await send();
    for (const delay of [2_000, 5_000, 10_000]) {
        if (res.ok()) return completeClientChoice(ctx, res, { label });
        if (res.status() !== 429 && res.status() < 500) return res;
        logger.warn(`${label} login got HTTP ${String(res.status())}; retrying in ${String(delay / 1000)}s`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        res = await send();
    }
    return completeClientChoice(ctx, res, { label });
}

/** The tenant the suite must run on: E2E_CLIENT_ID, else client 1. */
export function expectedClientId(): number {
    return Number(process.env.E2E_CLIENT_ID || 1);
}

interface ClientChoiceBody {
    clientChoice?: { token: string; choices?: { clientId: number; expired?: boolean }[] };
}

/**
 * A multi-client user's login answers 202 with a single-use choice token instead of a session.
 * Pick E2E_CLIENT_ID and post it once (never retried: the token is spent) — the answer is the
 * normal login response and sets the session + CSRF cookies. Any other status passes through untouched.
 */
export async function completeClientChoice(
    ctx: APIRequestContext,
    loginRes: APIResponse,
    opts: { label: string; url?: string; headers?: Record<string, string> },
): Promise<APIResponse> {
    if (loginRes.status() !== 202) return loginRes;

    const expected = expectedClientId();
    const { clientChoice } = (await loginRes.json()) as ClientChoiceBody;
    const choices = clientChoice?.choices ?? [];
    const offered = choices.map((c) => c.clientId).join(', ') || 'none';
    const pick = choices.find((c) => Number(c.clientId) === expected);
    if (!clientChoice?.token || !pick || pick.expired) {
        throw new Error(
            `environment-gate: ${opts.label} login asked for a client choice but client ${String(expected)} ` +
                `(E2E_CLIENT_ID) is ${pick?.expired ? 'expired' : 'not offered'}; offered client ids: ${offered}.`,
        );
    }

    const res = await ctx.post(opts.url ?? '/api/auth/login/choose-client', {
        data: { token: clientChoice.token, clientId: expected },
        headers: { 'Content-Type': 'application/json', ...opts.headers },
    });
    if (!res.ok()) {
        const body = (await res.text().catch(() => '')).trim().slice(0, 300);
        throw new Error(`${opts.label} choose-client returned HTTP ${String(res.status())}: ${body}`);
    }
    return res;
}

/** The CSRF token from a logged-in context's cookies; throws when login set none. */
export async function csrfTokenFromContext(ctx: APIRequestContext): Promise<string> {
    const { cookies } = await ctx.storageState();
    for (const name of CSRF_COOKIE_NAMES) {
        const hit = cookies.find((c) => c.name === name);
        if (hit) return decodeURIComponent(hit.value);
    }
    throw new Error(
        `No CSRF cookie (${CSRF_COOKIE_NAMES.join(' / ')}) found on the logged-in context — cannot send X-CSRF-Token`,
    );
}

export interface LoginContextOptions {
    /** Defaults to API_URL, else `${WEBPET_API_ORIGIN}/api`, else `${BASE_URL}/api`. */
    apiUrl?: string;
    /** Defaults to BASE_URL. */
    webOrigin?: string;
    /** Defaults to E2E_ADMIN_USER, else USER_NAME. */
    username?: string;
    /** Defaults to E2E_ADMIN_PASSWORD, else PASSWORD. */
    password?: string;
    label?: string;
    /** A standing UI-first allowance for everything this context does (see writeGuard). */
    allowance?: WriteAllowance;
}

/** Strip a trailing `/api` or `/api/` so the two URL styles in .env resolve alike. */
export function apiRootFrom(env: NodeJS.ProcessEnv): string | undefined {
    if (env.API_URL) return env.API_URL;
    const origin = env.WEBPET_API_ORIGIN ?? env.BASE_URL ?? env.APP_URL;
    return origin ? `${origin.replace(/\/+$/, '')}/api` : undefined;
}

/**
 * Fail fast when the login landed on a different tenant than E2E_CLIENT_ID.
 * No-op when the variable is unset. `meUrl` must be absolute, or relative to the
 * context's baseURL, and must hit the API (a relative /api path from a page hits the SPA).
 */
export async function assertExpectedClient(
    ctx: APIRequestContext,
    meUrl: string,
    user: string,
    origin?: string,
): Promise<void> {
    const expected = process.env.E2E_CLIENT_ID;
    if (!expected) return;

    const res = await ctx.get(meUrl, origin ? { headers: { Origin: origin } } : undefined);
    if (!res.ok()) {
        throw new Error(
            `environment-gate: GET session/me returned HTTP ${String(res.status())} for "${user}"; ` +
                `cannot confirm the tenant (E2E_CLIENT_ID=${expected}).`,
        );
    }
    const { clientId } = (await res.json()) as { clientId?: number | string };
    if (Number(clientId) !== Number(expected)) {
        throw new Error(
            `environment-gate: "${user}" logged in to client ${String(clientId)}, expected client ${expected} ` +
                `(E2E_CLIENT_ID). Automation runs on client ${expected} only; fix the login user, never the gate.`,
        );
    }
}

/**
 * Log in with the environment's credentials and return an authenticated API
 * context, or `null` (with a warning) when the environment cannot support one.
 * Never throws: every caller is a setup/cleanup path where a missing login must
 * degrade to "skipped", not fail the run.
 */
export async function createLoginRequestContext(
    opts: LoginContextOptions = {},
    factory: RequestFactory = defaultRequest,
): Promise<APIRequestContext | null> {
    const env = process.env;
    const apiRoot = opts.apiUrl ?? apiRootFrom(env);
    const webOrigin = opts.webOrigin ?? env.BASE_URL ?? env.APP_URL;
    const username = opts.username ?? env.E2E_ADMIN_USER ?? env.USER_NAME;
    const password = opts.password ?? env.E2E_ADMIN_PASSWORD ?? env.PASSWORD;
    const label = opts.label ?? 'api';

    if (!apiRoot || !username || !password) {
        logger.warn(
            `Cannot log in for ${label}: missing ${[
                !apiRoot && 'API_URL/BASE_URL',
                !username && 'USER_NAME',
                !password && 'PASSWORD',
            ]
                .filter(Boolean)
                .join(', ')}`,
        );
        return null;
    }

    // `/api/auth/login` is absolute on the origin, so log in against the origin and
    // only then build the `/api/`-rooted context the callers expect.
    const origin = apiRoot.replace(/\/api\/?$/, '');
    const loginCtx = await factory.newContext({
        baseURL: origin,
        extraHTTPHeaders: webOrigin ? { Origin: webOrigin } : {},
    });
    try {
        const res = await loginWithBackoff(loginCtx, username, password, label);
        if (!res.ok()) {
            logger.warn(`${label} login failed with HTTP ${String(res.status())} against ${origin} as '${username}'`);
            return null;
        }
        const state = await loginCtx.storageState();
        const csrf = await csrfTokenFromContext(loginCtx);
        const baseURL = apiRoot.endsWith('/') ? apiRoot : `${apiRoot}/`;
        const context = await factory.newContext({
            baseURL,
            storageState: state,
            extraHTTPHeaders: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...(webOrigin ? { Origin: webOrigin } : {}),
                'X-CSRF-Token': csrf,
            },
        });
        // The login POST above is not guarded — it is the act of authenticating, not a
        // workflow step. What callers do with the context afterwards is.
        return guardApiContext(context, { label, baseURL, defaultAllowance: opts.allowance });
    } catch (error) {
        logger.warn(`${label} login threw: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    } finally {
        await loginCtx.dispose().catch(() => undefined);
    }
}
