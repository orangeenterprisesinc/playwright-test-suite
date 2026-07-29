import { test, expect } from './fixtures';

// Smoke test for PET-209: list page resolves the real DataTable, not the
// InventoryStubPage placeholder. Create + edit + multi-update flows are
// exercised via manual verification (per the slice doc).

test.describe('Inventory > Inventory Item Type', () => {
  test('list page navigates to /setup/inventory/item-types and is no longer the stub', async ({
    page,
  }) => {
    await page.goto('/setup/inventory/item-types');
    await expect(page.getByTestId('inventory-stub-page')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Inventory Item Types' })).toBeVisible();
    // Create affordance is a Button-as-link (role=button); target the anchor by href.
    await expect(page.locator('a[href$="/setup/inventory/item-types/new"]').first()).toBeVisible();
  });
});
