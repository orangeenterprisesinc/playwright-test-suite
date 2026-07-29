import { test, expect } from './fixtures';

// Smoke test for PET-207: list page resolves the real DataTable, not the
// InventoryStubPage placeholder. The create + edit + multi-update flows are
// exercised via manual verification (per the slice doc) since the seeded dev
// DB is required for real records.
//
// Prereqs — same as every other spec:
//   cd apps/api && go run .
//   cd apps/web && pnpm dev

test.describe('Inventory > Unit Type', () => {
  test('list page navigates to /setup/inventory/unit-types and is no longer the stub', async ({
    page,
  }) => {
    await page.goto('/setup/inventory/unit-types');
    await expect(page.getByTestId('inventory-stub-page')).toHaveCount(0);
    // Header reflects inventory:page.list.unitType.title (en locale).
    await expect(page.getByRole('heading', { name: 'Unit Types' })).toBeVisible();
    // The "New Unit Type" CTA is the list page's tell.
    // Create affordance is a Button-as-link (role=button); target the anchor by href.
    await expect(page.locator('a[href$="/setup/inventory/unit-types/new"]').first()).toBeVisible();
  });
});
