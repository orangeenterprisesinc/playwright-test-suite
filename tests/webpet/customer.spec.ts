/**
 * Customer form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when CustomerListPage migrated to the new
 * DataGrid lib (PET-424). Form pages were not touched by that migration,
 * so the form tests below remain valid against the existing DOM.
 */
import { test, expect } from './fixtures'
import { comboboxInput, openCombobox } from './parent-picker-helpers'
import { ensureCustomer, deleteCustomer, type EnsuredCustomer } from './data-factory'

// This file owns its own Customer, created fresh via the API (no dependency on
// a seeded "DFV" row). `customerTypeName` is resolved from whatever the DB
// actually has so the type-dropdown test doesn't depend on a seeded "Grower".
// Assert against `customer.*` / `customerTypeName`, never a literal — that is
// what makes the file safe to run alongside others in parallel. See
// data-factory.ts.
let customer: EnsuredCustomer
let customerTypeName: string

test.beforeAll(async ({ request }) => {
  customer = await ensureCustomer(request)
  const types = (await (await request.get('/api/customer-types')).json()) as Array<{ name: string }>
  if (types.length === 0) throw new Error('No customer types exist — cannot exercise the type dropdown')
  customerTypeName = types[0].name
})

test.afterAll(async ({ request }) => {
  if (customer) await deleteCustomer(request, customer.id)
})

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .
//
// Error handling: alert() — API errors surfaced via window.alert.

// ── New Customer Form ──────────────────────────────────────────────────────────

test.describe('New customer form', () => {

  test('renders expected fields', async ({ page }) => {
    await page.goto('/setup/customers/new')
    await expect(page.locator('input#name')).toBeVisible()
    // Customer Type is now a ParentPicker combobox.
    await expect(comboboxInput(page, 'Customer Type')).toBeVisible()
    await expect(page.locator('input#active')).toBeVisible()
  })

  test('customer type dropdown is populated from database', async ({ page }) => {
    await page.goto('/setup/customers/new')
    const input = comboboxInput(page, 'Customer Type')
    await openCombobox(input)
    // Assert a customer type that actually exists in this DB, not a seeded
    // "Grower" — proves the dropdown is DB-backed without a fixture dependency.
    await input.fill(customerTypeName)
    await expect(
      page.locator('[data-slot="combobox-popup"]').getByText(customerTypeName)
    ).toBeVisible()
  })

  test('Save is disabled until required name is provided', async ({ page }) => {
    await page.goto('/setup/customers/new')
    // FormFooter disables Save until isDirty && isValid (PET-450).
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await page.locator('input#name').click()
    await page.locator('input#name').blur()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await page.locator('input#name').fill('Pet450ValidName')
    // Form validates on blur (mode: 'onBlur'); blur so FormFooter enables Save.
    await page.locator('input#name').blur()
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  test('export identifier stays empty after name blur (GAP-033 fix)', async ({ page }) => {
    await page.goto('/setup/customers/new')
    await page.locator('input#name').fill('TestCustomer')
    await page.locator('input#name').blur()
    await expect(page.locator('input#exportIdentifier')).toHaveValue('')
  })

  test('manually filled export identifier is not overwritten', async ({ page }) => {
    await page.goto('/setup/customers/new')
    await page.locator('input#exportIdentifier').fill('ManualId')
    await page.locator('input#name').fill('TestCustomer')
    await page.locator('input#name').blur()
    await expect(page.locator('input#exportIdentifier')).toHaveValue('ManualId')
  })

  test('Cancel returns to list without saving', async ({ page }) => {
    await page.goto('/setup/customers/new')
    await page.locator('input#name').fill('ShouldNotBeSaved')
    // Once dirty, FormFooter relabels "Cancel" → "Discard changes"; "Don't Save"
    // in the UnsavedChangesModal abandons edits.
    await page.locator('button:has-text("Discard changes")').click()
    await page.getByRole('button', { name: "Don't Save" }).click()
    await page.waitForURL('**/setup/customers')
    // List page is now DataGrid (role=grid); no <td> elements.
    await expect(page.locator('[role="grid"]')).toBeVisible()
    await expect(page.getByText('ShouldNotBeSaved')).not.toBeVisible()
  })

  test('duplicate name stays on create form', async ({ page }) => {
    // This file's own customer already exists; re-using its name must be
    // rejected. API errors surface via alert().
    await page.goto('/setup/customers/new')
    page.on('dialog', (d) => d.dismiss())
    await page.locator('input#name').fill(customer.name)
    await page.locator('input#name').blur()
    await page.locator('button[type="submit"]').click()
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 10000 })
    await expect(page).toHaveURL(/\/setup\/customers\/new/)
  })

})

// ── Edit Customer Form ─────────────────────────────────────────────────────────

