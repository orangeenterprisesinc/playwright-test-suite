import { test, expect } from './fixtures'

/**
 * Exercises the Header and Profile language pickers.
 *
 * The shared fixture pins every context to `en` and intercepts
 * `/api/session/me` to rewrite `user.language` to `en`, so these tests run
 * entirely in the English UI. They verify the picker's structure (System +
 * 3 locale options with BCP-47 suffixes) and the System-sentinel side
 * effect (a PUT /api/users/{id} with language=null).
 */

test.describe('Language picker — Header', () => {
  test('header dropdown lists Language submenu with System + 3 locales', async ({ page }) => {
    await page.goto('/')

    // Open the avatar dropdown.
    // UserMenu (app/layout/UserMenu.tsx) lives in the sidebar, not a <header>
    // — this selector never matched, hanging on the actionability wait until
    // the CONTEXT-CLOSED cascade further down misreported the real cause.
    await page.locator('[data-slot="dropdown-menu-trigger"]').first().click()
    // Sub-triggers use data-slot="dropdown-menu-sub-trigger" in the shared
    // dropdown-menu primitive; filter to the one containing "Language".
    const languageSubTrigger = page
      .locator('[data-slot="dropdown-menu-sub-trigger"]')
      .filter({ hasText: 'Language' })
    await expect(languageSubTrigger).toBeVisible({ timeout: 5000 })
    await languageSubTrigger.click()

    for (const expected of [
      'System',
      'English (en)',
      'Spanish (es)',
      'Spanish (Mexico) (es-MX)',
    ]) {
      await expect(page.getByRole('menuitemradio', { name: expected })).toBeVisible({
        timeout: 5000,
      })
    }
  })

  test('picking "System" sends language=null to PUT /api/users/{id}', async ({ page }) => {
    await page.goto('/')

    // Capture the next PUT /api/users/{id} so we can assert the payload.
    const putResponse = page.waitForRequest(
      (req) => /\/api\/users\/\d+$/.test(req.url()) && req.method() === 'PUT',
      { timeout: 10_000 },
    )

    // UserMenu (app/layout/UserMenu.tsx) lives in the sidebar, not a <header>
    // — this selector never matched, hanging on the actionability wait until
    // the CONTEXT-CLOSED cascade further down misreported the real cause.
    await page.locator('[data-slot="dropdown-menu-trigger"]').first().click()
    await page
      .locator('[data-slot="dropdown-menu-sub-trigger"]')
      .filter({ hasText: 'Language' })
      .click()
    await page.getByRole('menuitemradio', { name: 'System' }).click()

    const req = await putResponse
    const body = req.postDataJSON() as { language: unknown }
    expect(body.language).toBeNull()
  })
})

test.describe('Language picker — Profile', () => {
  test('Profile Personal Details lists System + all 3 locales with BCP-47 suffixes', async ({
    page,
  }) => {
    await page.goto('/profile')
    // PersonalDetails section is the only home of the language picker now
    // (PET-25 removed the duplicate Preferences-section picker).
    const personalDetailsLanguage = page.locator('#personal-details #language-personal')
    await personalDetailsLanguage.waitFor({ state: 'visible', timeout: 10_000 })
    await personalDetailsLanguage.click()

    for (const expected of [
      'System',
      'English (en)',
      'Spanish (es)',
      'Spanish (Mexico) (es-MX)',
    ]) {
      await expect(page.getByRole('option', { name: expected })).toBeVisible({ timeout: 5000 })
    }
  })
})
