/**
 * Variety form-page e2e — list-page coverage moved to
 * traceability-batch-a-smoke.spec.ts when VarietyListPage migrated to the
 * new DataGrid lib (PET-424). Form pages were not touched by that
 * migration, so the form tests below remain valid against the existing DOM.
 *
 * DelLlano migration (WEBPET-831): crops and varieties are resolved by NAME
 * (DelLlano ids differ from the legacy PetData ids this spec was authored
 * against — there is no APPLE/BEANS/"Granny Smith"). active migrated off
 * native <select> to the ActiveField Switch (#active), and the dirty-Cancel
 * relabel ("Discard changes" + UnsavedChangesModal) matches the other forms.
 *
 * Framework-aligned (Batch 02): locators live in VarietyFormPage /
 * VarietyListPage, and the sheet-mode Crop picker is driven through
 * ParentPickerComponent. Action order and assertions unchanged.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import {
    ensureCrop,
    deleteCrop,
    ensureVariety,
    deleteVariety,
    type EnsuredCrop,
    type EnsuredVariety,
} from '@data/generated/data-factory';

// This file creates its own two Crops (one carrying a Variety, so the
// duplicate-name test has a real conflict; a second so the dropdown test sees
// two options) and a Variety — instead of depending on seeded STRAWBERRIES /
// BLUEBERRIES that don't exist in every client DB. Assert against the returned
// values. See data-factory.ts.
let cropA: EnsuredCrop; // has the variety
let cropB: EnsuredCrop; // second crop, for the dropdown test
let variety: EnsuredVariety;

test.beforeAll(async ({ request }) => {
    cropA = await ensureCrop(request);
    cropB = await ensureCrop(request);
    variety = await ensureVariety(request, { cropId: cropA.id });
});

test.afterAll(async ({ request }) => {
    if (variety) await deleteVariety(request, variety.id);
    if (cropA) await deleteCrop(request, cropA.id);
    if (cropB) await deleteCrop(request, cropB.id);
});

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .

// ── New Variety Form ───────────────────────────────────────────────────────────

test.describe('New variety form', { tag: ['@WebPet', '@wp-setup', '@wp-variety', '@WPBatch02'] }, () => {

    test('[Variety] Verify that the new variety form renders all expected fields.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0395' },
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoNew();
        // Crop is a ParentPicker sheet-mode <select>, no id attribute anymore —
        // located by label through the component.
        await expect(form.cropPicker.sheetTrigger).toBeVisible();
        await expect(form.nameInput).toBeVisible();
        await expect(form.codeInput).toBeVisible();
        await expect(form.exportIdentifierInput).toBeVisible();
        // active migrated off native <select> → ActiveField Switch (#active).
        await expect(form.activeSwitch).toBeVisible();
    });

    test('[Variety] Verify that the crop dropdown is populated with crops from the database.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0396' },
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoNew();
        await form.cropPicker.openSheet();
        await expect(form.cropPicker.sheetOptionByText(cropA.name)).toBeVisible();
        await expect(form.cropPicker.sheetOptionByText(cropB.name)).toBeVisible();
    });

    test('[Variety] Verify that Save is disabled until all required fields are provided.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0397' },
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoNew();
        // FormFooter disables Save until isDirty && isValid (PET-450). Variety
        // requires Crop (FK) AND Name; both must be populated before Save enables.
        await expect(form.footer.saveButton).toBeDisabled();
        await form.nameInput.click();
        await form.nameInput.blur();
        await expect(form.footer.saveButton).toBeDisabled();
        await form.fillName('Pet450ValidName');
        // Name alone is not enough — Crop is also required.
        await expect(form.footer.saveButton).toBeDisabled();
        await form.selectCrop(cropA.id);
        await expect(form.footer.saveButton).toBeEnabled();
    });

    test('[Variety] Verify that the export identifier auto-populates from crop and name on blur.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0398' },
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoNew();
        await form.selectCrop(cropA.id);
        await expect(form.cropPicker.sheetValue).toHaveText(cropA.name);
        await form.fillName('Fuji');
        await expect(form.exportIdentifierInput).toHaveValue(`${cropA.name},Fuji`);
    });

    test('[Variety] Verify that export identifier auto-populate is skipped when the field is already filled.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0399' },
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoNew();
        await form.selectCrop(cropA.id);
        await expect(form.cropPicker.sheetValue).toHaveText(cropA.name);
        await form.exportIdentifierInput.fill('ManualValue');
        await form.fillName('Fuji');
        // Must not overwrite what the user already typed
        await expect(form.exportIdentifierInput).toHaveValue('ManualValue');
    });

    test('[Variety] Verify that Cancel returns to the list without saving.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0400' },
    }, async ({ page, pages }) => {
        const form = pages.varietyForm;
        await form.gotoNew();
        await form.nameInput.fill('ShouldNotBeSaved');
        // Once dirty, FormFooter relabels "Cancel" → "Discard changes"; clicking it
        // triggers the UnsavedChangesModal guard, and "Don't Save" abandons edits.
        await form.discardChanges();
        await page.waitForURL('**/setup/varieties');
        // List page is now DataGrid (role=grid); no <td> elements.
        await expect(pages.varietyList.grid.getRoot()).toBeVisible();
        await expect(pages.varietyList.varietyNamed('ShouldNotBeSaved')).not.toBeVisible();
    });

    test('[Variety] Verify that a duplicate name for the same crop shows a conflict error.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0401' },
    }, async ({ page, pages }) => {
        const form = pages.varietyForm;
        // Our factory variety's name collides for the same (factory) crop.
        await form.gotoNew();
        await form.selectCrop(variety.cropId);
        // Confirm React processed the selection before submitting
        await expect(form.cropPicker.sheetValue).toHaveText(cropA.name);
        await form.fillName(variety.name);
        await form.footer.submitButton.click();
        // Form must stay on the new-variety page (insert failed, not navigated away)
        await expect(page).toHaveURL(/\/setup\/varieties\/new/, { timeout: 5000 });
        // API returns 409 with the conflict message.
        await expect(form.duplicateForCropError).toBeVisible({ timeout: 10000 });
    });

});