test.describe('Edit customer form', () => {

  test('loads existing customer data', async ({ page }) => {
    await page.goto(`/setup/customers/${String(customer.id)}`)
    await expect(page.locator('input#name')).toHaveValue(customer.name)
  })

  test('name is read-only; barcode and export identifier are editable', async ({ page }) => {
    // Unlike peer setup forms, CustomerFormPage locks only `name` on edit;
    // `code` and `exportIdentifier` stay editable. Logged for SME review in
    // OPEN_QUESTIONS.md (WEBPET-831) — flip back if they should be read-only.
    await page.goto(`/setup/customers/${String(customer.id)}`)
    await page.waitForSelector('input#name')
    await expect(page.locator('input#name')).toHaveAttribute('readonly', '')
    await expect(page.locator('input#code')).not.toHaveAttribute('readonly', '')
    await expect(page.locator('input#exportIdentifier')).not.toHaveAttribute('readonly', '')
  })

  test('active checkbox is editable', async ({ page }) => {
    await page.goto(`/setup/customers/${String(customer.id)}`)
    await page.waitForSelector('input#active')
    await expect(page.locator('input#active')).not.toBeDisabled()
  })

  test('Cancel returns to list', async ({ page }) => {
    await page.goto(`/setup/customers/${String(customer.id)}`)
    await page.locator('button:has-text("Cancel")').click()
    await page.waitForURL('**/setup/customers')
  })

  test('nonexistent id shows error message', async ({ page }) => {
    await page.goto('/setup/customers/999999')
    await expect(page.locator('text=Failed to load')).toBeVisible()
  })

})

// ── Contact Validation (PET-17) ────────────────────────────────────────────────
//
// Customer contact rows support 15 types. Email (type=4) and Web page (type=13)
// are validated at schema level via superRefine; phone-like types are accepted
// as any non-empty string pending legacy confirmation (see OPEN_QUESTIONS.md).

test.describe('Customer contact validation', () => {

  // The Contacts UI is an always-rendered <section id="contacts"> (FormTabs are
  // scroll-anchor nav, not show/hide tabs), and the add-row "Type" is a shadcn
  // Select (not a native <select>) — open the trigger and click the option.
  async function setContactType(page: import('@playwright/test').Page, optionLabel: string) {
    const contacts = page.locator('section#contacts')
    await contacts.getByRole('combobox').click()
    await page.getByRole('option', { name: optionLabel, exact: true }).click()
  }

  test('add button is disabled until value is non-empty', async ({ page }) => {
    await page.goto(`/setup/customers/${String(customer.id)}`)
    const addButton = page.locator('section#contacts').getByRole('button', { name: 'Add', exact: true })
    await expect(addButton).toBeDisabled()
  })

  test('invalid email on type=E-mail keeps Save disabled', async ({ page }) => {
    await page.goto(`/setup/customers/${String(customer.id)}`)
    const contacts = page.locator('section#contacts')
    // Set the add-row type to "E-mail", enter a malformed value, then Add.
    await setContactType(page, 'E-mail')
    await contacts.getByPlaceholder('Enter value…').fill('not-an-email')
    await contacts.getByRole('button', { name: 'Add', exact: true }).click()
    // The appended invalid contact makes the form invalid. Inline message display
    // is deferred (WEBPET-831) — same as the phone tests below — so assert the
    // reliable signal: FormFooter keeps Save disabled while the form is invalid.
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  test('invalid URL on type=Web page keeps Save disabled', async ({ page }) => {
    await page.goto(`/setup/customers/${String(customer.id)}`)
    const contacts = page.locator('section#contacts')
    await setContactType(page, 'Web page')
    await contacts.getByPlaceholder('Enter value…').fill('not-a-url')
    await contacts.getByRole('button', { name: 'Add', exact: true }).click()
    // Inline message deferred (WEBPET-831); assert Save stays disabled instead.
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  // ── Phone-format validation (WEBPET-61) ──────────────────────────────────────
  //
  // Numeric Phone/Fax/Pager types validate format on new/changed values only.
  // Inline message display is deferred (WEBPET-831), so these assert the reliable
  // signal: FormFooter disables Save while the form is invalid, enables it when
  // dirty + valid (PET-450).

  test('appending a malformed phone keeps Save disabled', async ({ page }) => {
    await page.goto(`/setup/customers/${String(customer.id)}`)
    const contacts = page.locator('section#contacts')
    await setContactType(page, 'Phone')
    await contacts.getByPlaceholder('Enter value…').fill('call Bob')
    await contacts.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  test('appending a valid phone enables Save', async ({ page }) => {
    await page.goto(`/setup/customers/${String(customer.id)}`)
    const contacts = page.locator('section#contacts')
    await setContactType(page, 'Phone')
    await contacts.getByPlaceholder('Enter value…').fill('(559) 555-1212')
    await contacts.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

})
