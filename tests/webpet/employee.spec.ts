/**
 * Employee form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when EmployeeListPage migrated to the new
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
  ensureEmployee,
  deleteEmployee,
  type EnsuredCrew,
  type EnsuredDepartment,
  type EnsuredEmployee,
} from './data-factory'

// This file creates its own Department + Crew + Employee via the API instead of
// depending on shared hardcoded rows ("Locker, Mather" id=5, "ADP 5", "Crew 01")
// that don't reliably exist in every client DB and collide across parallel
// workers. Assert against the returned values (emp.*, dept.*, crew.*), never a
// literal. See data-factory.ts.
let dept: EnsuredDepartment
let crew: EnsuredCrew
let emp: EnsuredEmployee

test.beforeAll(async ({ request }) => {
  dept = await ensureDepartment(request)
  crew = await ensureCrew(request)
  emp = await ensureEmployee(request, { department: { id: dept.id, name: dept.name } })
})

test.afterAll(async ({ request }) => {
  // Delete the employee first — it FK-references the crew/department.
  if (emp) await deleteEmployee(request, emp.id)
  if (crew) await deleteCrew(request, crew.id)
  if (dept) await deleteDepartment(request, dept.id)
})

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .
//
// Field labels use aliases from the Preferences table.
// These tests assume defaults: Employee = "Employee".

// ── New Employee Form ──────────────────────────────────────────────────────────

test.describe('New employee form', () => {

  test('renders all expected fields', async ({ page }) => {
    await page.goto('/setup/employees/new')
    await expect(page.locator('input#name')).toBeVisible()
    await expect(page.locator('input#code')).toBeVisible()
    await expect(page.locator('input#exportIdentifier')).toBeVisible()
    await expect(page.locator('input#firstName')).toBeVisible()
    await expect(page.locator('input#lastName')).toBeVisible()
    // Department and Crew are now ParentPicker comboboxes.
    await expect(comboboxInput(page, 'Department')).toBeVisible()
    await expect(comboboxInput(page, 'Crew')).toBeVisible()
    await expect(page.locator('input#active')).toBeVisible()
  })

  test('department dropdown is populated from database', async ({ page }) => {
    await page.goto('/setup/employees/new')
    const input = comboboxInput(page, 'Department')
    await openCombobox(input)
    // Assert our own department shows up — proves the dropdown is DB-populated
    // without depending on a specific seeded name.
    await expect(page.locator('[data-slot="combobox-popup"]').getByText(dept.name)).toBeVisible()
  })

  test('crew dropdown is populated from database', async ({ page }) => {
    await page.goto('/setup/employees/new')
    const input = comboboxInput(page, 'Crew')
    await openCombobox(input)
    await expect(page.locator('[data-slot="combobox-popup"]').getByText(crew.name)).toBeVisible()
  })

  test('Save is disabled until required name is provided', async ({ page }) => {
    await page.goto('/setup/employees/new')
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

  test('export identifier stays empty after name blur (GAP-016 fix)', async ({ page }) => {
    // Legacy EmployeeForm.cs does NOT auto-fill ExportIdentifier from Name.
    // The web divergence (handleNameBlur) was removed in PET-581.
    await page.goto('/setup/employees/new')
    await page.locator('input#name').fill('TestEmp')
    await page.locator('input#name').blur()
    await expect(page.locator('input#exportIdentifier')).toHaveValue('')
  })

  test('manually filled export identifier is not overwritten', async ({ page }) => {
    // Guard against a future regression that re-introduces the auto-fill:
    // a manually entered ExportIdentifier must never be clobbered by name blur.
    await page.goto('/setup/employees/new')
    await page.locator('input#exportIdentifier').fill('ManualId')
    await page.locator('input#name').fill('TestEmp')
    await page.locator('input#name').blur()
    await expect(page.locator('input#exportIdentifier')).toHaveValue('ManualId')
  })

  test('Cancel returns to list without saving', async ({ page }) => {
    await page.goto('/setup/employees/new')
    await page.locator('input#name').fill('ShouldNotBeSaved')
    // Once the form is dirty the footer's cancel button relabels to "Discard
    // changes"; clicking it triggers the UnsavedChangesModal navigation guard,
    // and "Don't Save" abandons edits and proceeds to the list.
    await page.locator('button:has-text("Discard changes")').click()
    await page.getByRole('button', { name: "Don't Save" }).click()
    await page.waitForURL('**/setup/employees')
    // List page is now DataGrid (role=grid); no <td> elements.
    await expect(page.locator('[role="grid"]')).toBeVisible()
    await expect(page.getByText('ShouldNotBeSaved')).not.toBeVisible()
  })

  test('duplicate name shows conflict error', async ({ page }) => {
    // Our factory employee already exists; API errors surface via alert() — auto-dismiss it.
    await page.goto('/setup/employees/new')
    page.on('dialog', (dialog) => dialog.dismiss())
    await page.locator('input#name').fill(emp.name)
    // Blur so the form validates (mode: 'onBlur') and the submit button enables.
    await page.locator('input#name').blur()
    await page.locator('button[type="submit"]').click()
    // Wait for Save button to re-enable (isSubmitting → false), meaning mutation settled.
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 10000 })
    // A 409 conflict means we stay on the create form, not navigate to the edit form.
    await expect(page).toHaveURL(/\/setup\/employees\/new/)
  })

})

// ── Edit Employee Form ─────────────────────────────────────────────────────────

test.describe('Edit employee form', () => {

  test('loads existing employee data correctly', async ({ page }) => {
    await page.goto(`/setup/employees/${String(emp.id)}`)
    await expect(page.locator('input#name')).toHaveValue(emp.name)
    await expect(page.locator('input#firstName')).toHaveValue(emp.firstName)
    await expect(page.locator('input#lastName')).toHaveValue(emp.lastName)
  })

  test('name, barcode and export identifier are read-only', async ({ page }) => {
    await page.goto(`/setup/employees/${String(emp.id)}`)
    await page.waitForSelector('input#name')
    await expect(page.locator('input#name')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#code')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#exportIdentifier')).toHaveAttribute('readonly', '')
  })

  test('first name, last name fields are editable', async ({ page }) => {
    await page.goto(`/setup/employees/${String(emp.id)}`)
    await page.waitForSelector('input#firstName')
    await expect(page.locator('input#firstName')).not.toHaveAttribute('readonly', '')
    await expect(page.locator('input#lastName')).not.toHaveAttribute('readonly', '')
  })

  test('department dropdown is populated and shows current value', async ({ page }) => {
    await page.goto(`/setup/employees/${String(emp.id)}`)
    // Our employee was created in `dept`; the combobox reflects its label.
    await expect(comboboxInput(page, 'Department')).toHaveValue(emp.departmentName ?? dept.name)
  })

  test('Cancel returns to list', async ({ page }) => {
    await page.goto(`/setup/employees/${String(emp.id)}`)
    await page.waitForSelector('button:has-text("Cancel")')
    await page.locator('button:has-text("Cancel")').click()
    await page.waitForURL('**/setup/employees')
  })

  test('nonexistent id shows error message', async ({ page }) => {
    await page.goto('/setup/employees/999999')
    await expect(page.locator('text=Failed to load employee.')).toBeVisible()
  })

})
