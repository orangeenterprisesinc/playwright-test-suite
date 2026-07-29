/**
 * WYSIWYG Report Editor — end-to-end acceptance journey (WEBPET-731).
 *
 * THIS SPEC IS THE GATE for WEBPET-731..740. The Definition of Done for the
 * WYSIWYG feature is this journey passing in a REAL browser against the running
 * stack — not unit tests. Built acceptance-first: the entry-point test passes
 * today; the full journey is `test.fixme` and is enabled incrementally as each
 * P-ticket lands, until the sign-off ticket (WEBPET-740) removes the last fixme
 * and the whole journey is green.
 *
 * Stack runbook (what must be up for this spec to run):
 *   pnpm dev:minio   # docker gotenberg + minio
 *   pnpm dev:api     # Go API (SQL Server PetData via apps/api/.env)
 *   pnpm dev:web     # Vite dev server on :3000
 *   # ...or `pnpm dev` for all three at once, then:
 *   pnpm --filter @pet-tiger/web exec playwright test report-editor-wysiwyg
 *
 * Fixture: drives the seeded "Ranch" report (a known, registered report). The
 * editing steps (P1+) will set a known config state and clean it up; the entry
 * point needs no fixture.
 */
import { test, expect } from './fixtures'

const EDITOR_URL = '/settings/reports/Ranch'

