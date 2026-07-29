import { test, expect } from './fixtures';

// Smoke test for PET-210: list page resolves the real DataTable, not the
// InventoryStubPage placeholder. Header-only scope; the InventoryCenterItem
// junction-table grid is deferred until PET-215 ships.

test.describe('Inventory > Inventory Center', () => {
  test('list page navigates to /setup/inventory/centers and is no longer the stub', async ({
    page,
  }) => {
    await page.goto('/setup/inventory/centers');
    await expect(page.getByTestId('inventory-stub-page')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Inventory Centers' })).toBeVisible();
    // The create affordance is a Button-rendered-as-link (role=button, not link),
    // so getByRole('link', …) no longer matches it. Target the create anchor by its
    // href — stable regardless of how the button/link is styled.
    await expect(page.locator('a[href$="/setup/inventory/centers/new"]').first()).toBeVisible();
  });
});
