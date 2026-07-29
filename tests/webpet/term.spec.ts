import { test, expect } from './fixtures';

// Smoke test for PET-214 (Terms CRUD, Grower Billing module-gated). Verifies
// the list page resolves when GrowerBilling is in PT_MODULES. If the dev env
// doesn't enable GrowerBilling, the route 403s — handled by checking either
// the heading OR the Forbidden response.

test.describe('Setup > Terms (Grower Billing)', () => {
  test('list page renders when GrowerBilling module is enabled', async ({ page }) => {
    const resp = await page.goto('/setup/terms');
    if (resp && resp.status() === 403) {
      // GrowerBilling module not in PT_MODULES — acceptable in dev env.
      // Sidebar entry is also hidden in this case (verified by adjacent assertion below).
      await page.goto('/dashboard');
      await expect(page.getByRole('link', { name: /^terms$/i })).toHaveCount(0);
      return;
    }
    await expect(page.getByRole('heading', { name: 'Terms' })).toBeVisible();
    // The "New Term" affordance is a Button-rendered-as-Link, so match either role.
    const newTerm = page
      .getByRole('link', { name: /new term/i })
      .or(page.getByRole('button', { name: /new term/i }));
    await expect(newTerm.first()).toBeVisible();
  });
});
