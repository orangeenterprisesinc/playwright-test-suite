/**
 * Job Group form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when JobGroupListPage migrated to the new
 * DataGrid lib (PET-424). Form pages were not touched by that migration,
 * so the form tests below remain valid against the existing DOM.
 */
import { test, expect } from './fixtures'
import { ensureJobGroup, deleteJobGroup, type EnsuredJobGroup } from './data-factory'

// This file owns its own JobGroup, created fresh via the API (no dependency on
// a seeded "Hourly" row). Assert against `group.*`, never a literal — that is
// what makes the file safe to run alongside others in parallel. See
// data-factory.ts.
let group: EnsuredJobGroup

test.beforeAll(async ({ request }) => {
  group = await ensureJobGroup(request)
})

test.afterAll(async ({ request }) => {
  if (group) await deleteJobGroup(request, group.id)
})

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .
//
// Route: /setup/jobs/groups, /setup/jobs/groups/new, /setup/jobs/groups/:id
// Only "name" is read-only after save; exportIdentifier and code remain editable.

// ── New Job Group Form ─────────────────────────────────────────────────────────

test.describe('New job group form', () => {

  test('renders expected fields', async ({ page }) => {
    await page.goto('/setup/jobs/groups/new')
    await expect(page.locator('input#name')).toBeVisible()
    await expect(page.locator('input#exportIdentifier')).toBeVisible()
    await expect(page.locator('input#code')).toBeVisible()
    // active migrated off native <select> → ActiveField Switch (#active).
    await expect(page.locator('#active')).toBeVisible()
  })

  test('Save is disabled until required name is provided', async ({ page }) => {
    await page.goto('/setup/jobs/groups/new')
    // FormFooter disables Save until isDirty && isValid (PET-450).
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await page.locator('input#name').click()
    await page.locator('input#name').blur()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await page.locator('input#name').fill('Pet450ValidName')
    // Form validates on blur (mode: 'onBlur'); blur so FormFooter enables Save.
    await page.locator('input#name').blur()
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  test('export identifier auto-populates from name on blur', async ({ page }) => {
    await page.goto('/setup/jobs/groups/new')
    await page.locator('input#name').fill('TestGroup')
    await page.locator('input#name').blur()
    await expect(page.locator('input#exportIdentifier')).toHaveValue('TestGroup')
  })

  test('Cancel returns to list without saving', async ({ page }) => {
    await page.goto('/setup/jobs/groups/new')
    await page.locator('input#name').fill('ShouldNotBeSaved')
    // Once dirty, FormFooter relabels "Cancel" → "Discard changes"; clicking it
    // triggers the UnsavedChangesModal guard, and "Don't Save" abandons edits.
    await page.locator('button:has-text("Discard changes")').click()
    await page.getByRole('button', { name: "Don't Save" }).click()
    await page.waitForURL('**/setup/jobs/groups')
    // List page is now DataGrid (role=grid); no <td> elements.
    await expect(page.locator('[role="grid"]')).toBeVisible()
    await expect(page.getByText('ShouldNotBeSaved')).not.toBeVisible()
  })

  test('duplicate name stays on create form', async ({ page }) => {
    // This file's own job-group name triggers a server 409 on submit, keeping
    // us on the create form.
    await page.goto('/setup/jobs/groups/new')
    page.on('dialog', (d) => d.dismiss())
    await page.locator('input#name').fill(group.name)
    await page.locator('input#name').blur()
    await page.locator('button[type="submit"]').click()
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 10000 })
    await expect(page).toHaveURL(/\/setup\/jobs\/groups\/new/)
  })

})

// ── Edit Job Group Form ────────────────────────────────────────────────────────

test.describe('Edit job group form', () => {

  test('loads existing job group data', async ({ page }) => {
    await page.goto(`/setup/jobs/groups/${String(group.id)}`)
    await expect(page.locator('input#name')).toHaveValue(group.name)
    await expect(page.locator('input#code')).toHaveValue(group.code)
  })

  test('name is read-only; exportIdentifier and code are editable', async ({ page }) => {
    await page.goto(`/setup/jobs/groups/${String(group.id)}`)
    await page.waitForSelector('input#name')
    await expect(page.locator('input#name')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#exportIdentifier')).not.toHaveAttribute('readonly', '')
    await expect(page.locator('input#code')).not.toHaveAttribute('readonly', '')
  })

  test('Cancel returns to list', async ({ page }) => {
    await page.goto(`/setup/jobs/groups/${String(group.id)}`)
    await page.locator('button:has-text("Cancel")').click()
    await page.waitForURL('**/setup/jobs/groups')
  })

  test('nonexistent id shows error message', async ({ page }) => {
    await page.goto('/setup/jobs/groups/999999')
    await expect(page.locator('text=not found.')).toBeVisible()
  })

})
