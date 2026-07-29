/**
 * Equivalence test: create-user-amy-sandoval
 *
 * Scenario: Create a new Users record for Amy Sandoval with Administrator role
 *           and full permissions
 * Source:   specs/processed/create-user-amy-sandoval.scenario.yaml
 *
 * testIsolation: substitute — 'Amy Sandoval' login name + email replaced with
 * unique per-run tokens. Users_Name_Unique is unfiltered, EmailAddress must be
 * unique in TigerMaster (WEBPET-776), and there is no DELETE API endpoint, so
 * per-run tokens are the only safe isolation strategy.
 * Old ZZTEST_USR_* rows accumulate in BOTH databases — periodic SQL cleanup:
 *   DELETE FROM Users WHERE Name LIKE 'ZZTEST_USR_%'
 *   DELETE FROM TigerMaster.dbo.Users WHERE Name LIKE 'ZZTEST_USR_%'
 *
 * Fields with assert: ignore: UsersCounter (PK), Password (stored hashed),
 * UpdateTime (server timestamp).
 *
 * ShortcutCounter and AliasSetCounter are DB columns not exposed by
 * GET /api/users/:id — cannot be asserted via the API. Both are null on
 * create; if a gap is suspected, verify directly via SQL.
 */
import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'

// Base UI Checkbox puts the id on a hidden native <input> inside the Root button.
// The clickable element is button[data-slot="checkbox"] in the same flex container.
// The form uses an inner overflow-y-auto container, so scrollIntoViewIfNeeded()
// is required to reach elements below the fold.
async function clickPermissionCheckbox(page: Page, fieldId: string) {
  const btn = page.locator(`label[for="${fieldId}"]`).locator('..').locator('[data-slot="checkbox"]')
  await btn.scrollIntoViewIfNeeded()
  await btn.click()
}

const RUN_TOKEN  = Date.now().toString(36).slice(-6).toUpperCase()
const SAFE_NAME  = `ZZTEST_USR_${RUN_TOKEN}`
const SAFE_EMAIL = `zztest_${RUN_TOKEN.toLowerCase()}@example.com`
const TEST_PASSWORD = 'Test@12345'

// UserInitials is unique-constrained. The legacy scenario used 'AS', but a real
// DelLlano user ("Amy") already owns 'AS', so that literal can never be created
// here (POST 409s → no navigation). Pick the lowest free 2-letter code at
// runtime — same approach as global-setup.ts's freeUserInitials. Documented
// divergence from the recorded scenario, like EmailAddress below.
async function freeUserInitials(page: Page): Promise<string> {
  const res = await page.request.get('/api/users')
  const users = (await res.json()) as Array<{ userInitials?: string }>
  const used = new Set(users.map((u) => (u.userInitials ?? '').toUpperCase()))
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (const a of A) for (const b of A) {
    const c = `${a}${b}`
    if (!used.has(c)) return c
  }
  throw new Error('No free 2-letter user initials available')
}

