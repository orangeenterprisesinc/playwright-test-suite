/**
 * Batch A smoke test for the PET-424 traceability list page migrations.
 *
 * Covers 3 representative shapes:
 *   - Grade: simple TraceLookupItem (proxy for Method/PackagingStyle/Pool/
 *     Region/Storage/Warehouse — all 6 sibling clones share the structure)
 *   - Variety: FK column (Crop) + print/export wiring + alias-aware page
 *   - Size: extra bulkItem + read-only quantity/unit columns
 *
 * Coverage is page-chrome + a single interaction (Multi Update toggle's
 * `aria-pressed` flip) since the inline-edit / propagate / undo flows are
 * exercised exhaustively by ranch.spec.ts and field.spec.ts.
 *
 * Framework-aligned (Batch 05): Grade and Size bind TraceLookupListPage; Variety
 * reuses the list page from Batch 2. Action order and assertions unchanged.
 */
import { expect, test } from '@fixtures/webpet.fixture';

test.describe.configure({ mode: 'serial' });

// ── Grade ──────────────────────────────────────────────────────────────────

test.describe('GradeListPage smoke', { tag: ['@WebPet', '@wp-setup', '@wp-batcha', '@WPBatch05'] }, () => {

    test('[Grade] Verify that the list renders its grid and the Multi Update button toggles aria-pressed.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0390' },
    }, async ({ pages }) => {
        const list = pages.gradeList;
        await list.gotoList();
        await expect(list.grid.columnHeader(/^Name/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Export Identifier/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Active/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Barcode/)).toBeVisible();

        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'false');
        await list.grid.toggleMultiUpdate();
        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'true');
    });

    test('[Grade] Verify that the outbound New Grade link carries the URL search suffix.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0391' },
    }, async ({ pages }) => {
        const list = pages.gradeList;
        await list.gotoListWithQuery('?sort=name.desc');
        await expect(list.grid.newLink).toHaveAttribute('href', /\?sort=name\.desc/);
    });

});

// ── Variety ────────────────────────────────────────────────────────────────

test.describe('VarietyListPage smoke', { tag: ['@WebPet', '@wp-setup', '@wp-batcha', '@WPBatch05'] }, () => {

    test('[Variety] Verify that the list renders its grid with the Crop FK and read-only name columns.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0392' },
    }, async ({ pages }) => {
        const list = pages.varietyList;
        await list.gotoList();
        // Crop is the alias-driven label — default alias resolves to "Crop".
        await expect(list.grid.columnHeader(/^Crop/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Name/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Barcode/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Export Identifier/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Active/)).toBeVisible();
    });

    test('[Variety] Verify that the Report button is visible on the alias-aware page header.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0393' },
    }, async ({ pages }) => {
        const list = pages.varietyList;
        await list.gotoList();
        // Renamed from "Print Report" to "Report" (i18n common.reportLabel).
        await expect(list.reportButton).toBeVisible();
    });

});

// ── Size ───────────────────────────────────────────────────────────────────

test.describe('SizeListPage smoke', { tag: ['@WebPet', '@wp-setup', '@wp-batcha', '@WPBatch05'] }, () => {

    test('[Size] Verify that the list renders its grid with the active and bulk-item toggle columns.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0394' },
    }, async ({ pages }) => {
        const list = pages.sizeList;
        await list.gotoList();
        await expect(list.grid.columnHeader(/^Name/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Export Identifier/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Barcode/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Active/)).toBeVisible();
        // bulkItem column is unique to Size — column header label should be visible.
        await expect(list.grid.columnHeader(/Bulk Item/)).toBeVisible();
        // Read-only columns
        await expect(list.grid.columnHeader(/^Quantity/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Unit/)).toBeVisible();
    });

});
