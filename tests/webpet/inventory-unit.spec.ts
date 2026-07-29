import { test, expect } from './fixtures';

// Smoke test for PET-208: list page resolves the real DataTable, not the
// InventoryStubPage placeholder. Create + edit + multi-update flows are
// exercised via manual verification (per the slice doc) since the seeded
// dev DB is required for real records.
//
// Prereqs:
//   cd apps/api && go run .
//   cd apps/web && pnpm dev

test.describe('Inventory > Unit', () => {
  test('list page navigates to /setup/inventory/units and is no longer the stub', async ({
    page,
  }) => {
    await page.goto('/setup/inventory/units');
    await expect(page.getByTestId('inventory-stub-page')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Units' })).toBeVisible();
    // Create affordance is a Button-as-link (role=button); target the anchor by href.
    await expect(page.locator('a[href$="/setup/inventory/units/new"]').first()).toBeVisible();
  });
});
