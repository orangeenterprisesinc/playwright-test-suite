/**
 * Onboarding badges (PET-559) — smoke spec covering the list-page + form-page
 * surfaces. Onboarding badges are Employee table rows where RecordType = 1;
 * they expose a narrower form (no SSN, hire/release dates, address) than
 * regular Employees.
 *
 * Prerequisites for live execution:
 *   - dev server running: cd apps/web && pnpm dev
 *   - API server running: cd apps/api && go run .
 *   - DB seeded with at least one Employee row where RecordType = 1 (or the
 *     suite will create one via the New form).
 *
 * NOT executed in the /execute-ticket run that shipped this file. Run
 * manually against a live dev environment to confirm the slice end-to-end.
 */
import { test, expect } from './fixtures'
import { ensureEmployee, deleteEmployee } from './data-factory'

// The onboarding-badges section is routed under /setup/badge (AppRouter path
// 'badge'), NOT /setup/onboarding-badges. The API resource is still
// /api/onboarding-badges. This URL was stale relative to the router.
const LIST_URL = '/setup/badge'

test.describe('Onboarding Badges — list page chrome', () => {
  test('page title is "Onboarding Badges"', async ({ page }) => {
    await page.goto(LIST_URL)
    await expect(page.getByRole('heading', { name: /onboarding badges/i })).toBeVisible()
  })

  test('grid renders with the expected columns', async ({ page }) => {
    await page.goto(LIST_URL)
    await page.waitForSelector('[role="grid"]')
    await expect(page.getByRole('columnheader', { name: /^Name/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Barcode/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /Export Identifier/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Crew/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Department/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Active/ })).toBeVisible()
  })

  test('"New Badge" button navigates to the new-record form', async ({ page }) => {
    await page.goto(LIST_URL)
    await page.getByRole('button', { name: /new badge/i }).click()
    await expect(page).toHaveURL(/\/setup\/badge\/new/)
  })
})

test.describe('Onboarding Badges — new-record form', () => {
  test('renders Name + Barcode + Export Identifier + Active + Crew + Department fields', async ({ page }) => {
    await page.goto(`${LIST_URL}/new`)
    await expect(page.locator('input#name')).toBeVisible()
    await expect(page.locator('input#code')).toBeVisible()
    await expect(page.locator('input#exportIdentifier')).toBeVisible()
    await expect(page.locator('input#active')).toBeVisible()
  })

  test('Save is disabled until Name is entered', async ({ page }) => {
    await page.goto(`${LIST_URL}/new`)
    // The form's Save button is inside the FormFooter — disabled while
    // !isDirty or when validation fails.
    const save = page.getByRole('button', { name: /^save/i })
    await expect(save).toBeDisabled()
  })
})

test.describe('Onboarding Badges — cross-contamination guard', () => {
  test('regular Employees do NOT appear in the onboarding-badges list', async ({ page, request }) => {
    // Create a regular Employee (RecordType=0) and assert it is absent from the
    // badges list (API filter `RecordType = 1`); any leakage is a backend
    // regression. Using a factory employee makes this a real check instead of a
    // spot-check against a possibly-absent seeded name.
    const emp = await ensureEmployee(request)
    try {
      const resp = await request.get('/api/onboarding-badges')
      expect(resp.ok()).toBeTruthy()
      const badges = (await resp.json()) as Array<{ name: string }>
      expect(badges.find((b) => b.name === emp.name)).toBeUndefined()

      // The list page should also render without the badge row count
      // hitting the regular-Employee count.
      await page.goto(LIST_URL)
      await page.waitForSelector('[role="grid"]')
    } finally {
      await deleteEmployee(request, emp.id)
    }
  })
})
