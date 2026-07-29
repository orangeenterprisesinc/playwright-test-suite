/**
 * Variety form-page e2e — list-page coverage moved to
 * traceability-batch-a-smoke.spec.ts when VarietyListPage migrated to the
 * new DataGrid lib (PET-424). Form pages were not touched by that
 * migration, so the form tests below remain valid against the existing DOM.
 *
 * DelLlano migration (WEBPET-831): crops and varieties are resolved by NAME
 * (DelLlano ids differ from the legacy PetData ids this spec was authored
 * against — there is no APPLE/BEANS/"Granny Smith"). The fixture data here is
 * STRAWBERRIES (crop) and its varieties (e.g. MAVERICK). active migrated off
 * native <select> to the ActiveField Switch (#active), and the dirty-Cancel
 * relabel ("Discard changes" + UnsavedChangesModal) matches the other forms.
 */
import { test, expect } from './fixtures'
import {
  ensureCrop,
  deleteCrop,
  ensureVariety,
  deleteVariety,
  type EnsuredCrop,
  type EnsuredVariety,
} from './data-factory'
import { sheetSelect, openSheetSelect, selectSheetOption, sheetSelectValue } from './parent-picker-helpers'

// This file creates its own two Crops (one carrying a Variety, so the
// duplicate-name test has a real conflict; a second so the dropdown test sees
// two options) and a Variety — instead of depending on seeded STRAWBERRIES /
// BLUEBERRIES that don't exist in every client DB. Assert against the returned
// values. See data-factory.ts.
let cropA: EnsuredCrop // has the variety
let cropB: EnsuredCrop // second crop, for the dropdown test
let variety: EnsuredVariety

test.beforeAll(async ({ request }) => {
  cropA = await ensureCrop(request)
  cropB = await ensureCrop(request)
  variety = await ensureVariety(request, { cropId: cropA.id })
})

test.afterAll(async ({ request }) => {
  if (variety) await deleteVariety(request, variety.id)
  if (cropA) await deleteCrop(request, cropA.id)
  if (cropB) await deleteCrop(request, cropB.id)
})

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .

// ── New Variety Form ───────────────────────────────────────────────────────────

