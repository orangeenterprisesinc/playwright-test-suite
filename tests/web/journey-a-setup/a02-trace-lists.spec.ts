/**
 * Batch A smoke test for the Grade/Variety/Size traceability list pages, for
 * Catalog workflow **A2 — Ranch, field, crop, and variety setup**.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A2 |
 * | Plan | `test-plans/journey-a/a02-ranch-field-crop-variety-setup.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A2-050`…`A2-054` |
 *
 * Relocated from `tests/webpet/traceability-batch-a-smoke.spec.ts`
 * (WP-0390…WP-0394). Every assertion below is the one that spec carried, in
 * the same order and the same describes; what changed is the fixture
 * (`base.fixture`) and the id/tag vocabulary — there is no `beforeAll`/
 * `afterAll` to move, since this file provisions no records of its own.
 *
 * Covers 3 representative shapes:
 *   - Grade: simple TraceLookupItem (proxy for Method/PackagingStyle/Pool/
 *     Region/Storage/Warehouse — all 6 sibling clones share the structure)
 *   - Variety: FK column (Crop) + print/export wiring + alias-aware page
 *   - Size: extra bulkItem + read-only quantity/unit columns
 *
 * Coverage is page-chrome + a single interaction (Multi Update toggle's
 * `aria-pressed` flip) since the inline-edit / propagate / undo flows are
 * exercised exhaustively by `a02-ranch-list.spec.ts` and
 * `a02-field-list.spec.ts`. Kept serial, as in the original file.
 */
import { expect, test } from '@fixtures/base.fixture';

test.describe.configure({ mode: 'serial' });

// ── Grade ──────────────────────────────────────────────────────────────────

test.describe('GradeListPage smoke', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Grade] Verify that the list renders its grid and the Multi Update button toggles aria-pressed.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-050' },
            { type: 'requirement', description: 'A2-R55|A2-R56' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-051' },
            { type: 'requirement', description: 'A2-R57|A2-R58' },
        ],
    }, async ({ pages }) => {
        const list = pages.gradeList;
        await list.gotoListWithQuery('?sort=name.desc');
        await expect(list.grid.newLink).toHaveAttribute('href', /\?sort=name\.desc/);
    });

});

// ── Variety ────────────────────────────────────────────────────────────────

test.describe('VarietyListPage smoke', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Variety] Verify that the list renders its grid with the Crop FK and read-only name columns.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-052' },
            { type: 'requirement', description: 'A2-R59|A2-R60' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-053' },
            { type: 'requirement', description: 'A2-R61|A2-R62' },
        ],
    }, async ({ pages }) => {
        const list = pages.varietyList;
        await list.gotoList();
        // Renamed from "Print Report" to "Report" (i18n common.reportLabel).
        await expect(list.reportButton).toBeVisible();
    });

});

// ── Size ───────────────────────────────────────────────────────────────────

test.describe('SizeListPage smoke', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Size] Verify that the list renders its grid with the active and bulk-item toggle columns.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-054' },
            { type: 'requirement', description: 'A2-R63|A2-R64' },
        ],
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
