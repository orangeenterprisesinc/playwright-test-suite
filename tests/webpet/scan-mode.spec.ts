/**
 * Scan Mode — E2E verification (WEBPET-908, Slice 11 of the Tools > Scan epic WEBPET-897).
 *
 * Verifies the migrated Scan Mode surface that landed across WEBPET-898..904/909/910/913:
 *   - the landing grid lists every scan screen (wired cards link, deferred cards are dimmed),
 *   - each wired route resolves to its screen,
 *   - barcode decode routing and mode-switch-by-barcode navigation behave like the legacy
 *     `CheckBarcode`/`BarcodeDetails` + `OpenScanModeForm` flow,
 *   - the single-employee happy-path save round-trips through the screen shell,
 *   - carry-over is an on-by-default local UI toggle (the live `ScanModePrefs.UseCarryOver`
 *     wiring is deferred — see docs/04-operating-system/OPEN_QUESTIONS.md, WEBPET-900),
 *   - deferred surfaces (Pack House WEBPET-907, fingerprint WEBPET-905, HandPunch WEBPET-906)
 *     are explicitly skipped with a recorded reason.
 *
 * Determinism: the barcode-decode round-trip and the transaction save are driven through the
 * real UI but with `POST /scan/decode` (and the create endpoint) intercepted, so the spec does
 * not depend on which employee/job/field barcodes happen to be seeded in the dev DB. The exact
 * DB-write equivalence (audit/reference columns vs legacy) lives in the env-gated companion
 * spec apps/web/e2e/equiv/scan-time-in-equivalence.spec.ts.
 *
 * Requires the web app running (baseURL, default http://localhost:3000) and the admin auth
 * storage state provisioned by global-setup. Module-gating assertions live in the companion
 * spec apps/web/e2e/scan-mode-gating.spec.ts.
 */
import { test, expect } from './fixtures'

// Every scan screen key (mirrors SCAN_SCREEN_KEYS in src/features/scan/scanMode.ts and the
// common.nav.scan.items.* i18n key set). Each is rendered as a card on the landing grid.
const ALL_SCREEN_KEYS = [
  'timeIn',
  'timeOut',
  'pieceOut',
  'timeCard',
  'paidBreak',
  'meal',
  'crewTimeIn',
  'crewTimeOut',
  'crewPieceOut',
  'fieldTraceability',
  'warehouseTraceability',
  'purchase',
  'usage',
  'physicalCount',
  'transferFrom',
  'transferTo',
  'driverTimeIn',
  'driverTimeOut',
  'assignBarcodeRoll',
  'runIn',
  'runOut',
  'assignEmployeeCrew',
  'runPieceCount',
  'runProjection',
  'runTracking',
  'packHouse',
] as const

// Wired route segments (under /scan) that have a landing-grid link. Mirror the
// scanScreenSegments map in src/features/scan/useScanNavigate.ts plus the inventory routes
// (purchase/usage/physical-count/transfer-from/transfer-to) which are gated screens, not
// command-navigation targets. Pack House (packHouse) is intentionally absent — deferred.
const WIRED_SEGMENTS: Record<string, string> = {
  timeIn: 'time-in',
  timeOut: 'time-out',
  pieceOut: 'piece-out',
  timeCard: 'time-card',
  paidBreak: 'paid-break',
  meal: 'meal',
  crewTimeIn: 'crew-time-in',
  crewTimeOut: 'crew-time-out',
  crewPieceOut: 'crew-piece-out',
  fieldTraceability: 'field-traceability',
  warehouseTraceability: 'warehouse-traceability',
  purchase: 'purchase',
  usage: 'usage',
  physicalCount: 'physical-count',
  transferFrom: 'transfer-from',
  transferTo: 'transfer-to',
  driverTimeIn: 'driver-time-in',
  driverTimeOut: 'driver-time-out',
  assignBarcodeRoll: 'assign-barcode-roll',
  runIn: 'run-in',
  runOut: 'run-out',
  assignEmployeeCrew: 'assign-employee-crew',
  runPieceCount: 'run-piece-count',
  runProjection: 'run-projection',
  runTracking: 'run-tracking',
}

// Deferred screens excluded from this slice's required surface (verify when they land):
//   - packHouse: Pack House scan screen, WEBPET-907 (deferred — LAN-reachability block WEBPET-878)
//   - fingerprint capture: WEBPET-905 (BioIdentification, not a navigable scan-entry screen)
//   - HandPunch import: WEBPET-906 (batch import path, not an interactive scan screen)
const DEFERRED_KEYS = ['packHouse'] as const

