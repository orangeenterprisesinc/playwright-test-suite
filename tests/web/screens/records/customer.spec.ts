// spec: test-plans/screens/records.md
// seed: tests/seed.spec.ts

/**
 * Customer form-page e2e — form-only coverage (list-page coverage moved to
 * setup-batch-b-smoke.spec.ts before this migration; not carried here).
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/screens/records.md` |
 * | Runner rows | `src/data/runner/screens.csv` → `SCR-078`…`SCR-094` |
 *
 * Relocated from `tests/webpet/customer.spec.ts` (WP-0109…WP-0125). Every
 * assertion below is the one that spec carried, in the same order and the same
 * describes; what changed is the fixture (`base.fixture`), the id and tag
 * vocabulary, and `beforeAll`/`afterAll` moving from webpet's `request`
 * fixture to `sessionApi` (see the note below).
 *
 * This file owns its own Customer, created fresh via the API (no dependency on
 * a seeded "DFV" row). `customerTypeName` is resolved from whatever the DB
 * actually has so the type-dropdown test doesn't depend on a seeded "Grower".
 * Assert against `customer.*` / `customerTypeName`, never a literal — that is
 * what makes the file safe to run alongside others in parallel. See
 * `src/data/generated/data-factory.ts`.
 *
 * Customer contact rows support 15 types (PET-17). Email (type=4) and Web page
 * (type=13) are validated at schema level via superRefine; phone-like types
 * are accepted as any non-empty string pending legacy confirmation. Inline
 * message display is deferred (WEBPET-831), so those tests assert the reliable
 * signal instead: FormFooter keeps Save disabled while the form is invalid.
 *
 * ## beforeAll/afterAll on a test-scoped fixture
 *
 * `sessionApi` is `test`-scoped, same as webpet's own `request` override was.
 * Playwright's `beforeAll`/`afterAll` hook type is `(args: TestArgs &
 * WorkerArgs, testInfo) => …` — not restricted to worker fixtures — and its
 * fixture runner resolves whatever a hook destructures regardless of scope,
 * tearing the test-scoped instance back down once the hook returns
 * (`node_modules/playwright/lib/worker/fixtureRunner.js`, `teardownScope`).
 * That is mechanically identical to how webpet's `request` was used here; the
 * `customer`/`customerTypeName` values captured are plain data, so nothing
 * outlives that teardown.
 */
import { expect, test } from '@fixtures/base.fixture';
import { ensureCustomer, deleteCustomer, type EnsuredCustomer } from '@data/generated/data-factory';

let customer: EnsuredCustomer;
let customerTypeName: string;

test.beforeAll(async ({ sessionApi }) => {
    customer = await ensureCustomer(sessionApi);
    const types = (await (await sessionApi.get('/api/customer-types')).json()) as Array<{ name: string }>;
    if (types.length === 0) throw new Error('No customer types exist — cannot exercise the type dropdown');
    customerTypeName = types[0].name;
});

test.afterAll(async ({ sessionApi }) => {
    if (customer) await deleteCustomer(sessionApi, customer.id);
});

// ── New Customer Form ──────────────────────────────────────────────────────────

test.describe('New customer form', { tag: ['@Screens', '@Records'] }, () => {

    test('[Customer] Verify that the new customer form renders the expected fields.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-078' },
            { type: 'requirement', description: 'SCR-R100' },
        ],
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        await expect(form.nameInput).toBeVisible();
        // Customer Type is now a ParentPicker combobox.
        await expect(form.customerTypePicker.comboboxInput).toBeVisible();
        await expect(form.activeCheckbox).toBeVisible();
    });

    test('[Customer] Verify that the customer type dropdown is populated from the database.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-079' },
            { type: 'requirement', description: 'SCR-R101' },
        ],
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        // Assert a customer type that actually exists in this DB, not a seeded
        // "Grower" — proves the dropdown is DB-backed without a fixture dependency.
        await form.customerTypePicker.filterCombobox(customerTypeName);
        await expect(form.customerTypePicker.comboboxOptionByText(customerTypeName)).toBeVisible();
    });

    test('[Customer] Verify that Save is disabled until a required name is provided.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-080' },
            { type: 'requirement', description: 'SCR-R102' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-081' },
            { type: 'requirement', description: 'SCR-R103' },
        ],
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        await form.fillName('TestCustomer');
        await expect(form.exportIdentifierInput).toHaveValue('');
    });

    test('[Customer] Verify that a manually filled export identifier is not overwritten.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-082' },
            { type: 'requirement', description: 'SCR-R104' },
        ],
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        await form.exportIdentifierInput.fill('ManualId');
        await form.fillName('TestCustomer');
        await expect(form.exportIdentifierInput).toHaveValue('ManualId');
    });

    test('[Customer] Verify that Cancel returns to the list without saving.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-083' },
            { type: 'requirement', description: 'SCR-R105|SCR-R106' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        await form.nameInput.fill('ShouldNotBeSaved');
        // Once dirty, FormFooter relabels "Cancel" → "Discard changes"; "Don't Save"
        // in the UnsavedChangesModal abandons edits.
        await form.discardChanges();
        await page.waitForURL('**/setup/customers');
        // Positive anchor before the negative: proves the grid actually rendered,
        // so the absence check below cannot pass because navigation silently failed.
        await expect(pages.customerList.grid.getRoot()).toBeVisible();
        await expect(pages.customerList.customerNamed('ShouldNotBeSaved')).not.toBeVisible();
    });

    test('[Customer] Verify that a duplicate name keeps the user on the create form.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-084' },
            { type: 'requirement', description: 'SCR-R107' },
        ],
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