// ── Edit Variety Form ──────────────────────────────────────────────────────────

test.describe('Edit variety form', { tag: ['@WebPet', '@wp-setup', '@wp-variety', '@WPBatch02'] }, () => {

    test('[Variety] Verify that the edit form loads the existing variety data.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0402' },
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoEdit(variety.id);
        // Wait for the async data load to complete before asserting values
        await expect(form.nameInput).toHaveValue(variety.name);
        await expect(form.codeInput).toHaveValue(variety.code);
        await expect(form.exportIdentifierInput).toHaveValue(variety.exportIdentifier);
    });

    test('[Variety] Verify that the name, barcode and export identifier are read-only.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0403' },
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoEdit(variety.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.codeInput).toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).toHaveAttribute('readonly', '');
    });

    test('[Variety] Verify that the active toggle is not disabled.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0404' },
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoEdit(variety.id);
        await form.activeSwitch.waitFor({ state: 'visible' });
        await expect(form.activeSwitch).not.toBeDisabled();
    });

    test('[Variety] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0405' },
    }, async ({ page, pages }) => {
        const form = pages.varietyForm;
        await form.gotoEdit(variety.id);
        await form.footer.cancelButton.waitFor({ state: 'visible' });
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/varieties');
    });

    test('[Variety] Verify that a nonexistent variety id shows a not-found message.', {
        tag: ['@wp-ui', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0406' },
    }, async ({ pages }) => {
        await pages.varietyForm.gotoEdit(999999);
        await expect(pages.varietyForm.notFoundMessage).toBeVisible();
    });

});
