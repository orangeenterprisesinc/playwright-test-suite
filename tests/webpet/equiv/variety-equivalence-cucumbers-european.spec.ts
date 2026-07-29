/**
 * Equivalence test: variety-new-record-cucumbers-european
 *
 * Scenario: Create new Variety 'European' under crop CUCUMBERS via Variety screen
 * Source:   specs/processed/variety-new-record-cucumbers-european.scenario.yaml
 *
 * testIsolation: substitute — 'European' is replaced with a unique per-run name
 * so repeated runs never conflict, even when a prior run's row was only
 * soft-deleted. (The Variety_CropCounter_Name_Unique constraint is unfiltered,
 * so soft-deleted rows block re-inserts with the same CropCounter+Name.)
 *
 * Fields with assert: ignore (Code, VarietyCounter, Preferen.SetupNextBarCode)
 * are not asserted; Code presence is verified (non-null) only.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { test, expect } from '../fixtures'
import { selectSheetOption, sheetSelectValue } from '../parent-picker-helpers'
import { API_BASE_URL } from '../support/webpet-env'
import type { APIRequestContext } from '@playwright/test'

// Unique per-run suffix avoids the unfiltered unique-constraint ghost-row issue.
const RUN_TOKEN   = Date.now().toString(36).slice(-6).toUpperCase()
const SAFE_NAME   = `ZZTEST_VAR_${RUN_TOKEN}`
// The legacy scenario used crop CUCUMBERS (id 38); DelLlano has no such crop,
// so rebase to a real seeded DelLlano crop. The equivalence assertion (the new
// Variety row's fields are written correctly) is unchanged — only the existing
// parent-crop FK differs.
const CROP_ID     = '3'
const CROP_NAME   = 'STRAWBERRIES'
const ADMIN_STORAGE = join(__dirname, '..', '.auth', 'storage.json')

// Read the CSRF token from the saved storage state for direct API calls
// that must pass RequireCSRF (DELETE). pt_csrf is non-HttpOnly — same value
// the browser JS reads and echoes as X-CSRF-Token.
function csrfFromStorage(): string {
  const data = JSON.parse(readFileSync(ADMIN_STORAGE, 'utf-8')) as {
    cookies: Array<{ name: string; value: string }>
  }
  return data.cookies.find(c => c.name === 'pt_csrf')?.value ?? ''
}

async function softDeleteVariety(api: APIRequestContext, id: number, csrf: string) {
  const res = await api.get(`/api/varieties/${id}`)
  if (!res.ok()) return
  const v = await res.json()
  await api.delete(`/api/varieties/${id}`, {
    data: { rowversion: v.version },
    headers: { 'X-CSRF-Token': csrf },
  })
}

let createdId: number | null = null

// Soft-delete the variety created during the test so it doesn't pile up
// as active records. Note: the unique constraint is unfiltered, so
// soft-deleted rows block future re-inserts of the same CropCounter+Name —
// that is why we use a unique SAFE_NAME per run rather than a fixed constant.
test.afterAll(async ({ playwright }) => {
  if (createdId == null) return
  const csrf = csrfFromStorage()
  const api = await playwright.request.newContext({
    baseURL: API_BASE_URL,
    storageState: ADMIN_STORAGE,
  })
  try {
    await softDeleteVariety(api, createdId, csrf)
  } finally {
    await api.dispose()
    createdId = null
  }
})

test.describe('Equivalence: variety-new-record-cucumbers-european', () => {

  test('creates variety and writes correct DB values', async ({ page }) => {
    await page.goto('/setup/varieties/new')

    // CropCounter — rebased to a real DelLlano crop (see CROP_ID/CROP_NAME above)
    await selectSheetOption(page, 'Crop', CROP_ID)
    await expect(sheetSelectValue(page, 'Crop')).toHaveText(CROP_NAME)

    // Name — unique per run to avoid unfiltered-unique-constraint conflicts
    await page.locator('input#name').fill(SAFE_NAME)
    await page.locator('input#name').blur()

    // ExportIdentifier auto-populates from Crop + Name on blur; assert: equals (derived)
    await expect(page.locator('input#exportIdentifier')).toHaveValue(`${CROP_NAME},${SAFE_NAME}`)

    // Active defaults to Yes — no interaction needed; assert: equals (true)

    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(/\/setup\/varieties\/\d+/)

    const match = page.url().match(/\/setup\/varieties\/(\d+)/)
    expect(match, 'URL should contain new variety ID after save').not.toBeNull()
    createdId = parseInt(match![1]!, 10)

    // ── DB assertions via GET /api/varieties/:id ──────────────────────────
    // page.request carries the browser context's session cookies (RequireAuth).
    // GET is a safe method — no CSRF header required.

    const res = await page.request.get(`/api/varieties/${createdId}`)
    expect(res.ok()).toBe(true)
    const row = await res.json()

    // assert: equals — CropCounter (rebased 38 → 3 for DelLlano's STRAWBERRIES)
    expect(row.cropCounter).toBe(3)

    // assert: equals — Active
    expect(row.active).toBe(true)

    // assert: equals — Name (unique per-run substitute)
    expect(row.name).toBe(SAFE_NAME)

    // assert: equals — ExportIdentifier (derived from CropCounter display + Name)
    expect(row.exportIdentifier).toBe(`${CROP_NAME},${SAFE_NAME}`)

    // assert: ignore — Code (auto-generated barcode; just verify it was assigned)
    expect(row.code).not.toBeNull()

    // assert: ignore — VarietyCounter (auto-increment PK; not asserted)
    // assert: ignore — Preferen.SetupNextBarCode (separate table; not asserted)
  })

})