test.describe('Edit customer form', { tag: ['@Screens', '@Records'] }, () => {

    test('[Customer] Verify that the edit form loads the existing customer data.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-085' },
            { type: 'requirement', description: 'SCR-R108' },
        ],
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await expect(form.nameInput).toHaveValue(customer.name);
    });

    test('[Customer] Verify that the name is read-only while barcode and export identifier stay editable.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-086' },
            { type: 'requirement', description: 'SCR-R109|SCR-R110' },
        ],
    }, async ({ pages }) => {
        const form = pages.customerForm;
        // Unlike peer setup forms, CustomerFormPage locks only `name` on edit;
        // `code` and `exportIdentifier` stay editable (WEBPET-831).
        await form.gotoEdit(customer.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.codeInput).not.toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).not.toHaveAttribute('readonly', '');
    });

    test('[Customer] Verify that the active checkbox is editable.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-087' },
            { type: 'requirement', description: 'SCR-R111' },
        ],
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await form.activeCheckbox.waitFor({ state: 'visible' });
        await expect(form.activeCheckbox).not.toBeDisabled();
    });

    test('[Customer] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-088' },
            { type: 'requirement', description: 'SCR-R112' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/customers');
    });

    test('[Customer] Verify that a nonexistent customer id shows an error message.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-089' },
            { type: 'requirement', description: 'SCR-R113' },
        ],
    }, async ({ pages }) => {
        await pages.customerForm.gotoEdit(999999);
        await expect(pages.customerForm.notFoundMessage).toBeVisible();
    });

});

// ── Contact Validation (PET-17) ────────────────────────────────────────────────

test.describe('Customer contact validation', { tag: ['@Screens', '@Records'] }, () => {

    test('[Customer] Verify that the contact Add button is disabled until a value is entered.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-090' },
            { type: 'requirement', description: 'SCR-R114' },
        ],
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await expect(form.contacts.addButton).toBeDisabled();
    });

    test('[Customer] Verify that an invalid e-mail contact keeps Save disabled.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-091' },
            { type: 'requirement', description: 'SCR-R115' },
        ],
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        // Set the add-row type to "E-mail", enter a malformed value, then Add.
        await form.contacts.addContact('E-mail', 'not-an-email');
        // Inline message display is deferred (WEBPET-831) — assert the reliable
        // signal: FormFooter keeps Save disabled while the form is invalid.
        await expect(form.footer.saveButton).toBeDisabled();
    });

    test('[Customer] Verify that an invalid web page contact keeps Save disabled.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-092' },
            { type: 'requirement', description: 'SCR-R116' },
        ],
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await form.contacts.addContact('Web page', 'not-a-url');
        // Inline message deferred (WEBPET-831); assert Save stays disabled instead.
        await expect(form.footer.saveButton).toBeDisabled();
    });

    // ── Phone-format validation (WEBPET-61) ──────────────────────────────────────

    test('[Customer] Verify that appending a malformed phone contact keeps Save disabled.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-093' },
            { type: 'requirement', description: 'SCR-R117' },
        ],
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await form.contacts.addContact('Phone', 'call Bob');
        await expect(form.footer.saveButton).toBeDisabled();
    });

    test('[Customer] Verify that appending a valid phone contact enables Save.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-094' },
            { type: 'requirement', description: 'SCR-R118' },
        ],
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoEdit(customer.id);
        await form.contacts.addContact('Phone', '(559) 555-1212');
        await expect(form.footer.saveButton).toBeEnabled();
    });

});
