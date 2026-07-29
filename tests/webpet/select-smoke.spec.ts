import { test, expect } from './fixtures'
import {
  ensureCrew,
  deleteCrew,
  ensureJob,
  deleteJob,
  type EnsuredCrew,
  type EnsuredJob,
} from './data-factory'

// Crew and Job refs de-hardcoded to factory-created rows (were the shared id=1
// crew and /setup/jobs/1 job). Assert against `crew.*` / `job.*` so no two
// files touch the same row and the suite is safe above one worker.
let crew: EnsuredCrew
let job: EnsuredJob

test.beforeAll(async ({ request }) => {
  crew = await ensureCrew(request)
  job = await ensureJob(request)
})

test.afterAll(async ({ request }) => {
  if (crew) await deleteCrew(request, crew.id)
  if (job) await deleteJob(request, job.id)
})

test.describe('Select migration smoke', () => {
  test.describe.configure({ mode: 'serial' })

  test('CrewFormPage — boolean Switches render (Active + 3 Yes/No converted)', async ({ page }) => {
    await page.goto(`/setup/crews/${String(crew.id)}`)
    await page.waitForSelector('form')
    await page.waitForTimeout(500)

    await page.screenshot({ path: 'e2e/.screenshots/crew-form-closed.png', fullPage: true })

    // Smoke signal for the Select→Switch (shadcn→base-ui) migration: the crew form's
    // Yes/No fields render as switches. The default (General) view now shows 7 switches —
    // Active + the grouping/piece/break toggles below. (The original test named
    // Include-in-Transfer/Payroll/CostAcc, but those controls moved off this view since
    // it was written; the include-in-CostAcc one is also module-gated. The migration is
    // what's under test, so assert against switches actually on this view.)
    await expect(page.locator('[data-slot="switch"]')).toHaveCount(7)
    await expect(page.getByText('Group Clock-In Times', { exact: true })).toBeVisible()
    await expect(page.getByText('Group Clock-Out Times', { exact: true })).toBeVisible()
    await expect(page.getByText('Time Employees Included', { exact: true })).toBeVisible()
  })

  test('CrewFormPage — ParentPicker (combobox + sheet-mode select)', async ({ page }) => {
    await page.goto(`/setup/crews/${String(crew.id)}`)
    await page.waitForSelector('form')
    await page.waitForTimeout(500)
    const deptRow = page.locator('label[for="departmentCounter"]').locator('..')
    await deptRow.scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'e2e/.screenshots/crew-parent-pickers.png', clip: { x: 0, y: 150, width: 1200, height: 400 } })
  })

  test('JobFormPage — numeric enum + nullable 3-state + tab add-row', async ({ page }) => {
    await page.goto(`/setup/jobs/${String(job.id)}`)
    await page.waitForSelector('form')
    await page.waitForTimeout(500)

    const paymentTrigger = page.locator('[data-slot="select-trigger"]#paymentType')
    await expect(paymentTrigger).toBeVisible()
    await paymentTrigger.scrollIntoViewIfNeeded()
    await paymentTrigger.click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'e2e/.screenshots/job-paymenttype-open.png', fullPage: false })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // PET-60: includeIdleTime was a tri-state Select; now a non-nullable Checkbox.
    // base-ui renders the visible control as <span role="checkbox" data-slot="checkbox"
    // aria-checked=…> with its OWN generated id; `id="includeIdleTime"` is on a sibling
    // hidden <input>. So neither `#includeIdleTime` (that's the hidden input) nor a
    // :has() on it finds the visible control. The stable link is aria-labelledby →
    // the field label's id.
    const idleCheckbox = page.locator('[data-slot="checkbox"][aria-labelledby="includeIdleTime-label"]')
    await expect(idleCheckbox).toBeVisible()
    await expect(idleCheckbox).toHaveAttribute('aria-checked', /true|false|mixed/)

    // Crops tab — add-row Select (placeholder pattern)
    await page.getByRole('button', { name: 'Crops' }).click()
    await page.waitForTimeout(300)
    const cropTrigger = page.locator('[data-slot="select-trigger"]').first()
    await cropTrigger.click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'e2e/.screenshots/job-crops-add-open.png', fullPage: false })
    await page.keyboard.press('Escape')
  })

  test('CrewListPage — filter Select + Multi-Update toggle', async ({ page }) => {
    await page.goto('/setup/crews')
    await page.waitForSelector('[role="grid"]')
    await page.waitForTimeout(300)

    await page.screenshot({ path: 'e2e/.screenshots/crew-list-filter-row.png', clip: { x: 0, y: 0, width: 1200, height: 300 } })

    const filterTrigger = page.locator('[role="columnheader"] [data-slot="select-trigger"]').first()
    await expect(filterTrigger).toBeVisible()
    await filterTrigger.click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'e2e/.screenshots/crew-list-filter-open.png', fullPage: false })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // Toggle Multi-Update selection mode (forest-moss aria-pressed styling).
    await page.getByRole('button', { name: /multi[- ]?update/i }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'e2e/.screenshots/crew-list-mu-active.png', clip: { x: 0, y: 0, width: 1400, height: 250 } })
  })
})
