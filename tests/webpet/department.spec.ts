/**
 * Department form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when DepartmentListPage migrated to the new
 * DataGrid lib (PET-424). Form pages were not touched by that migration,
 * so the form tests below remain valid against the existing DOM.
 *
 * DelLlano migration (WEBPET-831): the "ADP 5" fixture is resolved by NAME —
 * DelLlano identity ids differ from the legacy PetData ids this spec was first
 * authored against, so we never hardcode a DepartmentCounter. Field selectors
 * were updated for the shared components (ActiveField Switch / shadcn Select /
 * Checkbox), and the onBlur-validation + dirty-Cancel (UnsavedChangesModal)
 * patterns mirror employee.spec.ts. Seed: apps/web/e2e/seed/delllano-e2e-seed.sql.
 */
import { test, expect } from './fixtures'
import { ensureDepartment, deleteDepartment, type EnsuredDepartment } from './data-factory'

// This file creates its own Department via the API (cloned from an existing
// record so the ~10 create-time validators are satisfied by construction)
// instead of depending on a seeded "ADP 5". Assert against the returned values.
// See data-factory.ts.
let dept: EnsuredDepartment

test.beforeAll(async ({ request }) => {
  dept = await ensureDepartment(request)
})

test.afterAll(async ({ request }) => {
  if (dept) await deleteDepartment(request, dept.id)
})

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .

// ── New Department Form ────────────────────────────────────────────────────────

test.describe('New department form', () => {

  test('renders expected fields', async ({ page }) => {
    await page.goto('/setup/departments/new')
    await expect(page.locator('input#name')).toBeVisible()
    await expect(page.locator('input#exportIdentifier')).toBeVisible()
    // Active/firstDayofWeek/crewRequired migrated off native <select>:
    //   active        → ActiveField Switch (role=switch, rendered in page header)
    //   firstDayofWeek → shadcn Select (SelectTrigger, role=combobox button)
    //   crewRequired   → shadcn Checkbox (role=checkbox button)
    await expect(page.locator('#active')).toBeVisible()
    await expect(page.locator('#firstDayofWeek')).toBeVisible()
    await expect(page.locator('#crewRequired')).toBeVisible()
  })

  test('Save is disabled until required name is provided', async ({ page }) => {
    await page.goto('/setup/departments/new')
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
    await page.goto('/setup/departments/new')
    await page.locator('input#name').fill('TestDept')
    await page.locator('input#name').blur()
    await expect(page.locator('input#exportIdentifier')).toHaveValue('TestDept')
  })

  test('Cancel returns to list without saving', async ({ page }) => {
    await page.goto('/setup/departments/new')
    await page.locator('input#name').fill('ShouldNotBeSaved')
    // Once the form is dirty, FormFooter relabels the footer's "Cancel" button
    // to "Discard changes"; clicking it triggers the UnsavedChangesModal
    // navigation guard, and "Don't Save" abandons edits and proceeds to the list.
    await page.locator('button:has-text("Discard changes")').click()
    await page.getByRole('button', { name: "Don't Save" }).click()
    await page.waitForURL('**/setup/departments')
    // List page is now DataGrid (role=grid); no <td> elements.
    await expect(page.locator('[role="grid"]')).toBeVisible()
    await expect(page.getByText('ShouldNotBeSaved')).not.toBeVisible()
  })

  test('duplicate name stays on create form', async ({ page }) => {
    // Our factory department already exists; error shown inline.
    await page.goto('/setup/departments/new')
    page.on('dialog', (d) => d.dismiss())
    await page.locator('input#name').fill(dept.name)
    // Blur so the form validates (mode: 'onBlur') and the submit button enables.
    await page.locator('input#name').blur()
    await page.locator('button[type="submit"]').click()
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 10000 })
    await expect(page).toHaveURL(/\/setup\/departments\/new/)
  })

})

// ── Edit Department Form ───────────────────────────────────────────────────────

test.describe('Edit department form', () => {

  test('loads existing department data', async ({ page }) => {
    await page.goto(`/setup/departments/${String(dept.id)}`)
    await expect(page.locator('input#name')).toHaveValue(dept.name)
    await expect(page.locator('input#code')).toHaveValue(dept.code)
  })

  test('name, barcode and export identifier are read-only', async ({ page }) => {
    await page.goto(`/setup/departments/${String(dept.id)}`)
    await page.waitForSelector('input#name')
    await expect(page.locator('input#name')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#code')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#exportIdentifier')).toHaveAttribute('readonly', '')
  })

  test('firstDayofWeek and crewRequired dropdowns are editable', async ({ page }) => {
    await page.goto(`/setup/departments/${String(dept.id)}`)
    // firstDayofWeek → SelectTrigger button, crewRequired → Checkbox button
    // (migrated off native <select>). Both enabled on the edit form.
    await page.waitForSelector('#firstDayofWeek')
    await expect(page.locator('#firstDayofWeek')).not.toBeDisabled()
    await expect(page.locator('#crewRequired')).not.toBeDisabled()
  })

  test('Cancel returns to list', async ({ page }) => {
    await page.goto(`/setup/departments/${String(dept.id)}`)
    // Form is pristine on load (not dirty), so Cancel navigates straight to the
    // list without the UnsavedChangesModal guard.
    await page.locator('button:has-text("Cancel")').click()
    await page.waitForURL('**/setup/departments')
  })

  test('nonexistent id shows error message', async ({ page }) => {
    await page.goto('/setup/departments/999999')
    await expect(page.locator('text=Department not found.')).toBeVisible()
  })

})
