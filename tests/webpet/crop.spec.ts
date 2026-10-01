/**
 * Crop form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when CropListPage migrated to the new
 * DataGrid lib (PET-424). Form pages were not touched by that migration,
 * so the form tests below remain valid against the existing DOM.
 *
 * Framework-alignment reference spec (Batch 01). Every locator moved into
 * CropFormPage / CropListPage unchanged, and the action order and assertions of
 * each test are identical to the lifted version — the only intended differences
 * are the titles, the tags and the testCaseId annotations. Runner ids are
 * unchanged (WP-0096…WP-0108): the sync script merges on the annotation first,
 * so retitling does not renumber.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import { ensureCrop, deleteCrop, lockIdentifierGate, demoteFromSu, type EnsuredCrop } from './data-factory';

// This file creates its own Crop via the API instead of depending on a shared
// "Admin" crop that may not exist in every client DB. The duplicate-name tests
// re-enter this crop's name to trigger the uniqueness check; the edit tests
// assert against its returned values. See data-factory.ts.
let crop: EnsuredCrop;

test.beforeAll(async ({ request }) => {
    crop = await ensureCrop(request);
});

test.afterAll(async ({ request }) => {
    if (crop) await deleteCrop(request, crop.id);
});

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .

// ── New Crop Form ──────────────────────────────────────────────────────────────

test.describe('New crop form', { tag: ['@WebPet', '@wp-setup', '@wp-crop', '@WPBatch01'] }, () => {

    test('[Crop] Verify that the new crop form renders the expected fields.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0096' },
    }, async ({ pages }) => {
        await pages.cropForm.gotoNew();
        await expect(pages.cropForm.nameInput).toBeVisible();
        await expect(pages.cropForm.exportIdentifierInput).toBeVisible();
        // active migrated off native <select> → ActiveField Switch (#active).
        await expect(pages.cropForm.activeSwitch).toBeVisible();
    });

    test('[Crop] Verify that Save is disabled until a required name is provided.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0097' },
    }, async ({ pages }) => {
        const form = pages.cropForm;
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

    test('[Crop] Verify that the export identifier auto-populates from the name on blur.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0098' },
    }, async ({ pages }) => {
        await pages.cropForm.gotoNew();
        await pages.cropForm.fillName('TestCrop');
        await expect(pages.cropForm.exportIdentifierInput).toHaveValue('TestCrop');
    });

    test('[Crop] Verify that export identifier auto-populate is skipped when the field is already filled.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0099' },
    }, async ({ pages }) => {
        const form = pages.cropForm;
        await form.gotoNew();
        await form.exportIdentifierInput.fill('ManualId');
        await form.fillName('TestCrop');
        await expect(form.exportIdentifierInput).toHaveValue('ManualId');
    });

    test('[Crop] Verify that Cancel returns to the list without saving.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0100' },
    }, async ({ page, pages }) => {
        const form = pages.cropForm;
        await form.gotoNew();
        await form.nameInput.fill('ShouldNotBeSaved');
        // Once dirty, FormFooter relabels "Cancel" → "Discard changes"; clicking it
        // triggers the UnsavedChangesModal guard, and "Don't Save" abandons edits.
        await form.discardChanges();
        await page.waitForURL('**/setup/crops');
        // List page is now DataGrid (role=grid); no <td> elements.
        await expect(pages.cropList.grid.getRoot()).toBeVisible();
        await expect(pages.cropList.cropNamed('ShouldNotBeSaved')).not.toBeVisible();
    });

    test('[Crop] Verify that a duplicate name keeps the user on the create form.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0101' },
    }, async ({ page, pages }) => {
        const form = pages.cropForm;
        // Our factory crop already exists. The blur-time uniqueness check catches
        // the duplicate, so Save stays disabled and the form never navigates away.
        await form.gotoNew();
        page.on('dialog', (d) => d.dismiss());
        await form.fillName(crop.name);
        await expect(form.footer.saveButton).toBeDisabled();
        await expect(page).toHaveURL(/\/setup\/crops\/new/);
    });

    test('[Crop] Verify that submitting a duplicate name maps the server error to the Name field inline.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0102' },
    }, async ({ page, pages }) => {
        const form = pages.cropForm;
        // Submit a duplicate name so the Go API responds with a structured 409
        // (code=unique, path=name); the mapping helper routes it into
        // formState.errors.name and the inline message surfaces to the user.
        await form.gotoNew();
        page.on('dialog', (d) => d.dismiss());
        // Fill both fields so export-identifier auto-populate doesn't mask the
        // uniqueness failure on submit.
        await form.nameInput.fill(crop.name);
        await form.exportIdentifierInput.fill('DupTest');
        await form.nameInput.blur();
        // The duplicate surfaces an inline uniqueness error...
        await expect(form.duplicateError).toBeVisible({ timeout: 10000 });
        // ...and the footer's error-summary trigger offers it too.
        await expect(form.footer.errorSummaryButton).toBeVisible();
    });

    test('[Crop] Verify that blurring the name against a duplicate value fires the uniqueness check before submit.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0103' },
    }, async ({ pages }) => {
        const form = pages.cropForm;
        // The blur-time hook hits /api/validation/unique with entity=crop,
        // field=name. Our factory crop is a live duplicate, so unique=false and the
        // form receives a setError(name, { type: 'unique' }) — no submit needed.
        await form.gotoNew();
        await form.fillName(crop.name);
        // Wait for the inline error to render (async response round-trip).
        await expect(form.duplicateNameError).toBeVisible({ timeout: 10000 });
    });

});

