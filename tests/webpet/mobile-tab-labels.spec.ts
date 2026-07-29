// Migration note (imports only): `expect` was imported but unused — this repo's
// typecheck runs with noUnusedLocals (the source repo never typechecked e2e/).
import { test } from './fixtures'
import { ensureCrop, deleteCrop, type EnsuredCrop } from './data-factory'

// Owns its own crop (edit form hosts the mobile tab dropdown), instead of a
// hardcoded crop id that may not exist in every client DB. See data-factory.ts.
let crop: EnsuredCrop

test.beforeAll(async ({ request }) => {
  crop = await ensureCrop(request)
})

test.afterAll(async ({ request }) => {
  if (crop) await deleteCrop(request, crop.id)
})

test('CropFormPage mobile tab dropdown shows labels not values', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 })
  await page.goto(`/setup/crops/${String(crop.id)}`)
  await page.waitForSelector('form')
  await page.waitForTimeout(500)

  const mobileTrigger = page.locator('[data-slot="select-trigger"]').first()
  await mobileTrigger.scrollIntoViewIfNeeded()
  await mobileTrigger.click()
  await page.waitForTimeout(400)

  await page.screenshot({ path: 'e2e/.screenshots/mobile-tab-dropdown.png', fullPage: true })

  const items = page.locator('[data-slot="select-item"]:not(.hidden)')
  const count = await items.count()
  console.log('item count:', count)
  for (let i = 0; i < count; i++) {
    const text = await items.nth(i).innerText()
    console.log(`item ${i}: "${text}"`)
  }
})
