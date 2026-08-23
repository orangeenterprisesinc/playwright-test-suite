/**
 * Billing Center form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when BillingCenterListPage migrated to the new
 * DataGrid lib (PET-424). Form pages were not touched by that migration,
 * so the form tests below remain valid against the existing DOM.
 *
 * Smoke + CRUD tests for PET-213 (Billing Center CRUD, Grower Billing module-gated).
 *
 * When the GrowerBilling module is not in PT_MODULES the route returns 403.
 * BillingCenterFormPage's goto*OrForbidden helpers report that so the spec can
 * still pass in dev environments without the module enabled.
 *
 * Prerequisites (with GrowerBilling enabled):
 *   - dev server running:  cd apps/web && pnpm dev
 *   - API server running:  cd apps/api && go run .
 *   - PT_MODULES env includes "GrowerBilling"
 *
 * Framework-aligned (Batch 04): locators live in BillingCenterFormPage /
 * BillingCenterListPage. The `Page` type now comes from @playwright/test
 * directly — the old re-export shim existed only because
 * `Parameters<typeof test>[1]['page']` resolved to a different overload.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import { deleteBillingCenter, ensureBillingCenter, type EnsuredBillingCenter } from './data-factory';

// Unique per-run token: Customer_Name_Unique (and the Code/ExportIdentifier
// unique constraints) are NOT filtered by Deleted, so a soft-deleted ghost
// from a prior run permanently owns a fixed name/code/exportId — GET only
// lists Deleted = 0 rows, so cleanup-by-name can never find or clear it,
// and the create silently 500s. Same fix as provision.ts's RestrictedTest
// provisioning: mint a fresh identity every run instead of relying on a fixed
// name a ghost could be squatting on.
const RUN_TOKEN = Date.now().toString(36).slice(-6).toUpperCase();
const TEST_NAME = `_PET213TestBillingCenter_${RUN_TOKEN}`;
const TEST_CODE = `BC${RUN_TOKEN}`;
const TEST_EXPORT_ID = `EXPBC${RUN_TOKEN}`;

// ── New Form ───────────────────────────────────────────────────────────────────

test.describe('Setup > Billing Center — new form', { tag: ['@WebPet', '@wp-setup', '@wp-billing-center', '@WPBatch04'] }, () => {

    test('[Billing Center] Verify that the new form renders the name field.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0001' },
    }, async ({ pages }) => {
        const form = pages.billingCenterForm;
        if (!(await form.gotoNewOrForbidden())) return;
        await expect(form.nameInput).toBeVisible();
    });

    test('[Billing Center] Verify that Save is disabled until a required name is provided.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0002' },
    }, async ({ pages }) => {
        const form = pages.billingCenterForm;
        if (!(await form.gotoNewOrForbidden())) return;
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

    test('[Billing Center] Verify that Cancel returns to the list.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0003' },
    }, async ({ page, pages }) => {
        const form = pages.billingCenterForm;
        if (!(await form.gotoNewOrForbidden())) return;
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/billing-centers');
    });

    test('[Billing Center] Verify that creating a billing center navigates to the edit form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0004' },
    }, async ({ pages }) => {
        const form = pages.billingCenterForm;
        if (!(await form.gotoNewOrForbidden())) return;

        await form.nameInput.fill(TEST_NAME);
        await form.codeInput.fill(TEST_CODE);
        await form.exportIdentifierInput.fill(TEST_EXPORT_ID);
        // See timesheet_validation.spec.ts: the old '**/billing-centers/**' glob also
        // matched /new. submit() resolves against editUrlPattern instead.
        expect(await form.submit()).toBe('created');
        await expect(form.nameInput).toHaveValue(TEST_NAME);
        // Name is read-only after first save.
        await expect(form.nameInput).toHaveAttribute('readonly', '');
    });

});

// ── Edit Form ──────────────────────────────────────────────────────────────────

test.describe('Setup > Billing Center — edit form', { tag: ['@WebPet', '@wp-setup', '@wp-billing-center', '@WPBatch04'] }, () => {

    // Own record via the API instead of re-finding WP-0004's UI-created one: with
    // fullyParallel these tests can run before the create test on another worker,
    // and the old find-by-name guard then skipped them silently.
    let bc: EnsuredBillingCenter;

    test.beforeAll(async ({ request }) => {
        bc = await ensureBillingCenter(request);
    });

    test.afterAll(async ({ request }) => {
        if (bc) await deleteBillingCenter(request, bc.id);
    });

    test('[Billing Center] Verify that the name is read-only on an existing record.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0005' },
    }, async ({ pages }) => {
        const form = pages.billingCenterForm;
        if (!(await form.gotoEditOrForbidden(bc.id))) return;
        await expect(form.nameInput).toHaveAttribute('readonly', '');
    });

    test('[Billing Center] Verify that the active toggle can be flipped and saved.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0006' },
    }, async ({ page, pages }) => {
        const form = pages.billingCenterForm;
        if (!(await form.gotoEditOrForbidden(bc.id))) return;

        // The active toggle is in the page header extras. Click it to deactivate.
        // ActiveField uses a Switch — its role is 'switch'.
        await form.activeSwitch.click();
        await form.footer.submitButton.click();
        await page.waitForURL('**/setup/billing-centers');
    });

});
