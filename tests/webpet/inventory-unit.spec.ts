/**
 * Smoke test for PET-208: list page resolves the real DataTable, not the
 * InventoryStubPage placeholder. Create + edit + multi-update flows are
 * exercised via manual verification (per the slice doc) since the seeded
 * dev DB is required for real records.
 *
 * Prereqs:
 *   cd apps/api && go run .
 *   cd apps/web && pnpm dev
 *
 * Framework-aligned (Batch 04): locators live in InventoryListPage.
 */
import { expect, test } from '@fixtures/webpet.fixture';

test.describe('Inventory > Unit', { tag: ['@WebPet', '@wp-setup', '@wp-inventory', '@WPBatch04'] }, () => {

    test('[Inventory] Verify that the Unit list page renders and is no longer the stub.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0218' },
    }, async ({ pages }) => {
        const list = pages.inventoryUnitList;
        await list.goto();
        await expect(list.stubPage).toHaveCount(0);
        await expect(list.heading).toBeVisible();
        // Create affordance is a Button-as-link (role=button); target the anchor by href.
        await expect(list.newLink).toBeVisible();
    });

});
