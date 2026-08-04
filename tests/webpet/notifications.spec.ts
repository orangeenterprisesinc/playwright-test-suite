/**
 * Exercises the global notification system (sonner toasts driven by the
 * TanStack Query MutationCache). Runs against a live API + dev server.
 *
 * Prereqs — same as every other spec:
 *   cd apps/api && go run .
 *   cd apps/web && pnpm dev
 *
 * Key facts used by the tests below:
 * - FormFooter disables Save whenever the form is clean (!isDirty) or invalid.
 * - Every record a test creates/mutates is made fresh via data-factory.ts, so
 *   the file is safe to run in parallel and no longer depends on seeded rows.
 *
 * ## Two test objects in one file
 *
 * The auth-event tests must start **unauthenticated** — they drive sign-out and
 * sign-in — so they use `cleanTest` from the anonymous fixture. Everything else
 * uses the admin fixture. Both carry the runner gate and the lifecycle
 * listeners; the only difference is whether the browser context is seeded with
 * the admin storage state.
 *
 * Framework-aligned (Batch 08): toasts live on ToastComponent, the concurrency
 * banner on WebpetFormPage, and the sign-in/sign-out surfaces on LoginPage and
 * AppShellPage. `page.route(...)`, `context.setOffline(...)` and the direct
 * login POST stay in the spec — they are scenario, not page structure.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import { test as cleanTest, expect as cleanExpect } from '@fixtures/webpetAnonymous.fixture';
import { ADMIN_PASSWORD, ADMIN_USER, apiUrl } from '@config/webpetEnv';
import type { Page } from '@playwright/test';
import {
    ensureCrew,
    deleteCrew,
    ensureDepartment,
    deleteDepartment,
    ensureCustomer,
    deleteCustomer,
} from './data-factory';

// ── Save / create success toasts ────────────────────────────────────────────

test.describe('Create & save success toasts', { tag: ['@WebPet', '@wp-notifications', '@WPBatch08'] }, () => {

    test('[Notifications] Verify that creating a department emits a created toast.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0243' },
    }, async ({ pages, request }) => {
        const form = pages.departmentForm;
        const uniq = `NotifTest ${Date.now() % 1000000}`;

        await form.gotoNew();
        // fillName blurs, which is what triggers onBlur validation — FormFooter
        // gates Save on isValid.
        await form.fillName(uniq);
        await form.footer.saveButtonExact.click();

        await expect(pages.toasts.message('Department created')).toBeVisible({ timeout: 8000 });

        // Cleanup: soft-delete the record we just created.
        const list = await request.get('/api/departments');
        const all = (await list.json()) as Array<{
            departmentCounter: number;
            name: string;
            firstDayofWeek: number;
            crewRequired: boolean;
            version: string;
        }>;
        const created = all.find((d) => d.name === uniq);
        if (created) {
            await request.put(`/api/departments/${String(created.departmentCounter)}`, {
                data: {
                    active: false,
                    firstDayofWeek: created.firstDayofWeek,
                    crewRequired: created.crewRequired,
                    version: created.version,
                },
            });
        }
    });

    test('[Notifications] Verify that editing a department emits a saved toast.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0244' },
    }, async ({ pages, request }) => {
        const form = pages.departmentForm;
        // Edit this test's OWN department rather than a shared row — this test saves
        // a change, and a shared-row mutation makes parallel runs flaky.
        const dept = await ensureDepartment(request);
        try {
            await form.gotoEdit(dept.id);
            await form.waitForForm();
            // Toggle the crewRequired switch via its label to mark the form dirty —
            // the switch's id lives on a hidden native input.
            await form.crewRequiredLabel.click();
            await form.footer.saveButtonExact.click();

            await expect(pages.toasts.message('Department saved')).toBeVisible({ timeout: 8000 });
        } finally {
            await deleteDepartment(request, dept.id);
        }
    });

});

// ── Error toast replaces the old alert() on BoardFormPage ───────────────────

test.describe('Error toasts', { tag: ['@WebPet', '@wp-notifications', '@WPBatch08'] }, () => {

    test('[Notifications] Verify that a board server error emits a toast rather than a native alert.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0245' },
    }, async ({ page, pages, request }) => {
        const form = pages.boardForm;
        const list = await request.get('/api/boards');
        if (!list.ok()) test.skip(true, 'API /boards not available');
        const boards = (await list.json()) as Array<{ name: string }>;
        if (boards.length === 0) test.skip(true, 'no boards seeded');
        const existingName = boards[0].name;

        let dialogFired = false;
        page.on('dialog', (d) => {
            dialogFired = true;
            void d.dismiss();
        });

        await form.gotoNew();
        await form.waitForForm();
        await form.fillName(existingName);
        await form.footer.saveButtonExact.click();

        await expect(pages.toasts.errorToasts.first()).toBeVisible({ timeout: 8000 });
        expect(dialogFired).toBe(false);
    });

});

// ── 409 Conflict renders the shared ConcurrencyErrorBanner (no toast) ───────
//
// Covers the PET-64 unification: every edit form pairs the shared banner with
// `meta.suppressStatuses: [409]`. Three representative slices:
//   - Department: canonical pattern (was already using suppressStatuses).
//   - Crew:       regression guard against the old double-notification bug.
//   - Customer:   regression guard against the "no inline UI at all" bug.

test.describe('409 Conflict handling', { tag: ['@WebPet', '@wp-notifications', '@WPBatch08'] }, () => {

    test('[Notifications] Verify that a stale department version shows the concurrency banner and no toast.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0246' },
    }, async ({ pages, request }) => {
        const form = pages.departmentForm;
        const dept = await ensureDepartment(request);
        try {
            const before = await (await request.get(`/api/departments/${String(dept.id)}`)).json();

            await form.gotoEdit(dept.id);
            await form.waitForForm();

            // Bump the server's version out from under the form. PUT expects a full
            // resource representation, not a partial patch — a payload missing a gated
            // field like differentialPayMethod gets that field's zero value, which
            // fails its own enum validation (400 invalid_enum) before the update (and
            // the version bump) ever happens. Spread the full GET response back so
            // every field round-trips unchanged except the deliberately-stale version.
            const bumpRes = await request.put(`/api/departments/${String(dept.id)}`, {
                data: { ...before },
            });
            expect(bumpRes.ok(), `version-bump PUT failed: ${await bumpRes.text()}`).toBeTruthy();

            // Dirty + submit with a stale version.
            await form.crewRequiredLabel.click();
            await form.footer.saveButtonExact.click();

            await expect(form.concurrencyBanner).toBeVisible({ timeout: 8000 });
            await expect(pages.toasts.errorToasts).toHaveCount(0);
        } finally {
            await deleteDepartment(request, dept.id);
        }
    });

    test('[Notifications] Verify that a stale crew version shows the concurrency banner and no toast.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0247' },
    }, async ({ pages, request }) => {
        const form = pages.crewForm;
        const crew = await ensureCrew(request);
        try {
            const before = await (await request.get(`/api/crews/${String(crew.id)}`)).json();

            await form.gotoEdit(crew.id);
            await form.waitForForm();

            const bumpRes = await request.put(`/api/crews/${String(crew.id)}`, {
                data: {
                    shortName: before.shortName ?? null,
                    active: before.active,
                    departmentCounter: before.departmentCounter ?? null,
                    supervisorCounter: before.supervisorCounter ?? null,
                    defaultRanchCounter: before.defaultRanchCounter ?? null,
                    defaultFieldCounter: before.defaultFieldCounter ?? null,
                    defaultJobCounter: before.defaultJobCounter ?? null,
                    includeInTransfer: before.includeInTransfer,
                    includeInPayrollExport: before.includeInPayrollExport,
                    includeInCostAccExport: before.includeInCostAccExport,
                    version: before.version,
                },
            });
            // Fail fast instead of silently no-oping — a rejected bump means the rest
            // of the test exercises a non-stale save and can never see the conflict
            // banner it's asserting on.
            expect(bumpRes.ok(), `version-bump PUT failed: ${await bumpRes.text()}`).toBeTruthy();

            // Dirty the form with a change that doesn't require any dropdown state.
            // A fresh crew starts with shortName=null, so any literal dirties it.
            await form.shortNameInput.fill('409-test');
            await form.shortNameInput.blur();
            await form.footer.saveButtonExact.click();

            await expect(form.concurrencyBanner).toBeVisible({ timeout: 8000 });
            await expect(pages.toasts.errorToasts).toHaveCount(0);
        } finally {
            await deleteCrew(request, crew.id);
        }
    });

    test('[Notifications] Verify that a stale customer version shows the concurrency banner and no toast.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0248' },
    }, async ({ pages, request }) => {
        const form = pages.customerForm;
        const customer = await ensureCustomer(request);
        try {
            const before = await (await request.get(`/api/customers/${String(customer.id)}`)).json();

            await form.gotoEdit(customer.id);
            await form.waitForForm();

            // See the Department test above — spread the full record rather than a
            // curated field list, so an omitted gated field can't fail its own
            // validation before the version bump ever takes effect.
            const bumpRes = await request.put(`/api/customers/${String(customer.id)}`, {
                data: { ...before },
            });
            expect(bumpRes.ok(), `version-bump PUT failed: ${await bumpRes.text()}`).toBeTruthy();

            // Guarantee an actual change vs. the current value so a prior run's
            // leftover data can't leave the form clean and Save disabled.
            const dirtyContactPerson = before.contactPerson === '409-test' ? '409-test-2' : '409-test';
            await form.contactPersonInput.fill(dirtyContactPerson);
            await form.contactPersonInput.blur();
            await form.footer.saveButtonExact.click();

            await expect(form.concurrencyBanner).toBeVisible({ timeout: 8000 });
            await expect(pages.toasts.errorToasts).toHaveCount(0);
        } finally {
            await deleteCustomer(request, customer.id);
        }
    });

});

// Bulk-update success toast + Undo coverage now lives in field.spec.ts and
// ranch.spec.ts against the DataGrid + SelectedRowsBar + PropagateChangeDialog
// flow. The legacy MultiUpdatePanel-based test was deleted with PET-424 Batch C.

// ── Auth event toasts (unauthenticated context) ─────────────────────────────

cleanTest.describe('Auth event toasts', { tag: ['@WebPet', '@wp-notifications', '@WPBatch08'] }, () => {
    // The suite's default 'Admin'/'Admin' login no longer authenticates — login
    // now goes through TigerMaster, and only an SU-style user set via
    // E2E_ADMIN_USER/E2E_ADMIN_PASSWORD is guaranteed present (see seed/README.md).
    // The fallback chain lives in src/config/webpetEnv.ts so this spec and the
    // provisioner can never disagree about which user they are.

    /**
     * Seed a session without going through the UI.
     *
     * The API's OriginCheck middleware 403s any unsafe-method request whose Origin
     * doesn't match, and `page.request` does not send one automatically the way an
     * in-page fetch would — without the explicit header the login silently fails
     * and every downstream step just times out with no obvious cause.
     */
    async function seedSession(page: Page, baseURL: string | undefined): Promise<void> {
        const res = await page.request.post(apiUrl('/api/auth/login'), {
            data: { username: ADMIN_USER, password: ADMIN_PASSWORD },
            headers: baseURL ? { Origin: baseURL } : undefined,
        });
        const body = (await res.json()) as { user: unknown };
        await page.addInitScript((u) => {
            sessionStorage.setItem('pt_user', JSON.stringify(u));
        }, body.user);
    }

    cleanTest('[Notifications] Verify that logging out emits a signed-out toast and redirects to login.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0249' },
    }, async ({ page, pages, baseURL }) => {
        await seedSession(page, baseURL);
        await pages.shell.gotoRoot();
        await pages.shell.userMenuTrigger.click();
        await pages.shell.logOutMenuItem.click();

        await cleanExpect(pages.toasts.message('Signed out')).toBeVisible({ timeout: 5000 });
        await cleanExpect(page).toHaveURL(/\/login$/);
    });

    cleanTest('[Notifications] Verify that logging in emits a welcome toast.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0250' },
    }, async ({ pages }) => {
        await pages.login.gotoLogin();
        await pages.login.signIn(ADMIN_USER, ADMIN_PASSWORD);
        // Don't hardcode the interpolated name — it's whatever displayName the
        // logged-in user carries (e.g. "Su" under E2E_ADMIN_USER=su), not
        // necessarily "Admin". The toast's message format is what's under test.
        await cleanExpect(pages.toasts.message(/Welcome,\s*\S+/)).toBeVisible({ timeout: 5000 });
    });

});