test.describe('Scan Mode — landing grid (WEBPET-908)', () => {
  test('lists a card for every scan screen', async ({ page }) => {
    await page.goto('/scan')
    await page.locator('[data-testid="scan-landing-grid"]').waitFor({ state: 'visible' })

    for (const key of ALL_SCREEN_KEYS) {
      await expect(
        page.locator(`[data-testid="scan-card-${key}"]`),
        `landing grid is missing a card for "${key}"`,
      ).toBeVisible()
    }
  })

  test('wired cards are links; deferred cards are dimmed and non-navigable', async ({ page }) => {
    await page.goto('/scan')
    await page.locator('[data-testid="scan-landing-grid"]').waitFor({ state: 'visible' })

    // Wired cards render as <a> links (the Link component) carrying the screen segment.
    for (const [key, segment] of Object.entries(WIRED_SEGMENTS)) {
      const card = page.locator(`[data-testid="scan-card-${key}"]`)
      await expect(card).toHaveJSProperty('tagName', 'A')
      await expect(card).toHaveAttribute('href', new RegExp(`${segment}$`))
    }

    // Deferred cards render as a disabled Card (no link), marked aria-disabled.
    for (const key of DEFERRED_KEYS) {
      const card = page.locator(`[data-testid="scan-card-${key}"]`)
      await expect(card).toHaveAttribute('aria-disabled', 'true')
      await expect(card).not.toHaveAttribute('href', /./)
    }
  })

  test('clicking a wired card navigates to its scan screen', async ({ page }) => {
    await page.goto('/scan')
    await page.locator('[data-testid="scan-card-timeIn"]').click()
    await expect(page).toHaveURL(/\/scan\/time-in$/)
    // The Time In screen renders the shared scan input + employee slot.
    await expect(page.locator('#scan-input')).toBeVisible()
    await expect(page.locator('[data-testid="scan-employee-name"]')).toBeVisible()
  })
})

test.describe('Scan Mode — wired routes resolve (WEBPET-908)', () => {
  // Foundation + Time & Crew + Driver routes are ungated; they must resolve for any
  // authenticated user. Module-gated routes (inventory/traceability/run) are covered by
  // scan-mode-gating.spec.ts so this list excludes them to avoid env-dependent module flakiness.
  const UNGATED_SEGMENTS = [
    'time-in',
    'time-out',
    'piece-out',
    'time-card',
    'paid-break',
    'meal',
    'crew-time-in',
    'crew-time-out',
    'crew-piece-out',
    'driver-time-in',
    'driver-time-out',
  ]

  for (const segment of UNGATED_SEGMENTS) {
    test(`/scan/${segment} resolves to a scan screen`, async ({ page }) => {
      await page.goto(`/scan/${segment}`)
      // A landed scan screen always renders the shared keyboard-wedge input.
      // KNOWN APP BUG (driver-time-in / driver-time-out): the driver screens render two
      // ScanInputs (normal + LicenseDecodePanel) and ScanInput hardcodes id="scan-input",
      // so the id is duplicated. `.first()` proves a scan input rendered without tripping
      // strict-mode on the duplicate; the id collision is a src-side defect to fix.
      await expect(page.locator('#scan-input').first()).toBeVisible()
    })
  }
})

