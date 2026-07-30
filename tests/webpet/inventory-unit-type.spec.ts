/**
 * Smoke test for PET-207: list page resolves the real DataTable, not the
 * InventoryStubPage placeholder. The create + edit + multi-update flows are
 * exercised via manual verification (per the slice doc) since the seeded dev
 * DB is required for real records.
 *
 * Prereqs — same as every other spec:
 *   cd apps/api && go run .
 *   cd apps/web && pnpm dev
 *
 * Framework-aligned (Batch 04): locators live in InventoryListPage.
 */
import { expect, test } from '@fixtures/webpet.fixture';

test.describe('Inventory > Unit Type', { tag: ['@WebPet', '@wp-setup', '@wp-inventory', '@WPBatch04'] }, () => {

    test('[Inventory] Verify that the Unit Type list page renders and is no longer the stub.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0217' },
    }, async ({ pages }) => {
        const list = pages.inventoryUnitTypeList;
        await list.goto();
        await expect(list.stubPage).toHaveCount(0);
        // Header reflects inventory:page.list.unitType.title (en locale).
        await expect(list.heading).toBeVisible();
        // The "New Unit Type" CTA is the list page's tell.
        // Create affordance is a Button-as-link (role=button); target the anchor by href.
        await expect(list.newLink).toBeVisible();
    });

});
