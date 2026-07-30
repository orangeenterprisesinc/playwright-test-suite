/**
 * Smoke test for PET-210: list page resolves the real DataTable, not the
 * InventoryStubPage placeholder. Header-only scope; the InventoryCenterItem
 * junction-table grid is deferred until PET-215 ships.
 *
 * Framework-aligned (Batch 04): locators live in InventoryListPage, one class
 * shared by all five Inventory Setup lists.
 */
import { expect, test } from '@fixtures/webpet.fixture';

test.describe('Inventory > Inventory Center', { tag: ['@WebPet', '@wp-setup', '@wp-inventory', '@WPBatch04'] }, () => {

    test('[Inventory] Verify that the Inventory Center list page renders and is no longer the stub.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0213' },
    }, async ({ pages }) => {
        const list = pages.inventoryCenterList;
        await list.goto();
        await expect(list.stubPage).toHaveCount(0);
        await expect(list.heading).toBeVisible();
        // The create affordance is a Button-rendered-as-link (role=button, not link),
        // so getByRole('link', …) no longer matches it. Target the create anchor by its
        // href — stable regardless of how the button/link is styled.
        await expect(list.newLink).toBeVisible();
    });

});