test.describe('Scan Mode — barcode decode routing (WEBPET-899 surface)', () => {
  test('an employee record barcode fills the employee slot', async ({ page }) => {
    // Intercept the decode service so the routing assertion is independent of seeded data.
    await page.route('**/scan/decode', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'record',
          table: 'Employee',
          recordCounter: 4242,
          name: 'VERIFY EMPLOYEE',
          active: true,
        }),
      })
    })

    await page.goto('/scan/time-in')
    await page.locator('#scan-input').fill('EMP-VERIFY')
    await page.locator('#scan-input').press('Enter')

    // The shell resolves the employee and labels the slot (scan:common.employeeLabel).
    await expect(page.locator('[data-testid="scan-employee-name"]')).toHaveText(
      /VERIFY EMPLOYEE/,
    )
    // Save becomes enabled only once an employee is captured.
    await expect(page.locator('[data-testid="scan-save-button"]')).toBeEnabled()
  })

  test('a non-employee record barcode is rejected with a message', async ({ page }) => {
    await page.route('**/scan/decode', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'record',
          table: 'Job',
          recordCounter: 7,
          name: 'HARVEST',
          active: true,
        }),
      })
    })

    await page.goto('/scan/time-in')
    await page.locator('#scan-input').fill('JOB-7')
    await page.locator('#scan-input').press('Enter')

    // Non-employee on an employee screen → error status, Save stays disabled.
    await expect(page.locator('[data-testid="scan-status"]')).toBeVisible()
    await expect(page.locator('[data-testid="scan-save-button"]')).toBeDisabled()
  })

  test('a command barcode switches scan mode (mode-switch navigation)', async ({ page }) => {
    // A command barcode targeting a different screen navigates there (legacy OpenScanModeForm).
    await page.route('**/scan/decode', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ kind: 'command', targetMode: 'timeOut' }),
      })
    })

    await page.goto('/scan/time-in')
    await page.locator('#scan-input').fill('-BCTO')
    await page.locator('#scan-input').press('Enter')

    await expect(page).toHaveURL(/\/scan\/time-out$/)
  })
})

test.describe('Scan Mode — per-screen happy-path save (WEBPET-908)', () => {
  test('Time In save round-trips through the screen shell', async ({ page }) => {
    // Decode → employee; create endpoint intercepted so the save is deterministic.
    await page.route('**/scan/decode', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'record',
          table: 'Employee',
          recordCounter: 4242,
          name: 'VERIFY EMPLOYEE',
          active: true,
        }),
      })
    })
    let savePosted = false
    await page.route('**/time-cards/time-in', async (route) => {
      if (route.request().method() === 'POST') {
        savePosted = true
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ timeCardCounter: 999, reference: 'TI-000999' }),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/scan/time-in')
    await page.locator('#scan-input').fill('EMP-VERIFY')
    await page.locator('#scan-input').press('Enter')
    await expect(page.locator('[data-testid="scan-save-button"]')).toBeEnabled()

    await page.locator('[data-testid="scan-save-button"]').click()

    // Success message shown; employee slot cleared for the next punch.
    await expect(page.locator('[data-testid="scan-status"]')).toHaveText(/VERIFY EMPLOYEE/)
    expect(savePosted, 'POST /time-cards/time-in should fire on save').toBe(true)
    await expect(page.locator('[data-testid="scan-save-button"]')).toBeDisabled()
  })
})

test.describe('Scan Mode — carry-over behavior (WEBPET-908)', () => {
  // Carry-over is an on-by-default LOCAL UI toggle that retains the Ranch/Field/Job/Crew
  // context across consecutive punches; the live ScanModePrefs.UseCarryOver preference wiring
  // is deferred (OPEN_QUESTIONS.md, WEBPET-900). This test verifies the shipped toggle, not the
  // (not-yet-wired) preference — that ambiguity is logged, not asserted here.
  test('carry-over toggle is present and defaults on', async ({ page }) => {
    await page.goto('/scan/time-in')
    const toggle = page.locator('[data-testid="scan-carry-over"]')
    await expect(toggle).toBeVisible()
    // base-ui Switch (role="switch") exposes state via `aria-checked` (true/false)
    // and the presence of `data-checked`/`data-unchecked` — NOT a `data-state`
    // attribute (that was the old shadcn/radix convention this assertion predates).
    // Assert on aria-checked, the stable accessibility contract. Default-on per legacy default.
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
  })
})

test.describe('Scan Mode — deferred surfaces (WEBPET-908)', () => {
  // Pack House (WEBPET-907) is deferred behind the LAN-reachability block (WEBPET-878). It has
  // no wired route and renders as a dimmed "Coming soon" card. Verify when WEBPET-907 lands.
  test.skip('Pack House scan screen — deferred (WEBPET-907 / WEBPET-878)', () => {})

  // Fingerprint capture (WEBPET-905) is a BioIdentification device-integration item, not a
  // navigable scan-entry screen. Verify when the bio-capture surface lands.
  test.skip('Fingerprint capture — deferred (WEBPET-905)', () => {})

  // HandPunch import (WEBPET-906) is a batch device-import write path, not an interactive
  // scan screen. Verify when the HandPunch sync-folder import lands.
  test.skip('HandPunch import provenance — deferred (WEBPET-906)', () => {})
})
