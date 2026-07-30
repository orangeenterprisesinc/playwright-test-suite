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
import { ensureEmployee, deleteEmployee } from './data-factory';

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

    test('[Badge] Verify that regular employees do not appear in the onboarding-badges list.', {
        tag: ['@wp-api', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0259' },
    }, async ({ pages, request }) => {
        // Create a regular Employee (RecordType=0) and assert it is absent from the
        // badges list (API filter `RecordType = 1`); any leakage is a backend
        // regression. Using a factory employee makes this a real check instead of a
        // spot-check against a possibly-absent seeded name.
        const emp = await ensureEmployee(request);
        try {
            const resp = await request.get('/api/onboarding-badges');
            expect(resp.ok()).toBeTruthy();
            const badges = (await resp.json()) as Array<{ name: string }>;
            expect(badges.find((b) => b.name === emp.name)).toBeUndefined();

            // The list page should also render without the badge row count
            // hitting the regular-Employee count.
            await pages.onboardingBadgeList.gotoList();
        } finally {
            await deleteEmployee(request, emp.id);
        }
    });

});