// ── 401 discriminators: session_expired vs not_authenticated ────────────────
//
// Covers the PET-73 two-code envelope. The API emits:
//   - 401 { code: "session_expired" }  → redirect + toast "Your session expired…"
//   - 401 { code: "not_authenticated" } → silent redirect, no toast
// Both tests intercept the save route to force the envelope so we don't need
// to juggle real session cookies — what matters is the frontend's behavior in
// response to each code.

test.describe('401 session-lifecycle discriminator', { tag: ['@WebPet', '@wp-notifications', '@WPBatch08'] }, () => {

    test('[Notifications] Verify that a session-expired 401 shows the expiry toast and redirects to login.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0251' },
    }, async ({ page, pages, request }) => {
        const form = pages.departmentForm;
        // Load this test's own department (the PUT is mocked, so no real mutation).
        const dept = await ensureDepartment(request);
        try {
            await form.gotoEdit(dept.id);
            await form.waitForForm();

            // Intercept the PUT to return a 401 with the session_expired code.
            await page.route(`**/api/departments/${String(dept.id)}`, async (route, req) => {
                if (req.method() !== 'PUT') {
                    await route.fallback();
                    return;
                }
                await route.fulfill({
                    status: 401,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Session expired.', code: 'session_expired' }),
                });
            });

            // Dirty the form and submit — the mutation hits the intercept and 401s.
            await form.crewRequiredLabel.click();
            await form.footer.saveButtonExact.click();

            await expect(pages.toasts.message(/session expired.*sign in again/i)).toBeVisible({
                timeout: 5000,
            });
            // The redirect carries a `?from=` return-path query param so the user
            // lands back where they were after re-authenticating.
            await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 5000 });
        } finally {
            await deleteDepartment(request, dept.id);
        }
    });

    test('[Notifications] Verify that a not-authenticated 401 redirects silently without the expiry toast.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0252' },
    }, async ({ page, pages, request }) => {
        // KNOWN APP BUG — same root cause as the "wrong current password" test in
        // profile-change-password.spec.ts (shared/lib/api.ts:20-27): the client-layer
        // 401 middleware calls `handleAuthExpiry()` with no arguments, so `code` is
        // always undefined there. Per handleAuthExpiry's own doc comment
        // (shared/lib/notifications.ts:313-326), an undefined code is deliberately
        // treated as "expired" (shows the toast) for backward compatibility — which
        // means the middleware can never reach the not_authenticated branch that
        // suppresses the toast, even though this response's body clearly carries
        // `{ code: 'not_authenticated' }`. Reproduced locally: the "session expired"
        // toast shows here when it's specified not to.
        test.fail(true, 'app bug: api.ts calls handleAuthExpiry() without the response code, so not_authenticated can never suppress the toast — see comment above');

        const form = pages.departmentForm;
        const dept = await ensureDepartment(request);
        await form.gotoEdit(dept.id);
        await form.waitForForm();

        await page.route(`**/api/departments/${String(dept.id)}`, async (route, req) => {
            if (req.method() !== 'PUT') {
                await route.fallback();
                return;
            }
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Not authenticated.', code: 'not_authenticated' }),
            });
        });

        await form.crewRequiredLabel.click();
        await form.footer.saveButtonExact.click();

        await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 5000 });
        // The "your session expired" toast must NOT appear on the not_authenticated
        // path — the user never had a session to lose.
        await expect(pages.toasts.message(/session expired.*sign in again/i)).toHaveCount(0);
    });

});

// ── Offline / online detection ──────────────────────────────────────────────

test.describe('Offline/online toasts', { tag: ['@WebPet', '@wp-notifications', '@WPBatch08'] }, () => {

    test('[Notifications] Verify that toggling the context offline and back surfaces toasts.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0253' },
    }, async ({ context, pages }) => {
        await pages.departmentList.gotoList();

        await context.setOffline(true);
        await expect(pages.toasts.message(/offline/i)).toBeVisible({ timeout: 5000 });

        await context.setOffline(false);
        await expect(pages.toasts.message('Back online')).toBeVisible({ timeout: 5000 });
    });

});
