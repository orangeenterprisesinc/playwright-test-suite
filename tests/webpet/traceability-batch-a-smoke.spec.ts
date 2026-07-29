/**
 * Batch A smoke test for the PET-424 traceability list page migrations.
 *
 * Covers 3 representative shapes:
 *   - Grade: simple TraceLookupItem (proxy for Method/PackagingStyle/Pool/
 *     Region/Storage/Warehouse — all 6 sibling clones share the structure)
 *   - Variety: FK column (Crop) + print/export wiring + alias-aware page
 *   - Size: extra bulkItem + read-only quantity/unit columns
 *
 * Coverage is page-chrome + a single interaction (Multi Update toggle's
 * `aria-pressed` flip) since the inline-edit / propagate / undo flows are
 * exercised exhaustively by ranch.spec.ts and field.spec.ts.
 *
 * Run: pnpm --filter @pet-tiger/web exec playwright test traceability-batch-a-smoke
 */
import { test, expect } from './fixtures'

test.describe.configure({ mode: 'serial' })

// ── Grade ──────────────────────────────────────────────────────────────────

test.describe('GradeListPage smoke', () => {
  test('renders grid + Multi Update button toggles aria-pressed', async ({ page }) => {
    await page.goto('/setup/traceability/grades')
    await page.waitForSelector('[role="grid"]')
    await expect(page.getByRole('columnheader', { name: /^Name/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Export Identifier/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Active/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Barcode/ })).toBeVisible()

    const btn = page.getByRole('button', { name: /^Multi Update$/ })
    await expect(btn).toHaveAttribute('aria-pressed', 'false')
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  test('outbound "New Grade" link carries the URL searchSuffix', async ({ page }) => {
    await page.goto('/setup/traceability/grades?sort=name.desc')
    await page.waitForSelector('[role="grid"]')
    const newLink = page.locator('a[href^="/setup/traceability/grades/new"]').first()
    await expect(newLink).toHaveAttribute('href', /\?sort=name\.desc/)
  })
})

// ── Variety ────────────────────────────────────────────────────────────────

test.describe('VarietyListPage smoke', () => {
  test('renders grid with the Crop FK column + name read-only column', async ({ page }) => {
    await page.goto('/setup/varieties')
    await page.waitForSelector('[role="grid"]')
    // Crop is the alias-driven label — default alias resolves to "Crop".
    await expect(page.getByRole('columnheader', { name: /^Crop/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Name/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Barcode/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Export Identifier/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Active/ })).toBeVisible()
  })

  test('Report button is visible (alias-aware page header)', async ({ page }) => {
    await page.goto('/setup/varieties')
    await page.waitForSelector('[role="grid"]')
    // Renamed from "Print Report" to "Report" (i18n common.reportLabel).
    await expect(page.getByRole('button', { name: /^Report$/ })).toBeVisible()
  })
})

// ── Size ───────────────────────────────────────────────────────────────────

test.describe('SizeListPage smoke', () => {
  test('renders grid with active + bulkItem toggle columns', async ({ page }) => {
    await page.goto('/setup/traceability/sizes')
    await page.waitForSelector('[role="grid"]')
    await expect(page.getByRole('columnheader', { name: /^Name/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Export Identifier/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Barcode/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Active/ })).toBeVisible()
    // bulkItem column is unique to Size — column header label should be visible.
    await expect(page.getByRole('columnheader', { name: /Bulk Item/ })).toBeVisible()
    // Read-only columns
    await expect(page.getByRole('columnheader', { name: /^Quantity/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Unit/ })).toBeVisible()
  })
})
