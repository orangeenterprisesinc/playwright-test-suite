import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { comboboxInput, openCombobox } from './parent-picker-helpers'
import { ensureJob, deleteJob, type EnsuredJob } from './data-factory'

// This file owns its own Job, created fresh via the API (no dependency on a
// seeded "0 - PISCA" / "0-Boxing" row). Assert against `job.*`, never a literal
// — that is what makes the file safe to run alongside others in parallel. See
// data-factory.ts.
let job: EnsuredJob

test.beforeAll(async ({ request }) => {
  job = await ensureJob(request)
})

test.afterAll(async ({ request }) => {
  if (job) await deleteJob(request, job.id)
})

// The job form requires an Overtime Rules FK (schema: positive int) in addition
// to Name before Save enables. Pick the first available rule via its combobox.
async function pickOvertimeRule(page: Page) {
  const input = comboboxInput(page, 'Overtime Rules')
  await openCombobox(input)
  await page.locator('[data-slot="combobox-popup"]').getByRole('option').first().click()
}

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .

// ── New Job Form ───────────────────────────────────────────────────────────────

test.describe('New job form', () => {

  test('renders expected fields', async ({ page }) => {
    await page.goto('/setup/jobs/new')
    await expect(page.locator('input#name')).toBeVisible()
    await expect(page.locator('#paymentType')).toBeVisible()
  })

  test('Save is disabled until required name is provided', async ({ page }) => {
    await page.goto('/setup/jobs/new')
    // FormFooter disables Save until isDirty && isValid (PET-450).
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await page.locator('input#name').click()
    await page.locator('input#name').blur()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await page.locator('input#name').fill('Pet450ValidName')
    await page.locator('input#name').blur()
    // Name alone is not enough — Overtime Rules (FK) is also required.
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await pickOvertimeRule(page)
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  test('export identifier auto-populates from name on blur', async ({ page }) => {
    await page.goto('/setup/jobs/new')
    await page.locator('input#name').fill('TestJob')
    await page.locator('input#name').blur()
    await expect(page.locator('input#exportIdentifier')).toHaveValue('TestJob')
  })

  test('Cancel returns to list without saving', async ({ page }) => {
    await page.goto('/setup/jobs/new')
    await page.locator('input#name').fill('ShouldNotBeSaved')
    await page.locator('button:has-text("Discard changes")').click()
    await page.getByRole('button', { name: "Don't Save" }).click()
    await page.waitForURL('**/setup/jobs')
    // List page is now DataGrid (role=grid); no <td> elements.
    await expect(page.locator('[role="grid"]')).toBeVisible()
    await expect(page.getByText('ShouldNotBeSaved')).not.toBeVisible()
  })

  test('duplicate name stays on create form', async ({ page }) => {
    // This file's own job name triggers a server 409 on submit.
    await page.goto('/setup/jobs/new')
    page.on('dialog', (d) => d.dismiss())
    await page.locator('input#name').fill(job.name)
    await page.locator('input#name').blur()
    await pickOvertimeRule(page)
    await page.locator('button[type="submit"]').click()
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 10000 })
    await expect(page).toHaveURL(/\/setup\/jobs\/new/)
  })

  // PET-60: includeIdleTime/actAsDeterminedByJobEnd are non-nullable booleans;
  // render as checkboxes with legacy NOT NULL DEFAULT values.
  test('Include Idle Time and Acts as Determined by Job End render as checkboxes with correct defaults', async ({ page }) => {
    test.skip(true, 'PET-60 checkbox boolean default/round-trip: shadcn Checkbox data-state + save round-trip needs rework — see OPEN_QUESTIONS.md (WEBPET-831).')
    await page.goto('/setup/jobs/new')
    const includeIdleTime = page.locator('#includeIdleTime')
    const actAsDetermined = page.locator('#actAsDeterminedByJobEnd')
    await expect(includeIdleTime).toBeVisible()
    await expect(actAsDetermined).toBeVisible()
    await expect(includeIdleTime).toHaveAttribute('data-state', 'checked')
    await expect(actAsDetermined).toHaveAttribute('data-state', 'unchecked')
  })

})

// ── Edit Job Form ──────────────────────────────────────────────────────────────

