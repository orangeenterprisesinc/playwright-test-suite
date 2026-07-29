/**
 * Equivalence test: crew-04-timecard-multi-entry-workflow
 *
 * Scenario: Crew 04 time card entry — morning Time-In, lunch Time-In,
 *           mid-morning Time-In, and afternoon Time-Out for employee
 *           FAUSTO JUAREZ LOPEZ (employeeCounter 1257).
 * Source:   specs/processed/crew-04-timecard-multi-entry-workflow.scenario.yaml
 *
 * testIsolation: substitute — actual dates (6/9/2026) replaced with
 * TEST_DATE (2099-01-15) to avoid inserting into real payroll dates.
 * TimeCard has no unfiltered unique constraint; Reference is auto-assigned
 * per record, so each run creates fresh rows. Accumulation cleanup:
 *   DELETE FROM TimeCard
 *   WHERE DateTime >= '2099-01-15' AND DateTime < '2099-01-16'
 *     AND EmployeeCounter = 1257
 *
 * Fields with assert: ignore: Reference (auto-assigned by server).
 * Fields not directly exposed by GET /api/time-cards/time-in or time-out:
 *   - IsTimeIn: implicitly true for /time-in, false for /time-out
 *   - CardType: implicitly 1 for /time-in, 0 for /time-out
 *
 * Duplicate dialog: steps 2 and 3 may trigger "Duplicate Time In" (same
 * employee + date as step 1). confirmDuplicateIfVisible() clicks
 * "Continue Anyway" when the dialog appears.
 *
 * Prefill strategy: URL query params seed the RHF form values on mount,
 * so no interaction with the DateTimePicker calendar UI is needed.
 * The form's usePrefillFromQuery hook handles:
 *   dateTime, employeeCounter, crewCounter, ranchCounter, fieldCounter, jobCounter.
 */
import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'

const TEST_DATE = '2099-01-15'

function extractIdFromUrl(url: string): number {
  const m = url.match(/\/(\d+)(?:\?.*)?$/)
  expect(m, `URL ${url} should end with a numeric ID`).not.toBeNull()
  return parseInt(m![1]!, 10)
}

// Clicks "Continue Anyway" when the Duplicate Time In dialog is present.
// Swallows the error if no dialog appears within 5 s (the duplicate check is async).
async function confirmDuplicateIfVisible(page: Page) {
  try {
    const dialog = page.getByRole('alertdialog')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })
    await dialog.getByRole('button', { name: 'Continue Anyway' }).click()
    await expect(dialog).toBeHidden()
  } catch {
    // No duplicate dialog — proceed
  }
}

// URL-prefill fires reset() as a React mount effect, which sets isDirty=false.
// FormFooter.SaveButton disables when !isDirty, so we must dirty after reset settles.
// networkidle ensures all async data (employee/job lookups) has loaded and any
// secondary reset() calls from data-dependent effects have already fired.
// traceabilityCode setValueAs: ''→null — non-empty 'x' keeps isDirty=true.
async function markFormDirty(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.locator('input#traceabilityCode').fill('x')
}

