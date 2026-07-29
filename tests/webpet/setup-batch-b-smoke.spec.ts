/**
 * Batch B smoke test for the PET-424 setup-core list page migrations.
 *
 * Covers 3 representative shapes:
 *   - Crop: print-mechanical with alias (proxy for Department)
 *   - Crew: FK-mechanical + print + alias (proxy for Customer/Equipment)
 *   - Employee: dual-FK (proxy for any multi-FK page)
 *
 * Coverage is page-chrome only — full inline-edit / propagate / undo
 * flows are exercised exhaustively by ranch.spec.ts and field.spec.ts.
 *
 * Run: pnpm --filter @pet-tiger/web exec playwright test setup-batch-b-smoke
 */
import { test, expect } from './fixtures'

test.describe.configure({ mode: 'serial' })

// ── Crop ───────────────────────────────────────────────────────────────────

test.describe('CropListPage smoke', () => {
  test('renders grid + Multi Update toggle + Report button', async ({ page }) => {
    await page.goto('/setup/crops')
    await page.waitForSelector('[role="grid"]')
    await expect(page.getByRole('columnheader', { name: /^Name/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Active/ })).toBeVisible()
    // The list-header print button is labelled "Report" (i18n common.reportLabel);
    // it was renamed from "Print Report" since this smoke test was written.
    await expect(page.getByRole('button', { name: /^Report$/ })).toBeVisible()

    const multiBtn = page.getByRole('button', { name: /^Multi Update$/ })
    await expect(multiBtn).toHaveAttribute('aria-pressed', 'false')
    await multiBtn.click()
    await expect(multiBtn).toHaveAttribute('aria-pressed', 'true')
  })

  test('outbound "New Crop" link carries the URL searchSuffix', async ({ page }) => {
    await page.goto('/setup/crops?sort=name.desc')
    await page.waitForSelector('[role="grid"]')
    const newLink = page.locator('a[href^="/setup/crops/new"]').first()
    await expect(newLink).toHaveAttribute('href', /\?sort=name\.desc/)
  })
})

// ── Crew ───────────────────────────────────────────────────────────────────

test.describe('CrewListPage smoke', () => {
  test('renders grid with Department FK column', async ({ page }) => {
    await page.goto('/setup/crews')
    await page.waitForSelector('[role="grid"]')
    await expect(page.getByRole('columnheader', { name: /^Name/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /Department/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Active/ })).toBeVisible()
  })

  test('Multi Update toggle paints aria-pressed', async ({ page }) => {
    await page.goto('/setup/crews')
    await page.waitForSelector('[role="grid"]')
    const btn = page.getByRole('button', { name: /^Multi Update$/ })
    await expect(btn).toHaveAttribute('aria-pressed', 'false')
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
  })
})

// ── Employee ────────────────────────────────────────────────────────────────

test.describe('EmployeeListPage smoke', () => {
  test('renders grid with both Department and Crew FK columns', async ({ page }) => {
    await page.goto('/setup/employees')
    await page.waitForSelector('[role="grid"]')
    await expect(page.getByRole('columnheader', { name: /^Name/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /Department/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /Crew/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Active/ })).toBeVisible()
  })
})
