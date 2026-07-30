/**
 * Batch B smoke test for the PET-424 setup-core list page migrations.
 *
 * Covers 3 representative shapes:
 *   - Crop: print-mechanical with alias (proxy for Department)
 *   - Crew: FK-mechanical + print + alias (proxy for Customer/Equipment)
 *   - Employee: dual-FK (proxy for any multi-FK page)
 *
 * Coverage is page-chrome only — full inline-edit / propagate / undo
 * flows are exercised exhaustively by ranch.spec.ts and field.spec.ts.
 *
 * Framework-aligned (Batch 05): reuses the Crop/Crew/Employee list page objects
 * introduced in Batches 1-2; no new screens. Action order and assertions
 * unchanged.
 */
import { expect, test } from '@fixtures/webpet.fixture';

test.describe.configure({ mode: 'serial' });

// ── Crop ───────────────────────────────────────────────────────────────────

test.describe('CropListPage smoke', { tag: ['@WebPet', '@wp-setup', '@wp-batchb', '@WPBatch05'] }, () => {

    test('[Crop] Verify that the list renders its grid, Multi Update toggle and Report button.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0372' },
    }, async ({ pages }) => {
        const list = pages.cropList;
        await list.gotoList();
        await expect(list.grid.columnHeader(/^Name/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Active/)).toBeVisible();
        // The list-header print button is labelled "Report" (i18n common.reportLabel);
        // it was renamed from "Print Report" since this smoke test was written.
        await expect(list.reportButton).toBeVisible();

        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'false');
        await list.grid.toggleMultiUpdate();
        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'true');
    });

    test('[Crop] Verify that the outbound New Crop link carries the URL search suffix.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0373' },
    }, async ({ pages }) => {
        const list = pages.cropList;
        await list.gotoListWithQuery('?sort=name.desc');
        await expect(list.grid.newLink).toHaveAttribute('href', /\?sort=name\.desc/);
    });

});

// ── Crew ───────────────────────────────────────────────────────────────────

test.describe('CrewListPage smoke', { tag: ['@WebPet', '@wp-setup', '@wp-batchb', '@WPBatch05'] }, () => {

    test('[Crew] Verify that the list renders its grid with the Department FK column.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0374' },
    }, async ({ pages }) => {
        const list = pages.crewList;
        await list.gotoList();
        await expect(list.grid.columnHeader(/^Name/)).toBeVisible();
        await expect(list.grid.columnHeader(/Department/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Active/)).toBeVisible();
    });

    test('[Crew] Verify that the Multi Update toggle paints aria-pressed.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0375' },
    }, async ({ pages }) => {
        const list = pages.crewList;
        await list.gotoList();
        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'false');
        await list.grid.toggleMultiUpdate();
        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'true');
    });

});

// ── Employee ────────────────────────────────────────────────────────────────

test.describe('EmployeeListPage smoke', { tag: ['@WebPet', '@wp-setup', '@wp-batchb', '@WPBatch05'] }, () => {

    test('[Employee] Verify that the list renders its grid with both Department and Crew FK columns.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0376' },
    }, async ({ pages }) => {
        const list = pages.employeeList;
        await list.gotoList();
        await expect(list.grid.columnHeader(/^Name/)).toBeVisible();
        await expect(list.grid.columnHeader(/Department/)).toBeVisible();
        await expect(list.grid.columnHeader(/Crew/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Active/)).toBeVisible();
    });

});
