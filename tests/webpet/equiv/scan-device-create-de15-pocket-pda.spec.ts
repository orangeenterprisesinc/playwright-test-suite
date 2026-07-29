/**
 * Equivalence test: scan-device-create-de15-pocket-pda
 *
 * Scenario: Create a new Scan Device 'DE15' (Pocket PDA) with crews and save.
 * Source:   specs/processed/scan-device-create-de15-pocket-pda-20260609-164335.scenario.yaml
 *
 * testIsolation: substitute — 'DE15' and referencePrefix 'D14' replaced with
 * per-run tokens. 'D14' already exists in the DB ('d14 - MARIA CREW TIME CLOCK').
 * ReferencePrefix column is nvarchar(3) — substitute is 3 chars ('Z' + 2 base-36 digits).
 * ScanDevice_Name_Unique is unfiltered;
 * rows accumulate.
 * Periodic cleanup:  DELETE FROM Device WHERE Name LIKE 'ZZTEST_SD_%'
 *                    DELETE FROM DeviceCrew WHERE NOT EXISTS (
 *                      SELECT 1 FROM Device WHERE Device.DeviceCounter = DeviceCrew.DeviceCounter)
 *
 * Two-step save: General fields (name, deviceType, referencePrefix,
 * connectivityMethod, webMailAddress) are available on the New form.
 * Crew assignment and Preferences (barcodeScannerType, cameraPositionIsBack)
 * are only shown after the first save (Edit form), so a second save is needed.
 *
 * Known gaps vs YAML — fields not exposed in the web form or not in DB:
 *   - ImportAtStart, ExportAtExit: DB columns present, no form field in web app
 *   - UseEmployeesAlternateCode: DB column present, no form field
 *   - ExportTraceabilitySetupRecords (DB: ExportTraceabilitySetup): no form field
 *   - DefaultScanMode (DB: DefaultScreenCode): no form field
 *   - DeviceType "Pocket PDA": no such label in web enum; using iPhone (1) as substitute
 *   - AliasSet "iPhone": no AliasSet with that name in DB; left as null
 *   - Crew "Crew 04": no crew named 'Crew 04' in DB; testing with Crew 02 + Crew 03 only
 *
 * Fields with assert: ignore: DeviceCounter (PK auto-increment), UpdateTime (server timestamp).
 */
import { test, expect } from '../fixtures'

const RUN_TOKEN = Date.now().toString(36).slice(-6).toUpperCase()
const SAFE_NAME = `ZZTEST_SD_${RUN_TOKEN}`
// ReferencePrefix col is nvarchar(3) — max 3 chars. 'D14' already exists in DB.
// Use last 2 chars of base-36 token for 36^2=1296 combinations (enough for test use).
const SAFE_PREFIX = `Z${RUN_TOKEN.slice(-2)}`

