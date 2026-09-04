/**
 * Onboarding badges (PET-559) — smoke spec covering the list-page + form-page
 * surfaces. Onboarding badges are Employee table rows where RecordType = 1;
 * they expose a narrower form (no SSN, hire/release dates, address) than
 * regular Employees.
 *
 * Prerequisites for live execution:
 *   - dev server running: cd apps/web && pnpm dev
 *   - API server running: cd apps/api && go run .
 *   - DB seeded with at least one Employee row where RecordType = 1 (or the
 *     suite will create one via the New form).
 *
 * NOT executed in the /execute-ticket run that shipped this file. Run
 * manually against a live dev environment to confirm the slice end-to-end.
 *
 * Framework-aligned (Batch 06): locators live in OnboardingBadgeListPage /
 * OnboardingBadgeFormPage, which also record the route-versus-resource split —
 * the section routes under /setup/badge while the API resource stays
 * /api/onboarding-badges.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import { ensureEmployee, deleteEmployee, type EnsuredEmployee } from './data-factory';

/**
 * Force `ReusableOnboardingBadges` on for every test in this file.
 *
 * `/setup/badge` is behind that preference — with it off the route guard redirects
 * to `/setup`, so the screen never renders and every grid wait here times out with no
 * element to name. The preference was flipped ON by hand via su on 2026-08-24
 * (artifacts/bug-evidence/pref-backup-2026-08-24) and has since reverted, which is
 * what turned WP-0259 red in CI run 33847629704 — the same drift that broke WP-0301.
 * Rewriting the response makes the screen reachable wherever the suite runs instead of
 * depending on shared dev state somebody else can toggle. Same idiom as
 * `employee.spec.ts`'s preference rewrite.
 */
test.beforeEach(async ({ page }) => {
    await page.route('**/api/preferences*', async (route) => {
        const response = await route.fetch();
        const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) {
            await route.fulfill({ response });
            return;
        }
        body['reusableOnboardingBadges'] = true;
        await route.fulfill({ response, json: body });
    });
});

// The SPA re-fetches preferences on its own schedule, so a handler can still be
// mid-`route.fetch()` when the context tears down, which surfaces as a route callback
// error on an otherwise-green test.
test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test.describe('Onboarding Badges — list page chrome', { tag: ['@WebPet', '@wp-setup', '@wp-badge', '@WPBatch06'] }, () => {

    test('[Badge] Verify that the list page title reads Onboarding Badges.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0254' },
    }, async ({ pages }) => {
        const list = pages.onboardingBadgeList;
        await list.goto();
        await expect(list.heading).toBeVisible();
    });

    test('[Badge] Verify that the grid renders with the expected columns.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0255' },
    }, async ({ pages }) => {
        const list = pages.onboardingBadgeList;
        await list.gotoList();
        await expect(list.grid.columnHeader(/^Name/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Barcode/)).toBeVisible();
        await expect(list.grid.columnHeader(/Export Identifier/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Crew/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Department/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Active/)).toBeVisible();
    });

    test('[Badge] Verify that the New Badge button navigates to the new-record form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0256' },
    }, async ({ page, pages }) => {
        const list = pages.onboardingBadgeList;
        await list.goto();
        await list.newBadgeButton.click();
        await expect(page).toHaveURL(/\/setup\/badge\/new/);
    });

});

test.describe('Onboarding Badges — new-record form', { tag: ['@WebPet', '@wp-setup', '@wp-badge', '@WPBatch06'] }, () => {

    test('[Badge] Verify that the new-record form renders its name, barcode, export identifier and active fields.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0257' },
    }, async ({ pages }) => {
        const form = pages.onboardingBadgeForm;
        await form.gotoNew();
        await expect(form.nameInput).toBeVisible();
        await expect(form.codeInput).toBeVisible();
        await expect(form.exportIdentifierInput).toBeVisible();
        await expect(form.activeCheckbox).toBeVisible();
    });

    test('[Badge] Verify that Save is disabled until a name is entered.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0258' },
    }, async ({ pages }) => {
        const form = pages.onboardingBadgeForm;
        await form.gotoNew();
        // The form's Save button is inside the FormFooter — disabled while
        // !isDirty or when validation fails.
        await expect(form.footer.saveButton).toBeDisabled();
    });

});

test.describe('Onboarding Badges — cross-contamination guard', { tag: ['@WebPet', '@wp-setup', '@wp-badge', '@WPBatch06'] }, () => {

    // Provisioning lives in hooks, not the test's own try/finally: a test timeout
    // aborts the body *and* its finally, which the 2026-09-04 run proved — the in-test
    // DELETE ran against a tearing-down context and failed in After Hooks, leaking the
    // row. Employee has no purge endpoint (WEBPET-1798), so a leaked soft-deleted name
    // is stuck forever.
    let emp: EnsuredEmployee;

    test.beforeAll(async ({ request }) => {
        emp = await ensureEmployee(request, { namePrefix: 'E2EBadgeGuard' });
    });

    test.afterAll(async ({ request }) => {
        if (emp) await deleteEmployee(request, emp.id);
    });

    test('[Badge] Verify that regular employees do not appear in the onboarding-badges list.', {
        tag: ['@wp-api', '@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0259' },
    }, async ({ page, pages, request }) => {
        // A regular Employee (RecordType=0) must be absent from the badges list, which
        // filters `RecordType = 1`; any leakage is a backend regression. A factory
        // employee makes this a real check instead of a spot-check against a
        // possibly-absent seeded name.
        const resp = await request.get('/api/onboarding-badges');
        expect(resp.ok()).toBeTruthy();
        const badges = (await resp.json()) as Array<{ name: string }>;
        expect(badges.find((b) => b.name === emp.name)).toBeUndefined();

        // UI leg. Watch the page's OWN list query — the API call above uses the request
        // fixture, so it proves nothing about what the screen fetched. Asserting the
        // response separates "the query failed" from "the screen did not render", and
        // the bounded grid wait then fails in seconds naming the element instead of
        // burning the full 30s budget as an anonymous timeout.
        const list = pages.onboardingBadgeList;
        const listQuery = page.waitForResponse(
            (r) => r.url().includes('/api/onboarding-badges') && r.request().method() === 'GET',
            { timeout: 10_000 },
        );
        await list.goto();
        expect((await listQuery).status(), "the list page's own onboarding-badges query").toBe(200);
        await list.grid.waitForGrid(8_000);

        // Absence, narrowed first: the grid virtualizes past ~100 rows, so a bare
        // cellByText miss is a false negative. revealRowWithText filters when the
        // screen renders a column filter and scrolls the virtualizer when it does not.
        await list.grid.revealRowWithText(emp.lastName);
        await expect(list.grid.cellByText(emp.lastName)).toHaveCount(0);
    });

});
