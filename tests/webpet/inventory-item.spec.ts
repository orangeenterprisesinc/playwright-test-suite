import { test, expect } from './fixtures';

// Smoke test for PET-215: list page resolves the real DataTable, not the
// InventoryStubPage placeholder. Header-only scope; the InventoryCenterItem
// junction-table grid is deferred until a follow-up that wires it on both
// InventoryCenterFormPage and InventoryItemFormPage simultaneously.

test.describe('Inventory > Inventory Item', () => {
  test('list page navigates to /setup/inventory/items and is no longer the stub', async ({
    page,
  }) => {
    await page.goto('/setup/inventory/items');
    await expect(page.getByTestId('inventory-stub-page')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Inventory Items' })).toBeVisible();
    // Create affordance is a Button-as-link (role=button); target the anchor by href.
    await expect(page.locator('a[href$="/setup/inventory/items/new"]').first()).toBeVisible();
  });
});
