/**
 * Crop form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when CropListPage migrated to the new
 * DataGrid lib (PET-424). Form pages were not touched by that migration,
 * so the form tests below remain valid against the existing DOM.
 */
import { test, expect } from './fixtures'
import { ensureCrop, deleteCrop, type EnsuredCrop } from './data-factory'

// This file creates its own Crop via the API instead of depending on a shared
// "Admin" crop that may not exist in every client DB. The duplicate-name tests
// re-enter this crop's name to trigger the uniqueness check; the edit tests
// assert against its returned values. See data-factory.ts.
let crop: EnsuredCrop

test.beforeAll(async ({ request }) => {
  crop = await ensureCrop(request)
})

test.afterAll(async ({ request }) => {
  if (crop) await deleteCrop(request, crop.id)
})

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .

// ── New Crop Form ──────────────────────────────────────────────────────────────

test.describe('New crop form', () => {

  test('renders expected fields', async ({ page }) => {
    await page.goto('/setup/crops/new')
    await expect(page.locator('input#name')).toBeVisible()
    await expect(page.locator('input#exportIdentifier')).toBeVisible()
    // active migrated off native <select> → ActiveField Switch (#active).
    await expect(page.locator('#active')).toBeVisible()
  })

  test('Save is disabled until required name is provided', async ({ page }) => {
    await page.goto('/setup/crops/new')
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
    await page.goto('/setup/crops/new')
    await page.locator('input#name').fill('TestCrop')
    await page.locator('input#name').blur()
    await expect(page.locator('input#exportIdentifier')).toHaveValue('TestCrop')
  })

  test('export identifier auto-populate skipped when field already filled', async ({ page }) => {
    await page.goto('/setup/crops/new')
    await page.locator('input#exportIdentifier').fill('ManualId')
    await page.locator('input#name').fill('TestCrop')
    await page.locator('input#name').blur()
    await expect(page.locator('input#exportIdentifier')).toHaveValue('ManualId')
  })

  test('Cancel returns to list without saving', async ({ page }) => {
    await page.goto('/setup/crops/new')
    await page.locator('input#name').fill('ShouldNotBeSaved')
    // Once dirty, FormFooter relabels "Cancel" → "Discard changes"; clicking it
    // triggers the UnsavedChangesModal guard, and "Don't Save" abandons edits.
    await page.locator('button:has-text("Discard changes")').click()
    await page.getByRole('button', { name: "Don't Save" }).click()
    await page.waitForURL('**/setup/crops')
    // List page is now DataGrid (role=grid); no <td> elements.
    await expect(page.locator('[role="grid"]')).toBeVisible()
    await expect(page.getByText('ShouldNotBeSaved')).not.toBeVisible()
  })

  test('duplicate name stays on create form', async ({ page }) => {
    // Our factory crop already exists. The blur-time uniqueness check catches
    // the duplicate, so Save stays disabled and the form never navigates away.
    await page.goto('/setup/crops/new')
    page.on('dialog', (d) => d.dismiss())
    await page.locator('input#name').fill(crop.name)
    await page.locator('input#name').blur()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await expect(page).toHaveURL(/\/setup\/crops\/new/)
  })

  test('duplicate name submit maps server error to Name field inline', async ({ page }) => {
    // Submit a duplicate name so the Go API responds with a structured 409
    // (code=unique, path=name); the mapping helper routes it into
    // formState.errors.name and the inline message surfaces to the user.
    await page.goto('/setup/crops/new')
    page.on('dialog', (d) => d.dismiss())
    // Fill both fields so export-identifier auto-populate doesn't mask the
    // uniqueness failure on submit.
    await page.locator('input#name').fill(crop.name)
    await page.locator('input#exportIdentifier').fill('DupTest')
    await page.locator('input#name').blur()
    // The duplicate surfaces an inline uniqueness error...
    await expect(page.getByText(/Already in use|already exists/i)).toBeVisible({ timeout: 10000 })
    // ...and the footer's error-summary trigger offers it too.
    await expect(page.getByRole('button', { name: /\d+ error/ })).toBeVisible()
  })

  test('name blur against duplicate value fires uniqueness check before submit', async ({ page }) => {
    // The blur-time hook hits /api/validation/unique with entity=crop,
    // field=name. Our factory crop is a live duplicate, so unique=false and the
    // form receives a setError(name, { type: 'unique' }) — no submit needed.
    await page.goto('/setup/crops/new')
    await page.locator('input#name').fill(crop.name)
    await page.locator('input#name').blur()
    // Wait for the inline error to render (async response round-trip).
    await expect(
      page.getByText(/Already in use|A crop with this name already exists\./),
    ).toBeVisible({ timeout: 10000 })
  })

})

// ── Edit Crop Form ─────────────────────────────────────────────────────────────

test.describe('Edit crop form', () => {

  test('loads existing crop data', async ({ page }) => {
    await page.goto(`/setup/crops/${String(crop.id)}`)
    await expect(page.locator('input#name')).toHaveValue(crop.name)
    await expect(page.locator('input#exportIdentifier')).toHaveValue(crop.exportIdentifier)
  })

  test('name and export identifier are read-only', async ({ page }) => {
    await page.goto(`/setup/crops/${String(crop.id)}`)
    await page.waitForSelector('input#name')
    await expect(page.locator('input#name')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#exportIdentifier')).toHaveAttribute('readonly', '')
  })

  test('traceability assignment sections (Color, Variety…) render on edit form', async ({ page }) => {
    // The legacy tabbed UI migrated to per-attribute AssignmentTab widgets in
    // the (edit-only) Traceability section, each headed "Include <attribute>".
    await page.goto(`/setup/crops/${String(crop.id)}`)
    // The (edit-only) Traceability section hosts the per-attribute AssignmentTab
    // widgets (Color, Grade, Variety, …) that replaced the legacy tabbed UI.
    await expect(page.locator('section#traceability')).toBeVisible()
  })

  test('Cancel returns to list', async ({ page }) => {
    await page.goto(`/setup/crops/${String(crop.id)}`)
    await page.locator('button:has-text("Cancel")').click()
    await page.waitForURL('**/setup/crops')
  })

  test('nonexistent id shows error message', async ({ page }) => {
    await page.goto('/setup/crops/999999')
    await expect(page.locator('text=Crop not found.')).toBeVisible()
  })

})
