import { request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { WEBPET_ADMIN_STORAGE, WEBPET_AUTH_DIR } from '@config/webpetPaths';
import { ADMIN_PASSWORD, ADMIN_USER, API_BASE_URL, WEB_BASE_URL } from '@config/webpetEnv';

/**
 * Port of the source repo's e2e/global-setup.ts (apps/web/e2e), invoked by the
 * `webpet-setup` dependency project (tests/webpet/webpet.setup.ts) instead of
 * Playwright's globalSetup slot — this repo's slot is already taken by
 * src/fixtures/global-setup.ts, and running it as a dependency project means a
 * login failure fails only the webpet project.
 *
 * Logs in as the admin (su) user and persists the resulting pt_session +
 * pt_csrf cookies to tests/webpet/.auth/storage.json; the fixture in
 * src/fixtures/webpet.fixture.ts loads that storage state so every spec starts
 * authenticated — matching how the app bootstraps via /api/session/me.
 *
 * Differences from the source file (mechanical only):
 *   - request contexts are created against API_BASE_URL (identical to the web
 *     origin on the containerized stack; https://api.ptdev.xyz on dev — see
 *     ./webpet-env.ts) while the Origin header stays the web origin.
 *   - the auth dir is tests/webpet/.auth instead of <cwd>/e2e/.auth.
 *
 * PET-441: also provisions a second, restricted user (`RestrictedTest`) with
 * one `UserCrew` row, logs in as that user, and persists a parallel
 * `storage-restricted.json` plus a side-channel `restricted-meta.json` that
 * records the assigned crew id. Tests that need the restricted context load
 * `storage-restricted.json` via the `testAsRestricted` fixture export. The
 * whole restricted-user provisioning block is wrapped in try/catch — failures
 * log a warning and proceed, letting downstream specs skip cleanly.
 */
/**
 * Logs in as the admin (su) user and persists storage.json. Extracted out of
 * provisionWebpetAuth so it can also run mid-suite: dev's session store is
 * in-memory and can drop the admin session before a run finishes — the
 * webpet fixture's gate probe (src/fixtures/webpet.fixture.ts) calls this to
 * re-login without re-running the whole setup project.
 */
export async function healAdminSession(): Promise<void> {
    const adminCtx = await request.newContext({
        baseURL: API_BASE_URL,
        extraHTTPHeaders: { Origin: WEB_BASE_URL },
    });

    const adminLoginRes = await loginWithBackoff(adminCtx, ADMIN_USER, ADMIN_PASSWORD, 'admin');
    if (!adminLoginRes.ok()) {
        throw new Error(
            `webpet setup: admin login failed (HTTP ${adminLoginRes.status()}) against ${API_BASE_URL} ` +
                `as '${ADMIN_USER}'. Check E2E_ADMIN_USER / E2E_ADMIN_PASSWORD (falls back to ` +
                `USER_NAME / PASSWORD — see src/config/webpetEnv.ts), and make sure the stack is ` +
                `reachable and that WEBPET_API_ORIGIN points at the API host).`,
        );
    }

    mkdirSync(WEBPET_AUTH_DIR, { recursive: true });
    await adminCtx.storageState({ path: WEBPET_ADMIN_STORAGE });
    await adminCtx.dispose();
}

export async function provisionWebpetAuth(): Promise<void> {
    await healAdminSession();

    // Rehydrate from the storage state healAdminSession just wrote — same
    // cookies, no duplicate login — for the restricted-user half below.
    const adminCtx = await request.newContext({
        baseURL: API_BASE_URL,
        extraHTTPHeaders: { Origin: WEB_BASE_URL },
        storageState: WEBPET_ADMIN_STORAGE,
    });

    // PET-441: provision the restricted user. Failures here must not break the
    // admin path — the data-scoping spec skips cleanly when the restricted
    // fixture is unavailable.
    try {
        await provisionRestrictedUser(adminCtx, WEBPET_AUTH_DIR);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
            `[webpet-setup] Restricted-user fixture skipped: ${msg}. ` +
                `Data-scoping leakage spec will skip until this provisions successfully.`,
        );
    }

    await adminCtx.dispose();
}