test.describe('Equivalence: create-user-amy-sandoval', () => {

  test('creates user and writes correct DB values', async ({ page }) => {
    const initials = await freeUserInitials(page)
    await page.goto('/settings/users/new')

    // ── General section ───────────────────────────────────────────────────

    // Name (assert: equals — substituted)
    await page.locator('input#name').fill(SAFE_NAME)

    // Password (assert: ignore — stored hashed; scenario value was '********')
    await page.locator('input#password').fill(TEST_PASSWORD)

    // UserRole — shadcn Select (not a ParentPicker), enteredId: 1 (Administrator)
    await page.locator('#userRole').click()
    await page.locator('[data-slot="select-content"] [data-value="1"]').click()

    // UserInitials (assert: equals)
    await page.locator('input#userInitials').fill(initials)

    // EmailAddress — required since WEBPET-776 (email is the login identifier
    // and must be unique in TigerMaster). The legacy scenario left this blank;
    // the web app now requires it, so we fill a unique per-run email. This is a
    // deliberate, documented divergence from the legacy scenario.
    await page.locator('input#emailAddress').fill(SAFE_EMAIL)

    // Language — shadcn Select, enteredId: en
    await page.locator('#language').click()
    await page.locator('[data-slot="select-content"] [data-value="en"]').click()

    // Active — Switch, defaults true; scenario Yes → no interaction needed

    // ── Permissions section ───────────────────────────────────────────────
    // PERMISSION_DEFAULTS differ from the scenario on 4 checkboxes.
    // Default false → scenario true: click to check each one.
    // All other permissions already match their defaults.
    // Scroll section into view before interacting — the inner overflow-y-auto
    // container is what must scroll, and scrollIntoViewIfNeeded handles that.

    await page.locator('section#permissions').scrollIntoViewIfNeeded()
    await clickPermissionCheckbox(page, 'viewAuditRecords')
    await clickPermissionCheckbox(page, 'allowJobCardRateOverwrite')
    await clickPermissionCheckbox(page, 'viewConfidentialData')
    await clickPermissionCheckbox(page, 'canModifyLockedJobCards')

    // EmployeeAccess — default 0 (Undefined); scenario 0 → no interaction needed
    // AccesstoReverse — default 2 (User); scenario 2 → no interaction needed
    // ViewSSN — default false; scenario false → no interaction needed

    // ── Personal Info section ─────────────────────────────────────────────
    await page.locator('input#firstName').fill('Amy')
    await page.locator('input#middleName').fill('Abigail')
    await page.locator('input#lastName').fill('Sandoval')
    await page.locator('input#title').fill('HR Manager')

    // ── Save ─────────────────────────────────────────────────────────────
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(/\/settings\/users\/\d+/)

    const match = page.url().match(/\/settings\/users\/(\d+)/)
    expect(match, 'URL should contain new user ID after save').not.toBeNull()
    const createdId = parseInt(match![1]!, 10)

    // ── DB assertions via GET /api/users/:id ──────────────────────────────
    // page.request carries the browser session cookie (RequireAuth).

    const res = await page.request.get(`/api/users/${createdId}`)
    expect(res.ok()).toBe(true)
    const row = await res.json()

    // assert: equals — Name (substituted)
    expect(row.name).toBe(SAFE_NAME)

    // assert: equals — Active
    expect(row.active).toBe(true)

    // assert: equals — UserInitials (runtime-free value; see freeUserInitials note)
    expect(row.userInitials).toBe(initials)

    // assert: equals — UserRole (1 = Administrator)
    expect(row.userRole).toBe(1)

    // assert: equals — EmailAddress (required since WEBPET-776; see note above)
    expect(row.emailAddress).toBe(SAFE_EMAIL)

    // assert: equals — Language
    expect(row.language).toBe('en')

    // assert: equals — Personal info
    expect(row.firstName).toBe('Amy')
    expect(row.middleName).toBe('Abigail')
    expect(row.lastName).toBe('Sandoval')
    expect(row.title).toBe('HR Manager')

    // assert: equals — Permissions (all true except viewSSN)
    expect(row.viewRates).toBe(true)
    expect(row.viewReports).toBe(true)
    expect(row.editRecords).toBe(true)
    expect(row.deleteRecords).toBe(true)
    expect(row.filterRecords).toBe(true)
    expect(row.exportRecords).toBe(true)
    expect(row.multiEditRecords).toBe(true)
    expect(row.viewAuditRecords).toBe(true)
    expect(row.importRecords).toBe(true)
    expect(row.addRecords).toBe(true)
    expect(row.multiDeleteInput).toBe(true)
    expect(row.multiDeleteSetup).toBe(true)
    expect(row.allowJobCardRateOverwrite).toBe(true)
    expect(row.allowEmployeeI9InformationAccess).toBe(true)
    expect(row.viewConfidentialData).toBe(true)
    expect(row.canModifyLockedJobCards).toBe(true)
    expect(row.viewSSN).toBe(false)

    // assert: equals — EmployeeAccess (0 = Undefined)
    expect(row.employeeAccess).toBe(0)

    // assert: equals — AccesstoReverse (2 = User)
    expect(row.accesstoReverse).toBe(2)

    // assert: ignore — UsersCounter (PK auto-increment)
    // assert: ignore — Password (stored hashed, not in API response)
    // assert: ignore — UpdateTime (server-assigned timestamp)
  })

})