test.describe('Equivalence: crew-04-timecard-multi-entry-workflow', () => {

  test.skip('creates 3 Time In + 1 Time Out records with correct DB values', async ({ page }) => {
    // SKIP: legacy workflow used View > Time Cards multi-entry form; web app
    // has the list view but has not yet replicated the multi-entry capability.
    // Re-enable once the multi-entry workflow is built for purpose.
    test.setTimeout(120_000)

    // ── Step 1: Time In 06:00, Job 128 (FUMIGATION FLAT) ──────────────────
    await page.goto(
      `/input/time-in/new?dateTime=${TEST_DATE}T06:00` +
      `&employeeCounter=1257&crewCounter=4&ranchCounter=9&fieldCounter=85&jobCounter=128`
    )
    await markFormDirty(page)
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 10000 })
    await page.getByRole('button', { name: 'Save' }).click()
    await confirmDuplicateIfVisible(page)
    await page.waitForURL(/\/input\/time-in\/\d+/)
    const step1Id = extractIdFromUrl(page.url())

    const res1 = await page.request.get(`/api/time-cards/time-in/${step1Id}`)
    expect(res1.ok()).toBe(true)
    const r1 = await res1.json()
    expect(r1.dateTime).toBe(`${TEST_DATE}T06:00:00`)
    expect(r1.jobCounter).toBe(128)
    expect(r1.ranchCounter).toBe(9)
    expect(r1.fieldCounter).toBe(85)
    expect(r1.employeeCounter).toBe(1257)
    expect(r1.crewCounter).toBe(4)
    // isTimeIn=true implicit: record found via /time-cards/time-in/
    // cardType=1 implicit: Time In endpoint

    // ── Step 2: Time In 10:00, Job 193 (LUNCH) ────────────────────────────
    await page.goto(
      `/input/time-in/new?dateTime=${TEST_DATE}T10:00` +
      `&employeeCounter=1257&crewCounter=4&ranchCounter=9&fieldCounter=85&jobCounter=193`
    )
    await markFormDirty(page)
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 10000 })
    await page.getByRole('button', { name: 'Save' }).click()
    await confirmDuplicateIfVisible(page)
    await page.waitForURL(/\/input\/time-in\/\d+/)
    const step2Id = extractIdFromUrl(page.url())

    const res2 = await page.request.get(`/api/time-cards/time-in/${step2Id}`)
    expect(res2.ok()).toBe(true)
    const r2 = await res2.json()
    expect(r2.dateTime).toBe(`${TEST_DATE}T10:00:00`)
    expect(r2.jobCounter).toBe(193)
    expect(r2.ranchCounter).toBe(9)
    expect(r2.fieldCounter).toBe(85)
    expect(r2.employeeCounter).toBe(1257)
    expect(r2.crewCounter).toBe(4)

    // ── Step 3: Time In 10:30, Job 128 (FUMIGATION FLAT) ──────────────────
    await page.goto(
      `/input/time-in/new?dateTime=${TEST_DATE}T10:30` +
      `&employeeCounter=1257&crewCounter=4&ranchCounter=9&fieldCounter=85&jobCounter=128`
    )
    await markFormDirty(page)
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 10000 })
    await page.getByRole('button', { name: 'Save' }).click()
    await confirmDuplicateIfVisible(page)
    await page.waitForURL(/\/input\/time-in\/\d+/)
    const step3Id = extractIdFromUrl(page.url())

    const res3 = await page.request.get(`/api/time-cards/time-in/${step3Id}`)
    expect(res3.ok()).toBe(true)
    const r3 = await res3.json()
    expect(r3.dateTime).toBe(`${TEST_DATE}T10:30:00`)
    expect(r3.jobCounter).toBe(128)
    expect(r3.ranchCounter).toBe(9)
    expect(r3.fieldCounter).toBe(85)
    expect(r3.employeeCounter).toBe(1257)
    expect(r3.crewCounter).toBe(4)

    // ── Step 4: Time Out 14:30, no job / ranch / field ─────────────────────
    await page.goto(
      `/input/time-out/new?dateTime=${TEST_DATE}T14:30&employeeCounter=1257&crewCounter=4`
    )
    await markFormDirty(page)
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 10000 })
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(/\/input\/time-out\/\d+/)
    const step4Id = extractIdFromUrl(page.url())

    const res4 = await page.request.get(`/api/time-cards/time-out/${step4Id}`)
    expect(res4.ok()).toBe(true)
    const r4 = await res4.json()
    expect(r4.dateTime).toBe(`${TEST_DATE}T14:30:00`)
    expect(r4.jobCounter).toBeNull()
    expect(r4.ranchCounter).toBeNull()
    expect(r4.fieldCounter).toBeNull()
    expect(r4.employeeCounter).toBe(1257)
    expect(r4.crewCounter).toBe(4)
    // isTimeIn=false implicit: record found via /time-cards/time-out/
    // cardType=0 implicit: Time Out endpoint
  })
})