interface RestrictedMeta {
    userId: number;
    username: string;
    crewId: number;
}

interface CrewListItem {
    crewCounter: number;
}

interface UserListItem {
    usersCounter: number;
    name: string;
    userInitials?: string;
    /** Present on GET /api/users; a soft-deleted or deactivated row cannot log in. */
    active?: boolean;
}

/**
 * Picks a 2-letter uppercase initials not already used by any seeded user.
 * UserInitials is unique-constrained on POST /api/users, and the dev seeds
 * (PetData / DelLlano) differ, so deriving a free value beats hardcoding one
 * that collides (e.g. seeded user "Real" already owns "RT").
 */
function freeUserInitials(users: UserListItem[]): string {
    const used = new Set(users.map((u) => (u.userInitials ?? '').toUpperCase()));
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const a of A) {
        for (const b of A) {
            const candidate = `${a}${b}`;
            if (!used.has(candidate)) return candidate;
        }
    }
    throw new Error('No free 2-letter user initials available — seed DB is unexpectedly full');
}

const RESTRICTED_USERNAME = 'RestrictedTest';
const RESTRICTED_PASSWORD = 'Restricted123!';

// Cookie names the Go API uses for the CSRF token, gated on PT_COOKIE_SECURE:
// "__Host-pt_csrf" under HTTPS, unprefixed "pt_csrf" in dev/HTTP. Mirrors the
// browser's readCsrfToken() (apps/web/src/shared/lib/csrf.ts).
const CSRF_COOKIE_NAMES = ['__Host-pt_csrf', 'pt_csrf'] as const;

/**
 * Reads the CSRF token from a logged-in request context's cookies so it can be
 * echoed in the X-CSRF-Token header on mutating requests (the API's RequireCSRF
 * double-submit check). Throws if no CSRF cookie is present (e.g. login didn't
 * set it), so the caller's catch reports a precise reason rather than a bare 403.
 */
async function csrfTokenFromContext(ctx: APIRequestContext): Promise<string> {
    const { cookies } = await ctx.storageState();
    for (const name of CSRF_COOKIE_NAMES) {
        const hit = cookies.find((c) => c.name === name);
        if (hit) return decodeURIComponent(hit.value);
    }
    throw new Error(
        `No CSRF cookie (${CSRF_COOKIE_NAMES.join(' / ')}) found on the logged-in context — cannot send X-CSRF-Token`,
    );
}

/**
 * POST /api/auth/login, retrying only the statuses worth retrying.
 *
 * Dev rate-limits its login path in memory, so a burst of runs answers 429 for a
 * while. A single-shot login reports that as "credentials may have drifted", which is
 * a misleading diagnosis and, on the admin path, takes the whole webpet project down.
 * Any other 4xx is a real answer and returns immediately, so a genuinely wrong
 * password still fails fast.
 */
async function loginWithBackoff(
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
        if (res.ok()) return res;
        if (res.status() !== 429 && res.status() < 500) return res;
        console.warn(
            `[webpet-setup] ${label} login got HTTP ${String(res.status())}; ` +
                `retrying in ${String(delay / 1000)}s`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        res = await send();
    }
    return res;
}

/**
 * Soft-delete a user through the admin context, rowversion-guarded.
 *
 * Not `usersApi.deleteUserById`: that helper issues *relative* requests and so needs a
 * baseURL ending in `/api`, while every context in this file is built on
 * `API_BASE_URL`. Same contract otherwise - quiet on 404, loud on anything else.
 */
