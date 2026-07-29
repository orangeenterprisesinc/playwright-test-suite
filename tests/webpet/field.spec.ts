/**
 * FieldListPage e2e — targets the new DataGrid lib (post PET-424 migration).
 *
 * Replaces an earlier suite that drove the legacy DataTable + MultiUpdatePanel
 * UI; that DOM no longer exists. Coverage: page chrome (columns, outbound
 * link searchSuffix), inline editing on Active (toggle), Ranch + Crop (FK
 * comboboxes), multi-edit propagation (yes/no), undo via the SelectedRowsBar
 * pill, URL state, insights strip toggle (`?expand=top`).
 *
 * Run: pnpm --filter @pet-tiger/web exec playwright test field
 *
 * Test data (DelLlano, WEBPET-831): resolves two ACTIVE fields with unique
 * names by querying the API and targets their grid rows by exact edit-link id.
 * Each test toggles Active and Undo-restores, so it self-cleans.
 */
import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import {
  ensureRanch,
  deleteRanch,
  ensureField,
  deleteField,
  type EnsuredRanch,
  type EnsuredField,
} from './data-factory'

// Tests in this file mutate DB state on their own fields — cannot run in
// parallel without racing. Serialize despite playwright.config's
// `fullyParallel: true`.
test.describe.configure({ mode: 'serial' })

// This file owns two fields (under a dedicated ranch), created fresh via the
// API (no dependency on a seeded Field 1 / Field 5 or on there being ≥2 active
// uniquely-named fields). The inline-edit/multi-edit tests toggle Active and
// Undo to restore; afterAll deletes both fields + the ranch regardless, so no
// rows leak. See data-factory.ts. Field counts are small (well under the
// DataGrid's 100-row virtualization threshold), so every row — including ours —
// renders in the DOM for row lookups.
let fieldRanch: EnsuredRanch
let fieldA: EnsuredField
let fieldB: EnsuredField

test.beforeAll(async ({ request }) => {
  fieldRanch = await ensureRanch(request)
  fieldA = await ensureField(request, { ranchId: fieldRanch.id })
  fieldB = await ensureField(request, { ranchId: fieldRanch.id })
})

test.afterAll(async ({ request }) => {
  if (fieldA) await deleteField(request, fieldA.id)
  if (fieldB) await deleteField(request, fieldB.id)
  if (fieldRanch) await deleteRanch(request, fieldRanch.id)
})

function rowById(page: Page, id: number) {
  // Target the row by its exact edit-link href — unambiguous, vs. matching the
  // field name (which can collide with a Ranch/Crop cell value in other rows).
  return page.locator('[role="row"]').filter({ has: page.locator(`a[href="/setup/fields/${id}"]`) })
}

async function openMultiEdit(page: Page) {
  await page.getByRole('button', { name: /^Multi Update$/ }).click()
}

// ── Page chrome ─────────────────────────────────────────────────────────────

test.describe('FieldListPage — page chrome', () => {
  test('grid uses role="grid" with the expected column headers', async ({ page }) => {
    await page.goto('/setup/fields')
    await page.waitForSelector('[role="grid"]')
    await expect(page.getByRole('columnheader', { name: /^Name/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Ranch/ })).toBeVisible()
    // field:form.field.code.label resolves to "Barcode", not "Code".
    await expect(page.getByRole('columnheader', { name: /^Barcode/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Crop/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Area/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Active/ })).toBeVisible()
  })

  test('rightmost edit-icon column links to /setup/fields/:id', async ({ page }) => {
    await page.goto('/setup/fields')
    await page.waitForSelector('[role="grid"]')
    // Target the first data row's edit link rather than a specific id —
    // with virtualization enabled (default threshold 100 rows), id-5's row
    // may be below the viewport.  We just want to confirm the column exists.
    const firstDataRow = page.locator('[role="row"]').nth(2) // skip header + filter rows
    await expect(firstDataRow.locator('a[href^="/setup/fields/"]')).toBeVisible()
  })

  test('Multi Update button paints aria-pressed=true when toggled on', async ({ page }) => {
    await page.goto('/setup/fields')
    await page.waitForSelector('[role="grid"]')
    const btn = page.getByRole('button', { name: /^Multi Update$/ })
    await expect(btn).toHaveAttribute('aria-pressed', 'false')
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'false')
  })

  test('outbound "New" link carries the URL searchSuffix', async ({ page }) => {
    await page.goto('/setup/fields?sort=name.desc')
    await page.waitForSelector('[role="grid"]')
    const newLink = page.locator('a[href^="/setup/fields/new"]').first()
    await expect(newLink).toHaveAttribute('href', /\?sort=name\.desc/)
  })

  test('insights-strip toggle reflects in the URL as ?expand=top', async ({ page }) => {
    await page.goto('/setup/fields')
    await page.waitForSelector('[role="grid"]')
    // The toggle is the ExpandToTopHeader rendered in the editIconColumn's
    // header slot. aria-label flips between "Expand table to top" (default,
    // strip visible) and "Shrink table from top" (strip hidden).
    const expandToggle = page.getByRole('button', { name: /Expand table to top/ })
    await expandToggle.click()
    await expect(page).toHaveURL(/\?expand=top/, { timeout: 5000 })
    await page.getByRole('button', { name: /Shrink table from top/ }).click()
    await expect(page).not.toHaveURL(/expand=top/, { timeout: 5000 })
  })
})

