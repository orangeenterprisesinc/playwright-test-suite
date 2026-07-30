/**
 * Customer form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when CustomerListPage migrated to the new
 * DataGrid lib (PET-424). Form pages were not touched by that migration,
 * so the form tests below remain valid against the existing DOM.
 *
 * Framework-aligned (Batch 02): locators live in CustomerFormPage /
 * CustomerListPage, the Customer Type picker in ParentPickerComponent, and the
 * contacts sub-form in CustomerContactsComponent. Action order and assertions
 * unchanged.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import { ensureCustomer, deleteCustomer, type EnsuredCustomer } from './data-factory';

// This file owns its own Customer, created fresh via the API (no dependency on
// a seeded "DFV" row). `customerTypeName` is resolved from whatever the DB
// actually has so the type-dropdown test doesn't depend on a seeded "Grower".
// Assert against `customer.*` / `customerTypeName`, never a literal — that is
// what makes the file safe to run alongside others in parallel. See
// data-factory.ts.
let customer: EnsuredCustomer;
let customerTypeName: string;

test.beforeAll(async ({ request }) => {
    customer = await ensureCustomer(request);
    const types = (await (await request.get('/api/customer-types')).json()) as Array<{ name: string }>;
    if (types.length === 0) throw new Error('No customer types exist — cannot exercise the type dropdown');
    customerTypeName = types[0].name;
});

test.afterAll(async ({ request }) => {
    if (customer) await deleteCustomer(request, customer.id);
});

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .
//
// Error handling: alert() — API errors surfaced via window.alert.

// ── New Customer Form ──────────────────────────────────────────────────────────

test.describe('New customer form', { tag: ['@WebPet', '@wp-setup', '@wp-customer', '@WPBatch02'] }, () => {

    test('[Customer] Verify that the new customer form renders the expected fields.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0109' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        await expect(form.nameInput).toBeVisible();
        // Customer Type is now a ParentPicker combobox.
        await expect(form.customerTypePicker.comboboxInput).toBeVisible();
        await expect(form.activeCheckbox).toBeVisible();
    });

    test('[Customer] Verify that the customer type dropdown is populated from the database.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0110' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        // Assert a customer type that actually exists in this DB, not a seeded
        // "Grower" — proves the dropdown is DB-backed without a fixture dependency.
        await form.customerTypePicker.filterCombobox(customerTypeName);
        await expect(form.customerTypePicker.comboboxOptionByText(customerTypeName)).toBeVisible();
    });

    test('[Customer] Verify that Save is disabled until a required name is provided.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0111' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        // FormFooter disables Save until isDirty && isValid (PET-450).
        await expect(form.footer.saveButton).toBeDisabled();
        await form.nameInput.click();
        await form.nameInput.blur();
        await expect(form.footer.saveButton).toBeDisabled();
        await form.nameInput.fill('Pet450ValidName');
        // Form validates on blur (mode: 'onBlur'); blur so FormFooter enables Save.
        await form.nameInput.blur();
        await expect(form.footer.saveButton).toBeEnabled();
    });

    test('[Customer] Verify that the export identifier stays empty after a name blur (GAP-033 fix).', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0112' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        await form.fillName('TestCustomer');
        await expect(form.exportIdentifierInput).toHaveValue('');
    });

    test('[Customer] Verify that a manually filled export identifier is not overwritten.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0113' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        await form.exportIdentifierInput.fill('ManualId');
        await form.fillName('TestCustomer');
        await expect(form.exportIdentifierInput).toHaveValue('ManualId');
    });

    test('[Customer] Verify that Cancel returns to the list without saving.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0114' },
    }, async ({ page, pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        await form.nameInput.fill('ShouldNotBeSaved');
        // Once dirty, FormFooter relabels "Cancel" → "Discard changes"; "Don't Save"
        // in the UnsavedChangesModal abandons edits.
        await form.discardChanges();
        await page.waitForURL('**/setup/customers');
        // List page is now DataGrid (role=grid); no <td> elements.
        await expect(pages.customerList.grid.getRoot()).toBeVisible();
        await expect(pages.customerList.customerNamed('ShouldNotBeSaved')).not.toBeVisible();
    });

    test('[Customer] Verify that a duplicate name keeps the user on the create form.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0115' },
    }, async ({ page, pages }) => {
        const form = pages.customerForm;
        // This file's own customer already exists; re-using its name must be
        // rejected. API errors surface via alert().
        await form.gotoNew();
        page.on('dialog', (d) => d.dismiss());
        await form.fillName(customer.name);
        await form.footer.submitButton.click();
        await expect(form.footer.saveButton).toBeEnabled({ timeout: 10000 });
        await expect(page).toHaveURL(/\/setup\/customers\/new/);
    });

});

