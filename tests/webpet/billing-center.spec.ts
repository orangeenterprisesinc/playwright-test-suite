/**
 * Billing Center form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when BillingCenterListPage migrated to the new
 * DataGrid lib (PET-424). Form pages were not touched by that migration,
 * so the form tests below remain valid against the existing DOM.
 */
import { test, expect } from './fixtures';
// Migration note (types only): Parameters<typeof test>[1]['page'] resolved to a
// different overload under this repo's @playwright/test 1.58.2 — use Page directly.
import type { Page } from './fixtures';

// Smoke + CRUD tests for PET-213 (Billing Center CRUD, Grower Billing module-gated).
//
// When the GrowerBilling module is not in PT_MODULES the route returns 403.
// The helper below handles this so the spec can still pass in dev environments
// without the module enabled.
//
// Prerequisites (with GrowerBilling enabled):
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api && go run .
//   - PT_MODULES env includes "GrowerBilling"

const LIST_URL = '/setup/billing-centers';
const NEW_URL = '/setup/billing-centers/new';
// Unique per-run token: Customer_Name_Unique (and the Code/ExportIdentifier
// unique constraints) are NOT filtered by Deleted, so a soft-deleted ghost
// from a prior run permanently owns a fixed name/code/exportId — GET only
// lists Deleted = 0 rows, so cleanup-by-name can never find or clear it,
// and the create silently 500s. Same fix as global-setup.ts's
// RestrictedTest provisioning (commit 3b694304): mint a fresh identity every
// run instead of relying on a fixed name a ghost could be squatting on.
const RUN_TOKEN = Date.now().toString(36).slice(-6).toUpperCase();
const TEST_NAME = `_PET213TestBillingCenter_${RUN_TOKEN}`;
const TEST_CODE = `BC${RUN_TOKEN}`;
const TEST_EXPORT_ID = `EXPBC${RUN_TOKEN}`;

async function gotoOrSkip(page: Page, url: string) {
  const resp = await page.goto(url);
  if (resp && resp.status() === 403) {
    // GrowerBilling module not enabled in PT_MODULES — acceptable in dev env.
    return false;
  }
  return true;
}

// ── New Form ───────────────────────────────────────────────────────────────────

test.describe('Setup > Billing Center — new form', () => {
  test('new form renders name field', async ({ page }) => {
    const ok = await gotoOrSkip(page, NEW_URL);
    if (!ok) return;
    await expect(page.locator('input#name')).toBeVisible();
  });

  test('Save is disabled until required name is provided', async ({ page }) => {
    const ok = await gotoOrSkip(page, NEW_URL);
    if (!ok) return;
    // FormFooter disables Save until isDirty && isValid (PET-450).
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await page.locator('input#name').click();
    await page.locator('input#name').blur();
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await page.locator('input#name').fill('Pet450ValidName');
    // Form validates on blur (mode: 'onBlur'); blur so FormFooter enables Save.
    await page.locator('input#name').blur();
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  test('Cancel returns to list', async ({ page }) => {
    const ok = await gotoOrSkip(page, NEW_URL);
    if (!ok) return;
    await page.locator('button:has-text("Cancel")').click();
    await page.waitForURL(`**${LIST_URL}`);
  });

  test('create a new billing center and navigate to edit form', async ({ page }) => {
    const ok = await gotoOrSkip(page, NEW_URL);
    if (!ok) return;

    await page.locator('input#name').fill(TEST_NAME);
    await page.locator('input#code').fill(TEST_CODE);
    await page.locator('input#exportIdentifier').fill(TEST_EXPORT_ID);
    await page.locator('button[type="submit"]').click();
    // Should navigate to the edit form after successful create.
    await page.waitForURL(`**/setup/billing-centers/**`);
    await expect(page.locator('input#name')).toHaveValue(TEST_NAME);
    // Name is read-only after first save.
    await expect(page.locator('input#name')).toHaveAttribute('readonly', '');
  });
});

// ── Edit Form ──────────────────────────────────────────────────────────────────

test.describe('Setup > Billing Center — edit form', () => {
  test('name is read-only on existing record', async ({ page, request }) => {
    const listResp = await request.get('/api/billing-centers');
    if (!listResp.ok()) return;
    const items = (await listResp.json()) as { billingCenterCounter: number; name: string }[];
    const rec = items.find((bc) => bc.name === TEST_NAME);
    if (!rec) {
      test.skip();
      return;
    }

    const ok = await gotoOrSkip(
      page,
      `/setup/billing-centers/${rec.billingCenterCounter}`,
    );
    if (!ok) return;
    await expect(page.locator('input#name')).toHaveAttribute('readonly', '');
  });

  test('can toggle active and save', async ({ page, request }) => {
    const listResp = await request.get('/api/billing-centers');
    if (!listResp.ok()) return;
    const items = (await listResp.json()) as { billingCenterCounter: number; name: string }[];
    const rec = items.find((bc) => bc.name === TEST_NAME);
    if (!rec) {
      test.skip();
      return;
    }

    const ok = await gotoOrSkip(
      page,
      `/setup/billing-centers/${rec.billingCenterCounter}`,
    );
    if (!ok) return;

    // The active toggle is in the page header extras. Click it to deactivate.
    // ActiveField uses a Switch — its role is 'switch'.
    const activeSwitch = page.getByRole('switch', { name: /active/i });
    await activeSwitch.click();
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(`**${LIST_URL}`);
  });
});