test.describe('Equivalence: scan-device-create-de15-pocket-pda', () => {

  test('creates scan device and writes correct DB values', async ({ page }) => {
    test.setTimeout(300_000)

    // ── Step 1: Create — General section only ─────────────────────────────
    await page.goto('/setup/scan-devices/new')

    // Name (substituted)
    await page.locator('input#name').fill(SAFE_NAME)

    // DeviceType — the SelectTrigger has no id; find by position in section#general.
    // "Pocket PDA" has no exact equivalent; substitute iPhone (1).
    // section#general has exactly 2 Selects: [0]=deviceType, [1]=connectivityMethod.
    const generalSection = page.locator('section#general')
    await generalSection.locator('[data-slot="select-trigger"]').nth(0).click()
    await page.locator('[data-slot="select-content"] [data-value="1"]').click()

    // ReferencePrefix (substituted — 'D14' already exists in DB)
    await page.locator('input#referencePrefix').fill(SAFE_PREFIX)

    // ConnectivityMethod — "Web" = 4
    await generalSection.locator('[data-slot="select-trigger"]').nth(1).click()
    await page.locator('[data-slot="select-content"] [data-value="4"]').click()

    // WebMailAddress
    await page.locator('input#webMailAddress').fill('DE14@silo')

    // Active defaults true; Supervisor leaveBlank; SyncFolder leaveBlank.
    // Save button in ScanDeviceFormPage uses disabled={isSubmitting} only — no isDirty guard.
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(/\/setup\/scan-devices\/\d+/, { timeout: 60_000 })

    const match = page.url().match(/\/setup\/scan-devices\/(\d+)/)
    expect(match, 'URL should contain new device ID after save').not.toBeNull()
    const deviceId = parseInt(match![1]!, 10)

    // ── Step 2: Edit — add Preferences + Crews ────────────────────────────
    // Preferences section only renders after the first save (isNew=false + device data loaded).
    // waitForLoadState('networkidle') is unusable here because 4 endpoints return 403 and
    // keep retrying indefinitely. Wait for the section element itself to appear instead.
    await page.locator('section#preferences').waitFor({ state: 'visible', timeout: 60_000 })

    // barcodeScannerType "Camera" = 2 (Preferences > Hardware & Scan)
    // cameraPositionIsBack "Yes" = true (Preferences > General)
    // Crews: Crew 02 (crewCounter=2), Crew 03 (crewCounter=3)
    // Note: Crew 04 does not exist in this DB by that name; omitted.

    // Preferences selects have no id on the SelectTrigger; locate via label parent.
    // Scope option clicks to [data-open] — Base UI keeps closed portals in the DOM for
    // animations, so an unscoped [data-value="X"] would match items from both the open
    // dropdown and any stale closed dropdown that shares the same option value.
    // Base UI uses data-open (attribute present = open), not Radix's data-state="open".
    const openContent = '[data-slot="select-content"][data-open]'

    // barcodeScannerType "Camera" = 2
    const barcodeContainer = page.locator('div').filter({ has: page.locator('label[for="barcodeScannerType"]') }).last()
    await barcodeContainer.scrollIntoViewIfNeeded()
    await barcodeContainer.locator('[data-slot="select-trigger"]').click()
    await page.locator(`${openContent} [data-value="2"]`).click()

    // cameraPositionIsBack "Yes" = true
    const cameraContainer = page.locator('div').filter({ has: page.locator('label[for="cameraPositionIsBack"]') }).last()
    await cameraContainer.scrollIntoViewIfNeeded()
    await cameraContainer.locator('[data-slot="select-trigger"]').click()
    await page.locator(`${openContent} [data-value="true"]`).click()

    // Crew assignment — AssignmentTab: pick from Select dropdown, then click "Add".
    // Crew 02 (crewCounter=2), Crew 03 (crewCounter=3)
    const crewSection = page.locator('section#crew')
    await crewSection.scrollIntoViewIfNeeded()

    // Add Crew 02
    await crewSection.getByRole('combobox').click()
    await page.locator(`${openContent} [data-value="2"]`).click()
    await crewSection.getByRole('button', { name: 'Add' }).click()

    // Add Crew 03
    await crewSection.getByRole('combobox').click()
    await page.locator(`${openContent} [data-value="3"]`).click()
    await crewSection.getByRole('button', { name: 'Add' }).click()

    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Save' }).click()
    // After PUT, navigate() goes to the list page — wait for URL without a device ID.
    await page.waitForURL(/\/setup\/scan-devices$/, { timeout: 60_000 })

    // ── DB assertions via GET /api/scan-devices/:id ────────────────────────
    const res = await page.request.get(`/api/scan-devices/${deviceId}`)
    expect(res.ok()).toBe(true)
    const row = await res.json()

    // General
    expect(row.name).toBe(SAFE_NAME)
    expect(row.active).toBe(true)
    expect(row.deviceType).toBe(1)               // iPhone (substitute for Pocket PDA)
    expect(row.referencePrefix).toBe(SAFE_PREFIX)  // substituted — original was 'D14'
    expect(row.connectivityMethod).toBe(4)        // Web
    expect(row.webMailAddress).toBe('DE14@silo')
    expect(row.syncFolder ?? null).toBeNull()     // leaveBlank
    expect(row.supervisorCounter ?? null).toBeNull() // leaveBlank

    // Include flags — defaults
    expect(row.includeCrew).toBe(true)            // IncludeCrews: Yes (default true)

    // Preferences set in step 2
    expect(row.barcodeScannerType).toBe(2)        // Camera
    expect(row.cameraPositionIsBack).toBe(true)   // Yes

    // Crew assignments (sorted for determinism)
    const assignedCrewIds: number[] = [...(row.crewIds ?? [])].sort((a: number, b: number) => a - b)
    expect(assignedCrewIds).toEqual([2, 3])       // Crew 02, Crew 03

    // assert: ignore — DeviceCounter (PK), UpdateTime (server timestamp)
    // assert: ignore — AliasSet (no "iPhone" in DB; left null — not asserted)
    // assert: ignore — ImportAtStart, ExportAtExit, UseEmployeesAlternateCode,
    //                  ExportTraceabilitySetup, DefaultScanMode (not in web form)
  })

})
