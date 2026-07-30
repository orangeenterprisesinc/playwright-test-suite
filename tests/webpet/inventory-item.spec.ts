/**
 * Smoke test for PET-215: list page resolves the real DataTable, not the
 * InventoryStubPage placeholder. Header-only scope; the InventoryCenterItem
 * junction-table grid is deferred until a follow-up that wires it on both
 * InventoryCenterFormPage and InventoryItemFormPage simultaneously.
 *
 * Framework-aligned (Batch 04): locators live in InventoryListPage.
 */
import { expect, test } from '@fixtures/webpet.fixture';

test.describe('Inventory > Inventory Item', { tag: ['@WebPet', '@wp-setup', '@wp-inventory', '@WPBatch04'] }, () => {

    test('[Inventory] Verify that the Inventory Item list page renders and is no longer the stub.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0215' },
    }, async ({ pages }) => {
        const list = pages.inventoryItemList;
        await list.goto();
        await expect(list.stubPage).toHaveCount(0);
        await expect(list.heading).toBeVisible();
        // Create affordance is a Button-as-link (role=button); target the anchor by href.
        await expect(list.newLink).toBeVisible();
    });

});