// ── Edit Crop Form ─────────────────────────────────────────────────────────────

test.describe('Edit crop form', { tag: ['@WebPet', '@wp-setup', '@wp-crop', '@WPBatch01'] }, () => {

    test('[Crop] Verify that the edit form loads the existing crop data.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0104' },
    }, async ({ pages }) => {
        const form = pages.cropForm;
        await form.gotoEdit(crop.id);
        await expect(form.nameInput).toHaveValue(crop.name);
        await expect(form.exportIdentifierInput).toHaveValue(crop.exportIdentifier);
    });

    test('[Crop] Verify that the name and export identifier lock under the WEBPET-2006 gate for a non-SU user.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0105' },
    }, async ({ pages, page }) => {
        // WEBPET-2006's identifier gate now reaches Crop too — previously these
        // two fields were unconditionally read-only here, which is what this test
        // used to assert. The suite's session is SU with every flag open, so they
        // are editable until demoted.
        const form = pages.cropForm;
        await form.gotoEdit(crop.id);
        await form.waitForForm();
        await expect(form.nameInput).not.toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).not.toHaveAttribute('readonly', '');

        // Non-SU with both flags closed reaches the locked branch. Both rewrites
        // are registered before this navigation, and the assertions wait on the
        // actual preferences response rather than racing it (see job.spec.ts's
        // WP-0235, the pattern this mirrors).
        await demoteFromSu(page);
        await lockIdentifierGate(page, {
            allowRecordNameModification: false,
            allowRecordExportIdModify: false,
        });
        const gateSettled = page.waitForResponse((res) => res.url().includes('/api/setup-identifier-preferences'));
        await form.gotoEdit(crop.id);
        await gateSettled;
        await form.waitForForm();
        // The lock needs BOTH rewrites to have landed — readonly is
        // `!isNew && !(isSU || flag)`, so session/me drives one term and
        // setup-identifier-preferences the other — but only the preferences
        // response is awaited above. When session/me lands late the fields are
        // still editable here, which is this test's intermittent CI failure
        // ("unexpected value null"). Wait for the settled state rather than for
        // whichever response happens to be last; the assertions are unchanged.
        await expect(form.nameInput).toHaveAttribute('readonly', '', { timeout: 15_000 });
        await expect(form.exportIdentifierInput).toHaveAttribute('readonly', '', { timeout: 15_000 });
    });

    test('[Crop] Verify that the traceability assignment sections render on the edit form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0106' },
    }, async ({ pages }) => {
        // The legacy tabbed UI migrated to per-attribute AssignmentTab widgets in
        // the (edit-only) Traceability section, each headed "Include <attribute>".
        await pages.cropForm.gotoEdit(crop.id);
        await expect(pages.cropForm.traceabilitySection).toBeVisible();
    });

    test('[Crop] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0107' },
    }, async ({ page, pages }) => {
        await pages.cropForm.gotoEdit(crop.id);
        await pages.cropForm.footer.cancelButton.click();
        await page.waitForURL('**/setup/crops');
    });

    test('[Crop] Verify that a nonexistent crop id shows an error message.', {
        tag: ['@wp-ui', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0108' },
    }, async ({ pages }) => {
        await pages.cropForm.gotoEdit(999999);
        await expect(pages.cropForm.notFoundMessage).toBeVisible();
    });

});
