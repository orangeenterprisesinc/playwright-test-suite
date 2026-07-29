/**
 * Crew form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when CrewListPage migrated to the new
 * DataGrid lib (PET-424). Form pages were not touched by that migration,
 * so the form tests below remain valid against the existing DOM.
 */
import { test, expect } from './fixtures'
import { comboboxInput, openCombobox } from './parent-picker-helpers'
import {
  ensureCrew,
  deleteCrew,
  ensureDepartment,
  deleteDepartment,
  type EnsuredCrew,
  type EnsuredDepartment,
} from './data-factory'

// This file owns its own Crew AND its own Department, created fresh via the API
// (no dependency on a shared, hardcoded "Crew 01" / id=1 or a seeded "ADP 5"
// department). Assert against `crew.*` / `dept.*`, never a literal — that is
// what makes the file safe to run alongside others in parallel: no two files
// touch the same row. See data-factory.ts.
let crew: EnsuredCrew
let dept: EnsuredDepartment

test.beforeAll(async ({ request }) => {
  crew = await ensureCrew(request)
  dept = await ensureDepartment(request)
})

test.afterAll(async ({ request }) => {
  if (crew) await deleteCrew(request, crew.id)
  if (dept) await deleteDepartment(request, dept.id)
})

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .

// ── New Crew Form ──────────────────────────────────────────────────────────────

test.describe('New crew form', () => {

  test('renders expected fields', async ({ page }) => {
    await page.goto('/setup/crews/new')
    await expect(page.locator('input#name')).toBeVisible()
    await expect(page.locator('input#exportIdentifier')).toBeVisible()
    // active migrated off native <select> → ActiveField Switch (#active).
    await expect(page.locator('#active')).toBeVisible()
    // Department is now a ParentPicker combobox.
    await expect(comboboxInput(page, 'Department')).toBeVisible()
  })

  test('department dropdown is populated from database', async ({ page }) => {
    await page.goto('/setup/crews/new')
    const input = comboboxInput(page, 'Department')
    await openCombobox(input)
    // Type this file's own department name to filter the (potentially long) list
    // to it, then assert it's present — proves the dropdown is DB-backed without
    // depending on a seeded "ADP 5" row.
    await input.fill(dept.name)
    await expect(page.locator('[data-slot="combobox-popup"]').getByText(dept.name)).toBeVisible()
  })

  test('Save is disabled until required name is provided', async ({ page }) => {
    await page.goto('/setup/crews/new')
    // FormFooter disables Save until isDirty && isValid (PET-450).
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await page.locator('input#name').click()
    await page.locator('input#name').blur()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await page.locator('input#name').fill('Pet450ValidName')
    // Form validates on blur (mode: 'onBlur'); blur so isValid recomputes and
    // FormFooter enables Save.
    await page.locator('input#name').blur()
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  test('export identifier auto-populates from name on blur', async ({ page }) => {
    await page.goto('/setup/crews/new')
    await page.locator('input#name').fill('TestCrew')
    await page.locator('input#name').blur()
    await expect(page.locator('input#exportIdentifier')).toHaveValue('TestCrew')
  })

  test('Cancel returns to list without saving', async ({ page }) => {
    await page.goto('/setup/crews/new')
    await page.locator('input#name').fill('ShouldNotBeSaved')
    // Once dirty, FormFooter relabels "Cancel" → "Discard changes"; clicking it
    // triggers the UnsavedChangesModal guard, and "Don't Save" abandons edits.
    await page.locator('button:has-text("Discard changes")').click()
    await page.getByRole('button', { name: "Don't Save" }).click()
    await page.waitForURL('**/setup/crews')
    // List page is now DataGrid (role=grid); no <td> elements.
    await expect(page.locator('[role="grid"]')).toBeVisible()
    await expect(page.getByText('ShouldNotBeSaved')).not.toBeVisible()
  })

})

// ── Edit Crew Form ─────────────────────────────────────────────────────────────

test.describe('Edit crew form', () => {

  test('loads existing crew data', async ({ page }) => {
    await page.goto(`/setup/crews/${String(crew.id)}`)
    await expect(page.locator('input#name')).toHaveValue(crew.name)
  })

  test('name, barcode and export identifier are read-only', async ({ page }) => {
    await page.goto(`/setup/crews/${String(crew.id)}`)
    await page.waitForSelector('input#name')
    await expect(page.locator('input#name')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#code')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#exportIdentifier')).toHaveAttribute('readonly', '')
  })

  test('shortName field is editable', async ({ page }) => {
    await page.goto(`/setup/crews/${String(crew.id)}`)
    await page.waitForSelector('input#shortName')
    await expect(page.locator('input#shortName')).not.toHaveAttribute('readonly', '')
  })

  test('department dropdown is populated', async ({ page }) => {
    await page.goto(`/setup/crews/${String(crew.id)}`)
    const input = comboboxInput(page, 'Department')
    await openCombobox(input)
    // The Department combobox lists every department in the DB, independent of
    // this crew. Filter to this file's own department to prove the list is
    // DB-backed without depending on a seeded "ADP 5" row.
    await input.fill(dept.name)
    await expect(page.locator('[data-slot="combobox-popup"]').getByText(dept.name)).toBeVisible()
  })

  test('Cancel returns to list', async ({ page }) => {
    await page.goto(`/setup/crews/${String(crew.id)}`)
    await page.locator('button:has-text("Cancel")').click()
    await page.waitForURL('**/setup/crews')
  })

  test('nonexistent id shows error message', async ({ page }) => {
    await page.goto('/setup/crews/999999')
    await expect(page.locator('text=Crew not found.')).toBeVisible()
  })

})