async function deleteUserViaAdmin(adminCtx: APIRequestContext, id: number): Promise<void> {
    const detailRes = await adminCtx.get(`/api/users/${String(id)}`);
    if (detailRes.status() === 404) return;
    if (!detailRes.ok()) {
        throw new Error(`GET /api/users/${String(id)} returned ${String(detailRes.status())}`);
    }
    const { version } = (await detailRes.json()) as { version?: string };
    if (!version) {
        throw new Error(
            `GET /api/users/${String(id)} returned no 'version' - the delete is rowversion-guarded`,
        );
    }
    const csrf = await csrfTokenFromContext(adminCtx);
    const res = await adminCtx.delete(`/api/users/${String(id)}`, {
        data: { rowversion: version },
        headers: { 'X-CSRF-Token': csrf },
    });
    if (res.status() !== 204 && res.status() !== 404) {
        throw new Error(`DELETE /api/users/${String(id)} returned ${String(res.status())}`);
    }
}

/**
 * Idempotently provisions the RestrictedTest user with one UserCrew row,
 * then logs in as that user and persists storage-restricted.json plus
 * restricted-meta.json (carrying the assigned crew id for the spec to read).
 *
 * Throws on any unrecoverable error so the caller can warn + skip cleanly.
 */
async function provisionRestrictedUser(
    adminCtx: APIRequestContext,
    authDir: string,
    forceCreate = false,
): Promise<void> {
    // 1. Find or create the user.
    const userListRes = await adminCtx.get('/api/users');
    if (!userListRes.ok()) {
        throw new Error(`GET /api/users returned ${userListRes.status()}`);
    }
    const users = (await userListRes.json()) as UserListItem[];
    // Reuse ANY active RestrictedTest* user (prefix match) — prior runs may have
    // created a unique-suffixed one (see the create branch below). Prefix reuse
    // stops a new user being minted every run.
    //
    // `active !== false` is load-bearing: matching on the name alone meant a single
    // deactivated row made the create branch — the only branch that mints a user whose
    // password this file knows — unreachable forever, so every later run failed login
    // with 401. That is what silently skipped WP-0133 from 2026-08-27 onward.
    const reusable = (u: UserListItem) =>
        (u.name ?? '').startsWith(RESTRICTED_USERNAME) && u.active !== false;
    const existing = forceCreate ? undefined : users.find(reusable);

    let userId: number;
    let crewId: number;
    // The actual username to log in with — the reused user's name, or the
    // unique-per-run name assigned in the create branch.
    let restrictedName = RESTRICTED_USERNAME;

    const existingWasReused = existing !== undefined;
    if (existing) {
        userId = existing.usersCounter;
        restrictedName = existing.name;
        // Reuse existing user; read its detail to recover the assigned crew id.
        const detailRes = await adminCtx.get(`/api/users/${String(userId)}`);
        if (!detailRes.ok()) {
            throw new Error(`GET /api/users/${String(userId)} returned ${detailRes.status()}`);
        }
        const detail = (await detailRes.json()) as { crewIds?: number[] };
        const ids = detail.crewIds ?? [];
        if (ids.length === 0) {
            throw new Error(
                `Existing RestrictedTest user (id ${String(userId)}) has zero UserCrew rows — ` +
                    `cannot test scoping. Manually assign a crew or delete the user.`,
            );
        }
        crewId = ids[0] as number;
    } else {
        // Pick the lowest non-deleted crew id from the seed data.
        const crewListRes = await adminCtx.get('/api/crews');
        if (!crewListRes.ok()) {
            throw new Error(`GET /api/crews returned ${crewListRes.status()}`);
        }
        const crews = (await crewListRes.json()) as CrewListItem[];
        if (crews.length === 0) {
            throw new Error('No crews in seed data — cannot provision RestrictedTest user');
        }
        crewId = crews.map((c) => c.crewCounter).sort((a, b) => a - b)[0] as number;

        // Unique per-run identity so a *soft-deleted* RestrictedTest ghost can't
        // block the create: Users_Name_Unique and the EmailAddress unique constraint
        // are BOTH unfiltered, so a fixed name/email 409s once a prior RestrictedTest
        // has been soft-deleted (it's absent from GET /api/users but still owns the
        // name+email). The prefix-reuse above keeps an active one from prior runs, so
        // this create only fires when none is active — mint a fresh unique one.
        const token = Date.now().toString(36).slice(-5).toUpperCase();
        restrictedName = `${RESTRICTED_USERNAME}_${token}`;
        const restrictedEmail = `restrictedtest_${token.toLowerCase()}@example.com`;

        // POST /api/users is a mutating request — RequireCSRF rejects it (403)
        // unless we echo the session's CSRF token in the X-CSRF-Token header.
        const csrf = await csrfTokenFromContext(adminCtx);
        const createRes = await adminCtx.post('/api/users', {
            data: {
                name: restrictedName,
                password: RESTRICTED_PASSWORD,
                // EmailAddress became required + unique on POST /api/users (WEBPET-776).
                emailAddress: restrictedEmail,
                userRole: 1,
                // UserInitials is unique-constrained; derive a free value rather than
                // hardcode (the seed user "Real" already owns "RT").
                userInitials: freeUserInitials(users),
                active: true,
                viewRates: false,
                viewReports: false,
                editRecords: false,
                addRecords: false,
                deleteRecords: false,
                filterRecords: true,
                exportRecords: false,
                importRecords: false,
                multiEditRecords: false,
                viewAuditRecords: false,
                multiDeleteInput: false,
                multiDeleteSetup: false,
                // employeeAccess=1 is the legacy "read-only employee access" code.
                employeeAccess: 1,
                allowJobCardRateOverwrite: false,
                allowEmployeeI9InformationAccess: false,
                viewConfidentialData: false,
                canModifyLockedJobCards: false,
                viewSSN: false,
                accesstoReverse: 0,
                crewIds: [crewId],
            },
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        });
        if (!createRes.ok()) {
            const body = await createRes.text().catch(() => '<unreadable body>');
            throw new Error(
                `POST /api/users returned ${createRes.status()}: ${body.slice(0, 200)}`,
            );
        }
        const created = (await createRes.json()) as { usersCounter?: number };
        if (!created.usersCounter) {
            throw new Error(`POST /api/users response missing usersCounter`);
        }
        userId = created.usersCounter;
    }

    // 2. Log in as the restricted user in a fresh context (no admin cookies).
    // Mirror adminCtx's Origin header — the login endpoint enforces a valid
    // Origin and returns 403 without it.
    const restrictedCtx = await request.newContext({
        baseURL: API_BASE_URL,
        extraHTTPHeaders: { Origin: WEB_BASE_URL },
    });
    const loginRes = await loginWithBackoff(
        restrictedCtx,
        restrictedName,
        RESTRICTED_PASSWORD,
        'RestrictedTest',
    );
    if (!loginRes.ok()) {
        await restrictedCtx.dispose();
        // A reused row whose password drifted cannot be repaired in place — the API
        // exposes no admin-side password write. Delete it and mint a fresh one; the
        // create branch owns the password, so the retry is authoritative. `forceCreate`
        // makes this recurse exactly once.
        if (!forceCreate && existingWasReused) {
            console.warn(
                `[webpet-setup] RestrictedTest login failed (HTTP ${String(loginRes.status())}) for ` +
                    `reused user '${restrictedName}' (id ${String(userId)}); ` +
                    `deleting it and creating a fresh one.`,
            );
            await deleteUserViaAdmin(adminCtx, userId);
            await provisionRestrictedUser(adminCtx, authDir, true);
            return;
        }
        throw new Error(
            `RestrictedTest login failed (HTTP ${loginRes.status()}) — ` +
                `user exists but credentials may have drifted, or the user is inactive.`,
        );
    }
    await restrictedCtx.storageState({ path: join(authDir, 'storage-restricted.json') });
    await restrictedCtx.dispose();

    // 3. Side-channel meta for the spec to read.
    const meta: RestrictedMeta = { userId, username: restrictedName, crewId };
    writeFileSync(join(authDir, 'restricted-meta.json'), JSON.stringify(meta, null, 2));
}