// ── Edit Customer Form ─────────────────────────────────────────────────────────

test.describe('Edit customer form', { tag: ['@WebPet', '@wp-setup', '@wp-customer', '@WPBatch02'] }, () => {

    test('[Customer] Verify that the edit form loads the existing customer data.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0116' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await expect(form.nameInput).toHaveValue(customer.name);
    });

    test('[Customer] Verify that the name is read-only while barcode and export identifier stay editable.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0117' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        // Unlike peer setup forms, CustomerFormPage locks only `name` on edit;
        // `code` and `exportIdentifier` stay editable. Logged for SME review in
        // OPEN_QUESTIONS.md (WEBPET-831) — flip back if they should be read-only.
        await form.gotoEdit(customer.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.codeInput).not.toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).not.toHaveAttribute('readonly', '');
    });

    test('[Customer] Verify that the active checkbox is editable.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0118' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await form.activeCheckbox.waitFor({ state: 'visible' });
        await expect(form.activeCheckbox).not.toBeDisabled();
    });

    test('[Customer] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0119' },
    }, async ({ page, pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/customers');
    });

    test('[Customer] Verify that a nonexistent customer id shows an error message.', {
        tag: ['@wp-ui', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0120' },
    }, async ({ pages }) => {
        await pages.customerForm.gotoEdit(999999);
        await expect(pages.customerForm.notFoundMessage).toBeVisible();
    });

});

// ── Contact Validation (PET-17) ────────────────────────────────────────────────
//
// Customer contact rows support 15 types. Email (type=4) and Web page (type=13)
// are validated at schema level via superRefine; phone-like types are accepted
// as any non-empty string pending legacy confirmation (see OPEN_QUESTIONS.md).

test.describe('Customer contact validation', { tag: ['@WebPet', '@wp-setup', '@wp-customer', '@WPBatch02'] }, () => {

    test('[Customer] Verify that the contact Add button is disabled until a value is entered.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0121' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await expect(form.contacts.addButton).toBeDisabled();
    });

    test('[Customer] Verify that an invalid e-mail contact keeps Save disabled.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0122' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        // Set the add-row type to "E-mail", enter a malformed value, then Add.
        await form.contacts.addContact('E-mail', 'not-an-email');
        // The appended invalid contact makes the form invalid. Inline message display
        // is deferred (WEBPET-831) — same as the phone tests below — so assert the
        // reliable signal: FormFooter keeps Save disabled while the form is invalid.
        await expect(form.footer.saveButton).toBeDisabled();
    });

    test('[Customer] Verify that an invalid web page contact keeps Save disabled.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0123' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await form.contacts.addContact('Web page', 'not-a-url');
        // Inline message deferred (WEBPET-831); assert Save stays disabled instead.
        await expect(form.footer.saveButton).toBeDisabled();
    });

    // ── Phone-format validation (WEBPET-61) ──────────────────────────────────────
    //
    // Numeric Phone/Fax/Pager types validate format on new/changed values only.
    // Inline message display is deferred (WEBPET-831), so these assert the reliable
    // signal: FormFooter disables Save while the form is invalid, enables it when
    // dirty + valid (PET-450).

    test('[Customer] Verify that appending a malformed phone contact keeps Save disabled.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0124' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await form.contacts.addContact('Phone', 'call Bob');
        await expect(form.footer.saveButton).toBeDisabled();
    });

    test('[Customer] Verify that appending a valid phone contact enables Save.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0125' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await form.contacts.addContact('Phone', '(559) 555-1212');
        await expect(form.footer.saveButton).toBeEnabled();
    });

});