test.describe('WYSIWYG Report Editor — acceptance journey', () => {
  // ── Entry point — real, passing today ──────────────────────────────────────
  // Proves the journey can reach the editor on a known report and that the
  // preview renders. If this breaks, the gate goes red regardless of the
  // WYSIWYG work below.
  test('opens the Report Editor on a seeded report with a live preview', async ({ page }) => {
    await page.goto(EDITOR_URL)
    // The page title names the report being edited ("Edit <name> Report").
    await expect(page.getByRole('heading', { name: /Edit Ranch Report/i })).toBeVisible()
    // The preview renders the report inside a sandboxed iframe (PrintSheet).
    await expect(page.locator('iframe').first()).toBeVisible({ timeout: 15000 })
  })

  // ── P0b (WEBPET-733): the preview is an interactive selection surface ───────
  test('preview agent: clicking an editable area selects it (sandbox + bridge)', async ({
    page,
  }) => {
    await page.goto(EDITOR_URL)

    // The preview iframe runs the agent (scripts allowed, opaque origin).
    await expect(page.locator('iframe').first()).toHaveAttribute('sandbox', /allow-scripts/)

    // Click the header area inside the iframe; the host reflects the selection
    // on the stable data-active-area hook.
    const frame = page.frameLocator('iframe')
    await frame.locator('[data-area="header"]').first().click()
    await expect(page.locator('[data-active-area="header"]')).toBeVisible({ timeout: 10000 })
  })

  // ── P0c (WEBPET-734): numbered markers + inspector Sheet; no left nav ───────
  test('markers + inspector: a marker opens its area; the index drills in', async ({ page }) => {
    await page.goto(EDITOR_URL)

    // A numbered marker for the header area is rendered in the host overlay and
    // opens the Branding section in the right inspector Sheet.
    const headerMarker = page.locator('[data-marker-area="header"]').first()
    await expect(headerMarker).toBeVisible({ timeout: 15000 })
    await headerMarker.click()
    await expect(page.locator('[data-inspector-area="header"]')).toBeVisible()

    // Back returns to the numbered index; drill into Table from there.
    await page.getByRole('button', { name: /Back/i }).click()
    await page.getByRole('button', { name: /Table/ }).click()
    await expect(page.locator('[data-inspector-area="table"]')).toBeVisible()
  })

  // ── P1 (WEBPET-735): mingled area editors — edit a field, preview reflects ──
  test('header area editor: editing Company Name updates the preview', async ({ page }) => {
    await page.goto(EDITOR_URL)

    // Open the Header area via its marker; the mingled editor exposes the
    // branding Company Name field.
    await page.locator('[data-marker-area="header"]').first().click()
    const companyInput = page.getByRole('textbox', { name: /Company Name/i });
    await expect(companyInput).toBeVisible()

    const value = 'WYSIWYG Test Co';
    await companyInput.fill(value)

    // The preview re-renders and shows the new company name (draft, not saved).
    await expect(page.frameLocator('iframe').getByText(value).first()).toBeVisible({
      timeout: 15000,
    })
  })

  // ── P2 (WEBPET-736): tabbed Table editor ───────────────────────────────────
  test('table area opens a tabbed editor (Columns / Sorting / Grouping / Pivot)', async ({
    page,
  }) => {
    await page.goto(EDITOR_URL)
    await page.locator('[data-marker-area="table"]').first().click()
    await expect(page.locator('[data-inspector-area="table"]')).toBeVisible()
    await expect(page.getByRole('tab', { name: /Columns/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Sorting/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Grouping/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Pivot/ })).toBeVisible()
  })

  // ── P2 (WEBPET-736): drag-to-reorder columns in the preview ─────────────────
  test('dragging a column header reorders the preview columns', async ({ page }) => {
    await page.goto(EDITOR_URL)
    await expect(page.locator('[data-marker-area="table"]').first()).toBeVisible({ timeout: 15000 })

    const frame = page.frameLocator('iframe')
    const headers = frame.locator('th[data-col-id]')
    await expect(headers.nth(1)).toBeVisible()
    const secondBefore = await headers.nth(1).getAttribute('data-col-id')

    // Drag the 2nd header onto the 1st → the 2nd column becomes first.
    await headers.nth(1).dragTo(headers.nth(0))

    await expect(async () => {
      const firstAfter = await frame.locator('th[data-col-id]').nth(0).getAttribute('data-col-id')
      expect(firstAfter).toBe(secondBefore)
    }).toPass({ timeout: 15000 })
  })

  // ── Each main section carries a pointed label tag naming the region ─────────
  test('each main section is labelled with its name on the preview', async ({ page }) => {
    await page.goto(EDITOR_URL)
    const headerTag = page.locator('[data-marker-area="header"]').first()
    await expect(headerTag).toBeVisible({ timeout: 15000 })
    await expect(headerTag).toContainText('Header')
  })

  // ── P4 (WEBPET-738): zoom control scales the preview sheet ──────────────────
  test('zoom in enlarges the preview sheet; reset restores it', async ({ page }) => {
    await page.goto(EDITOR_URL)
    const sheet = page.getByTestId('preview-sheet')
    await expect(sheet).toBeVisible({ timeout: 15000 })
    const before = await sheet.boundingBox()
    expect(before).not.toBeNull()

    // Two zoom-in clicks grow the rendered sheet.
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect(async () => {
      const box = await page.getByTestId('preview-sheet').boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThan(before!.width + 1)
    }).toPass({ timeout: 10000 })

    // Reset returns to the auto-fit size.
    await page.getByRole('button', { name: 'Reset zoom' }).click()
    await expect(async () => {
      const box = await page.getByTestId('preview-sheet').boundingBox()
      expect(box).not.toBeNull()
      expect(Math.abs(box!.width - before!.width)).toBeLessThan(2)
    }).toPass({ timeout: 10000 })
  })

  // ── P4 (WEBPET-738): markers carry an accessible name ───────────────────────
  test('a preview marker exposes its region name as an accessible label', async ({ page }) => {
    await page.goto(EDITOR_URL)
    const headerMarker = page.locator('[data-marker-area="header"]').first()
    await expect(headerMarker).toBeVisible({ timeout: 15000 })
    await expect(headerMarker).toHaveAttribute('aria-label', /Header/i)
  })

  // ── P4 (WEBPET-738): the preview stays mounted across a draft re-render ──────
  test('editing keeps the preview sheet mounted (no unmount flash)', async ({ page }) => {
    await page.goto(EDITOR_URL)
    const sheet = page.getByTestId('preview-sheet')
    await expect(sheet).toBeVisible({ timeout: 15000 })

    await page.locator('[data-marker-area="header"]').first().click()
    const companyInput = page.getByRole('textbox', { name: /Company Name/i })
    await expect(companyInput).toBeVisible()
    await companyInput.fill('Continuity Co')

    // The sheet must remain present (rendered from the persisted HTML) while the
    // draft re-render is in flight — it never unmounts.
    await expect(sheet).toBeVisible()
    await expect(page.frameLocator('iframe').getByText('Continuity Co').first()).toBeVisible({
      timeout: 15000,
    })
    await expect(sheet).toBeVisible()
  })

  // ── P3 (WEBPET-737): page setup / widgets / filter-summary areas ────────────
  test('page setup: switching orientation reflects in the preview aspect', async ({ page }) => {
    await page.goto(EDITOR_URL)
    const sheet = page.getByTestId('preview-sheet')
    await expect(sheet).toBeVisible({ timeout: 15000 })
    const before = await sheet.boundingBox()
    expect(before).not.toBeNull()
    expect(before!.height).toBeGreaterThan(before!.width) // portrait by default

    // The inspector opens on the section index by default — open Page Setup and
    // switch to Landscape.
    await page.getByRole('button', { name: /Page Setup/ }).click()
    await expect(page.locator('[data-inspector-area="pageSetup"]')).toBeVisible()
    await page.getByRole('combobox', { name: /Orientation/i }).click()
    await page.getByRole('option', { name: /Landscape/i }).click()

    // The preview sheet becomes landscape (wider than tall).
    await expect(async () => {
      const box = await page.getByTestId('preview-sheet').boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThan(box!.height)
    }).toPass({ timeout: 15000 })
  })

  test('widgets and filter-summary areas are reachable + editable from the index', async ({
    page,
  }) => {
    await page.goto(EDITOR_URL)
    // The inspector opens on the section index by default.
    await page.getByRole('button', { name: /Widgets/ }).click()
    await expect(page.locator('[data-inspector-area="widgets"]')).toBeVisible()
    await page.getByRole('button', { name: /Back/i }).click()
    // Title & Filters was merged into Header — the filter-summary controls live there now.
    await page.getByRole('button', { name: /Header/ }).click()
    await expect(page.locator('[data-inspector-area="header"]')).toBeVisible()
  })

  // ── The full journey — fixme until the WYSIWYG canvas exists ────────────────
  // Each P-ticket turns one step into a real assertion; WEBPET-740 removes this
  // fixme and the whole journey must be green.
  test('hover→marker→sheet: edit Company Name, add Website, reorder a column → preview + PDF reflect it', async ({
    page,
  }) => {
    test.fixme(true, 'WYSIWYG canvas not built yet — enabled by WEBPET-732..740')

    await page.goto(EDITOR_URL)

    await test.step('hovering an editable area highlights it (P0b/P0c — WEBPET-733/734)', async () => {
      // TODO: hover the header area → an outline/highlight appears on the canvas.
    })
    await test.step('clicking a marker opens its area in the right Sheet (P0c — WEBPET-734)', async () => {
      // TODO: click the Header marker → the right Sheet shows the Header editor.
    })
    await test.step('edit Company Name in the sheet → preview reflects it (P1 — WEBPET-735)', async () => {
      // TODO: change Company Name; assert the preview iframe shows the new name.
    })
    await test.step('add a Website that was not present → preview reflects it (P1 — WEBPET-735)', async () => {
      // TODO: add a website via the Header area; assert it appears in the preview.
    })
    await test.step('reorder a table column via drag → order changes (P2 — WEBPET-736)', async () => {
      // TODO: drag a column header to a new position; assert the column order.
    })
    await test.step('Save → preview iframe AND the printed PDF reflect all changes (WEBPET-740)', async () => {
      // TODO: Save; assert the preview and the Print Report PDF both show the edits.
    })
  })
})