test.describe('New variety form', () => {

  test('renders all expected fields', async ({ page }) => {
    await page.goto('/setup/varieties/new')
    // Crop is a ParentPicker sheet-mode <select>, no id attribute anymore —
    // locate via the shared helper by label.
    await expect(sheetSelect(page, 'Crop')).toBeVisible()
    await expect(page.locator('input#name')).toBeVisible()
    await expect(page.locator('input#code')).toBeVisible()
    await expect(page.locator('input#exportIdentifier')).toBeVisible()
    // active migrated off native <select> → ActiveField Switch (#active).
    await expect(page.locator('#active')).toBeVisible()
  })

  test('crop dropdown is populated with crops from database', async ({ page }) => {
    await page.goto('/setup/varieties/new')
    await openSheetSelect(page, 'Crop')
    const content = page.locator('[data-slot="select-content"]')
    await expect(content.locator('[data-slot="select-item"]', { hasText: cropA.name })).toBeVisible()
    await expect(content.locator('[data-slot="select-item"]', { hasText: cropB.name })).toBeVisible()
  })

  test('Save is disabled until required fields are provided', async ({ page }) => {
    await page.goto('/setup/varieties/new')
    const cropId = String(cropA.id)
    // FormFooter disables Save until isDirty && isValid (PET-450). Variety
    // requires Crop (FK) AND Name; both must be populated before Save enables.
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await page.locator('input#name').click()
    await page.locator('input#name').blur()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await page.locator('input#name').fill('Pet450ValidName')
    await page.locator('input#name').blur()
    // Name alone is not enough — Crop is also required.
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await selectSheetOption(page, 'Crop', cropId)
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  test('export identifier auto-populates from crop + name on blur', async ({ page }) => {
    await page.goto('/setup/varieties/new')
    const cropId = String(cropA.id)
    await selectSheetOption(page, 'Crop', cropId)
    await expect(sheetSelectValue(page, 'Crop')).toHaveText(cropA.name)
    await page.locator('input#name').fill('Fuji')
    await page.locator('input#name').blur()
    await expect(page.locator('input#exportIdentifier')).toHaveValue(`${cropA.name},Fuji`)
  })

  test('export identifier auto-populate skipped when field is already filled', async ({ page }) => {
    await page.goto('/setup/varieties/new')
    const cropId = String(cropA.id)
    await selectSheetOption(page, 'Crop', cropId)
    await expect(sheetSelectValue(page, 'Crop')).toHaveText(cropA.name)
    await page.locator('input#exportIdentifier').fill('ManualValue')
    await page.locator('input#name').fill('Fuji')
    await page.locator('input#name').blur()
    // Must not overwrite what the user already typed
    await expect(page.locator('input#exportIdentifier')).toHaveValue('ManualValue')
  })

  test('Cancel returns to list without saving', async ({ page }) => {
    await page.goto('/setup/varieties/new')
    await page.locator('input#name').fill('ShouldNotBeSaved')
    // Once dirty, FormFooter relabels "Cancel" → "Discard changes"; clicking it
    // triggers the UnsavedChangesModal guard, and "Don't Save" abandons edits.
    await page.locator('button:has-text("Discard changes")').click()
    await page.getByRole('button', { name: "Don't Save" }).click()
    await page.waitForURL('**/setup/varieties')
    // List page is now DataGrid (role=grid); no <td> elements.
    await expect(page.locator('[role="grid"]')).toBeVisible()
    await expect(page.getByText('ShouldNotBeSaved')).not.toBeVisible()
  })

  test('duplicate name for same crop shows conflict error', async ({ page }) => {
    // Our factory variety's name collides for the same (factory) crop.
    await page.goto('/setup/varieties/new')
    await selectSheetOption(page, 'Crop', String(variety.cropId))
    // Confirm React processed the selection before submitting
    await expect(sheetSelectValue(page, 'Crop')).toHaveText(cropA.name)
    await page.locator('input#name').fill(variety.name)
    await page.locator('input#name').blur()
    await page.locator('button[type="submit"]').click()
    // Form must stay on the new-variety page (insert failed, not navigated away)
    await expect(page).toHaveURL(/\/setup\/varieties\/new/, { timeout: 5000 })
    // API returns 409 with the conflict message.
    await expect(
      page.getByText('A variety with this name already exists for the selected crop.'),
    ).toBeVisible({ timeout: 10000 })
  })

})

// ── Edit Variety Form ──────────────────────────────────────────────────────────

test.describe('Edit variety form', () => {

  test('loads existing variety data correctly', async ({ page }) => {
    await page.goto(`/setup/varieties/${String(variety.id)}`)
    // Wait for the async data load to complete before asserting values
    await expect(page.locator('input#name')).toHaveValue(variety.name)
    await expect(page.locator('input#code')).toHaveValue(variety.code)
    await expect(page.locator('input#exportIdentifier')).toHaveValue(variety.exportIdentifier)
  })

  test('name, barcode and export identifier are read-only', async ({ page }) => {
    await page.goto(`/setup/varieties/${String(variety.id)}`)
    await page.waitForSelector('input#name')
    await expect(page.locator('input#name')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#code')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#exportIdentifier')).toHaveAttribute('readonly', '')
  })

  test('active toggle is not disabled', async ({ page }) => {
    await page.goto(`/setup/varieties/${String(variety.id)}`)
    await page.waitForSelector('#active')
    await expect(page.locator('#active')).not.toBeDisabled()
  })

  test('Cancel returns to list', async ({ page }) => {
    await page.goto(`/setup/varieties/${String(variety.id)}`)
    await page.waitForSelector('button:has-text("Cancel")')
    await page.locator('button:has-text("Cancel")').click()
    await page.waitForURL('**/setup/varieties')
  })

  test('nonexistent id shows not found message', async ({ page }) => {
    await page.goto('/setup/varieties/999999')
    await expect(page.locator('text=Variety not found.')).toBeVisible()
  })

})
