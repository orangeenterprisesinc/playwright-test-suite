/**
 * Onboarding badges (PET-559) e2e for Catalog workflow **A13 — Employee
 * onboarding forms configuration**: list-page chrome, new-record form and the
 * cross-contamination guard. Onboarding badges are Employee table rows where
 * RecordType = 1; they expose a narrower form (no SSN, hire/release dates,
 * address) than regular Employees.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A13 |
 * | Plan | `test-plans/journey-a/a13-onboarding-badges.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A13-002`…`A13-007` |
 *
 * Relocated from `tests/webpet/onboarding-badges.spec.ts` (WP-0254…WP-0259).
 * Every assertion below is the one that spec carried, in the same order and
 * the same describes; what changed is the fixture (`base.fixture`), the
 * id/tag vocabulary, and the one repaired assertion documented below.
 *
 * Three tests (`A13-002`, `A13-003`, `A13-005`) carried web-pet's `@wp-smoke`
 * tag; no test here keeps `@Smoke`, so all three demote to
 * `['@HighLevel', '@Regression']`.
 *
 * `A13-007` (WP-0259) used to end on a bare `gotoList()` with no assertion — a
 * navigation proving nothing. Repaired in the house pattern: assert the grid
 * root is visible first, then assert the regular employee is absent from it —
 * positive anchor before the negative, exactly as `A2-029` does, so a silently
 * failed navigation cannot make the absence check pass vacuously.
 *
 * Route/resource split carried over unchanged: the section routes under
 * `/setup/badge` while the API resource stays `/api/onboarding-badges`.
 */
import { expect, test } from '@fixtures/base.fixture';
import { ensureEmployee, deleteEmployee } from '@data/generated/data-factory';

test.describe('Onboarding Badges — list page chrome', { tag: ['@JourneyA', '@A13'] }, () => {

    test('[Badge] Verify that the list page title reads Onboarding Badges.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A13-002' },
            { type: 'requirement', description: 'A13-R1' },
        ],
    }, async ({ pages }) => {
        const list = pages.onboardingBadgeList;
        await list.goto();
        await expect(list.heading).toBeVisible();
    });

    test('[Badge] Verify that the grid renders with the expected columns.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A13-003' },
            { type: 'requirement', description: 'A13-R2' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A13-004' },
            { type: 'requirement', description: 'A13-R3' },
        ],
    }, async ({ page, pages }) => {
        const list = pages.onboardingBadgeList;
        await list.goto();
        await list.newBadgeButton.click();
        await expect(page).toHaveURL(/\/setup\/badge\/new/);
    });

});

test.describe('Onboarding Badges — new-record form', { tag: ['@JourneyA', '@A13'] }, () => {

    test('[Badge] Verify that the new-record form renders its name, barcode, export identifier and active fields.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A13-005' },
            { type: 'requirement', description: 'A13-R4' },
        ],
    }, async ({ pages }) => {
        const form = pages.onboardingBadgeForm;
        await form.gotoNew();
        await expect(form.nameInput).toBeVisible();
        await expect(form.codeInput).toBeVisible();
        await expect(form.exportIdentifierInput).toBeVisible();
        await expect(form.activeCheckbox).toBeVisible();
    });

    test('[Badge] Verify that Save is disabled until a name is entered.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A13-006' },
            { type: 'requirement', description: 'A13-R5' },
        ],
    }, async ({ pages }) => {
        const form = pages.onboardingBadgeForm;
        await form.gotoNew();
        // The form's Save button is inside the FormFooter — disabled while
        // !isDirty or when validation fails.
        await expect(form.footer.saveButton).toBeDisabled();
    });

});

test.describe('Onboarding Badges — cross-contamination guard', { tag: ['@JourneyA', '@A13'] }, () => {

    test('[Badge] Verify that regular employees do not appear in the onboarding-badges list.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A13-007' },
            { type: 'requirement', description: 'A13-R6' },
        ],
    }, async ({ pages, sessionApi }) => {
        // Create a regular Employee (RecordType=0) and assert it is absent from the
        // badges list (API filter `RecordType = 1`); any leakage is a backend
        // regression. Using a factory employee makes this a real check instead of a
        // spot-check against a possibly-absent seeded name.
        const emp = await ensureEmployee(sessionApi);
        try {
            const resp = await sessionApi.get('/api/onboarding-badges');
            expect(resp.ok()).toBeTruthy();
            const badges = (await resp.json()) as Array<{ name: string }>;
            expect(badges.find((b) => b.name === emp.name)).toBeUndefined();

            // The list page should also render without the regular employee
            // leaking into it.
            await pages.onboardingBadgeList.gotoList();
            // Positive anchor before the negative: proves the grid actually
            // rendered, so the absence check below cannot pass because navigation
            // silently failed. Repairs the original spec's bare `gotoList()`,
            // which asserted nothing.
            await expect(pages.onboardingBadgeList.grid.getRoot()).toBeVisible();
            await expect(pages.onboardingBadgeList.grid.cellByText(emp.name)).not.toBeVisible();
        } finally {
            await deleteEmployee(sessionApi, emp.id);
        }
    });

});