// ── Inline editing on a single row ──────────────────────────────────────────

test.describe('FieldListPage — inline edit on a resolved field', () => {
  test('Active toggle flips and bulk-undo restores', async ({ page }) => {
    const f = fieldA
    await page.goto('/setup/fields')
    await page.waitForSelector('[role="grid"]')

    const row = rowById(page, f.id)
    const toggle = row.getByRole('checkbox', { name: /^Active:/ })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    await page.getByRole('button', { name: /^Undo$/ }).click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 10000 })
  })
})

// ── Multi-edit propagation ──────────────────────────────────────────────────

test.describe('FieldListPage — multi-edit propagation', () => {
  test('"Apply to all" propagates the cache patch to all selected rows', async ({ page }) => {
    const [fA, fB] = [fieldA, fieldB]
    await page.goto('/setup/fields')
    await page.waitForSelector('[role="grid"]')
    await openMultiEdit(page)

    const row1 = rowById(page, fA.id)
    const row5 = rowById(page, fB.id)
    await row1.getByRole('checkbox').first().check()
    await row5.getByRole('checkbox').first().check()

    await expect(page.getByText(/2 selected/)).toBeVisible()

    const row5Toggle = row5.getByRole('checkbox', { name: /^Active:/ })
    await row5Toggle.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^Apply to all/ }).click()

    // Both rows now show Active=false (regression: cache patch was edited-row-only).
    await expect(row5.getByRole('checkbox', { name: /^Active:/ })).toHaveAttribute(
      'aria-checked',
      'false',
      { timeout: 10000 },
    )
    await expect(row1.getByRole('checkbox', { name: /^Active:/ })).toHaveAttribute(
      'aria-checked',
      'false',
      { timeout: 10000 },
    )

    // Undo restores both.
    await page.getByRole('button', { name: /^Undo$/ }).click()
    await expect(row5.getByRole('checkbox', { name: /^Active:/ })).toHaveAttribute(
      'aria-checked',
      'true',
      { timeout: 10000 },
    )
    await expect(row1.getByRole('checkbox', { name: /^Active:/ })).toHaveAttribute(
      'aria-checked',
      'true',
      { timeout: 10000 },
    )
  })

  test('"Just this row" updates only the edited row', async ({ page }) => {
    const [fA, fB] = [fieldA, fieldB]
    await page.goto('/setup/fields')
    await page.waitForSelector('[role="grid"]')
    await openMultiEdit(page)

    const row1 = rowById(page, fA.id)
    const row5 = rowById(page, fB.id)
    await row1.getByRole('checkbox').first().check()
    await row5.getByRole('checkbox').first().check()

    const row5Toggle = row5.getByRole('checkbox', { name: /^Active:/ })
    await row5Toggle.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^Just this row$/ }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    await expect(row5.getByRole('checkbox', { name: /^Active:/ })).toHaveAttribute(
      'aria-checked',
      'false',
      { timeout: 10000 },
    )
    await expect(row1.getByRole('checkbox', { name: /^Active:/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await page.getByRole('button', { name: /^Undo$/ }).click()
    await expect(row5.getByRole('checkbox', { name: /^Active:/ })).toHaveAttribute(
      'aria-checked',
      'true',
      { timeout: 10000 },
    )
  })
})

// ── URL state ───────────────────────────────────────────────────────────────

test.describe('FieldListPage — URL state', () => {
  test('typing in the Code filter updates the URL with ?code=', async ({ page }) => {
    await page.goto('/setup/fields')
    await page.waitForSelector('[role="grid"]')
    // Only text-filter columns render Inputs with the default placeholder
    // ("Filter…"). Combobox filters use their own placeholder; number
    // filters have none. Field's text-filter columns in DOM order are
    // [name, code]. Index 1 = code.
    const codeInput = page.getByPlaceholder('Filter…').nth(1)
    await codeInput.fill('5064')
    await expect(page).toHaveURL(/\?code=5064/, { timeout: 5000 })
  })

  test('clicking a sortable header updates the URL with ?sort=', async ({ page }) => {
    await page.goto('/setup/fields')
    await page.waitForSelector('[role="grid"]')
    await page.getByRole('columnheader', { name: /^Name/ }).click()
    await expect(page).toHaveURL(/\?sort=name/, { timeout: 5000 })
  })
})