test.describe('Edit job form', () => {

  test('loads existing job data', async ({ page }) => {
    await page.goto(`/setup/jobs/${String(job.id)}`)
    await expect(page.locator('input#name')).toHaveValue(job.name)
    await expect(page.locator('input#code')).toHaveValue(job.code)
  })

  test('name, alias, code and export identifier are read-only', async ({ page }) => {
    await page.goto(`/setup/jobs/${String(job.id)}`)
    await page.waitForSelector('input#name')
    await expect(page.locator('input#name')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#alias')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#code')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#exportIdentifier')).toHaveAttribute('readonly', '')
  })

  test('Cancel returns to list', async ({ page }) => {
    await page.goto(`/setup/jobs/${String(job.id)}`)
    await page.locator('button:has-text("Cancel")').click()
    await page.waitForURL('**/setup/jobs')
  })

  test('nonexistent id shows error message', async ({ page }) => {
    await page.goto('/setup/jobs/999999')
    await expect(page.locator('text=not found.')).toBeVisible()
  })

  // PET-60: toggling Include Idle Time + Acts as Determined by Job End on the
  // edit form round-trips through the API as pure booleans (never null).
  test('Include Idle Time and Acts as Determined by Job End round-trip as booleans', async ({ page }) => {
    test.skip(true, 'PET-60 checkbox boolean default/round-trip: shadcn Checkbox data-state + save round-trip needs rework — see OPEN_QUESTIONS.md (WEBPET-831).')
    const jobId = job.id
    const initial = await (await page.request.get(`/api/jobs/${jobId}`)).json()
    const originalIncludeIdle = initial.includeIdleTime
    const originalActAs = initial.actAsDeterminedByJobEnd
    expect(typeof originalIncludeIdle).toBe('boolean')
    expect(typeof originalActAs).toBe('boolean')

    try {
      await page.goto(`/setup/jobs/${jobId}`)
      await expect(page.locator('#includeIdleTime')).toBeVisible()
      await page.locator('#includeIdleTime').click()
      await page.locator('#actAsDeterminedByJobEnd').click()
      await page.locator('button[type="submit"]').click()
      await page.waitForURL('**/setup/jobs')

      const afterFlip = await (await page.request.get(`/api/jobs/${jobId}`)).json()
      expect(typeof afterFlip.includeIdleTime).toBe('boolean')
      expect(typeof afterFlip.actAsDeterminedByJobEnd).toBe('boolean')
      expect(afterFlip.includeIdleTime).toBe(!originalIncludeIdle)
      expect(afterFlip.actAsDeterminedByJobEnd).toBe(!originalActAs)
    } finally {
      // Restore via PUT so subsequent runs start from known state.
      const current = await (await page.request.get(`/api/jobs/${jobId}`)).json()
      await page.request.put(`/api/jobs/${jobId}`, {
        data: {
          active:                 current.active,
          paymentType:            current.paymentType,
          overtimeRulesCounter:   current.overtimeRulesCounter,
          hourlyRate:             current.hourlyRate             ?? null,
          pieceRate:              current.pieceRate              ?? null,
          guaranteedRate:         current.guaranteedRate         ?? null,
          minPiecesPerHour:       current.minPiecesPerHour,
          considerEmployeeRate:   current.considerEmployeeRate,
          startDate:              current.startDate              ?? null,
          endDate:                current.endDate                ?? null,
          workerCompCode:         current.workerCompCode         ?? null,
          defaultLengthMinutes:   current.defaultLengthMinutes   ?? null,
          defaultNumberOfPieces:  current.defaultNumberOfPieces  ?? null,
          comment:                current.comment                ?? null,
          paletteCount:           current.paletteCount           ?? null,
          breakEvenCost:          current.breakEvenCost          ?? null,
          lookBackPeriod:         current.lookBackPeriod         ?? null,
          includeIdleTime:        originalIncludeIdle,
          actAsDeterminedByJobEnd: originalActAs,
          version:                current.version,
          cropIds:                current.cropIds                ?? [],
          jobGroups:              (current.jobGroups ?? []).map((g: { jobGroupCounter: number; conversionFactor: number | null }) => ({
            jobGroupCounter: g.jobGroupCounter,
            conversionFactor: g.conversionFactor,
          })),
          allowedEquipmentTypeIds: current.allowedEquipmentTypeIds ?? [],
          jobRateHistory:          (current.jobRateHistory ?? []).map((h: { rateDate: string; rate: number }) => ({
            rateDate: h.rateDate,
            rate:     h.rate,
          })),
        },
      })
    }
  })

})
