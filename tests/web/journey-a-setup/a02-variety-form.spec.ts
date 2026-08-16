/**
 * Variety form-page e2e for Catalog workflow **A2 — Ranch, field, crop, and
 * variety setup**.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A2 |
 * | Plan | `test-plans/journey-a/a02-ranch-field-crop-variety-setup.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A2-038`…`A2-049` |
 *
 * Relocated from `tests/webpet/variety.spec.ts` (WP-0395…WP-0406). Every
 * assertion below is the one that spec carried, in the same order and the
 * same describes; what changed is the fixture (`base.fixture`), the id/tag
 * vocabulary, and `beforeAll`/`afterAll` moving from webpet's `request`
 * fixture to `sessionApi`.
 *
 * This file provisions two Crops and a Variety in `beforeAll`, and no test
 * here reads a record another test created, so — unlike the ranch/field list
 * files — there is no need to serialize.
 *
 * The Cancel test asserts the list grid is visible *before* asserting the
 * discarded variety is absent from it: `base.fixture` pins no locale (unlike
 * `webpet.fixture`), so that positive anchor is what keeps the absence check
 * meaningful — a silently failed navigation would otherwise make the absence
 * check vacuously pass.
 */
import { expect, test } from '@fixtures/base.fixture';
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
// values.
let cropA: EnsuredCrop; // has the variety
let cropB: EnsuredCrop; // second crop, for the dropdown test
let variety: EnsuredVariety;

test.beforeAll(async ({ sessionApi }) => {
    cropA = await ensureCrop(sessionApi);
    cropB = await ensureCrop(sessionApi);
    variety = await ensureVariety(sessionApi, { cropId: cropA.id });
});

test.afterAll(async ({ sessionApi }) => {
    if (variety) await deleteVariety(sessionApi, variety.id);
    if (cropA) await deleteCrop(sessionApi, cropA.id);
    if (cropB) await deleteCrop(sessionApi, cropB.id);
});

// ── New Variety Form ───────────────────────────────────────────────────────────

test.describe('New variety form', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Variety] Verify that the new variety form renders all expected fields.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-038' },
            { type: 'requirement', description: 'A2-R40' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-039' },
            { type: 'requirement', description: 'A2-R41' },
        ],
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoNew();
        await form.cropPicker.openSheet();
        await expect(form.cropPicker.sheetOptionByText(cropA.name)).toBeVisible();
        await expect(form.cropPicker.sheetOptionByText(cropB.name)).toBeVisible();
    });

    test('[Variety] Verify that Save is disabled until all required fields are provided.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-040' },
            { type: 'requirement', description: 'A2-R42|A2-R43' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-041' },
            { type: 'requirement', description: 'A2-R44' },
        ],
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoNew();
        await form.selectCrop(cropA.id);
        await expect(form.cropPicker.sheetValue).toHaveText(cropA.name);
        await form.fillName('Fuji');
        await expect(form.exportIdentifierInput).toHaveValue(`${cropA.name},Fuji`);
    });

    test('[Variety] Verify that export identifier auto-populate is skipped when the field is already filled.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-042' },
            { type: 'requirement', description: 'A2-R45' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-043' },
            { type: 'requirement', description: 'A2-R46|A2-R47' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.varietyForm;
        await form.gotoNew();
        await form.nameInput.fill('ShouldNotBeSaved');
        // Once dirty, FormFooter relabels "Cancel" → "Discard changes"; clicking it
        // triggers the UnsavedChangesModal guard, and "Don't Save" abandons edits.
        await form.discardChanges();
        await page.waitForURL('**/setup/varieties');
        // Positive anchor before the negative: proves the grid actually rendered,
        // so the absence check below cannot pass because navigation silently failed.
        await expect(pages.varietyList.grid.getRoot()).toBeVisible();
        await expect(pages.varietyList.varietyNamed('ShouldNotBeSaved')).not.toBeVisible();
    });

    test('[Variety] Verify that a duplicate name for the same crop shows a conflict error.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-044' },
            { type: 'requirement', description: 'A2-R48' },
        ],
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

test.describe('Edit variety form', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Variety] Verify that the edit form loads the existing variety data.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-045' },
            { type: 'requirement', description: 'A2-R49' },
        ],
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoEdit(variety.id);
        // Wait for the async data load to complete before asserting values
        await expect(form.nameInput).toHaveValue(variety.name);
        await expect(form.codeInput).toHaveValue(variety.code);
        await expect(form.exportIdentifierInput).toHaveValue(variety.exportIdentifier);
    });

    test('[Variety] Verify that the name, barcode and export identifier are read-only.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-046' },
            { type: 'requirement', description: 'A2-R50|A2-R51' },
        ],
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoEdit(variety.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.codeInput).toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).toHaveAttribute('readonly', '');
    });

    test('[Variety] Verify that the active toggle is not disabled.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-047' },
            { type: 'requirement', description: 'A2-R52' },
        ],
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoEdit(variety.id);
        await form.activeSwitch.waitFor({ state: 'visible' });
        await expect(form.activeSwitch).not.toBeDisabled();
    });

    test('[Variety] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-048' },
            { type: 'requirement', description: 'A2-R53' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.varietyForm;
        await form.gotoEdit(variety.id);
        await form.footer.cancelButton.waitFor({ state: 'visible' });
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/varieties');
    });

    test('[Variety] Verify that a nonexistent variety id shows a not-found message.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-049' },
            { type: 'requirement', description: 'A2-R54' },
        ],
    }, async ({ pages }) => {
        await pages.varietyForm.gotoEdit(999999);
        await expect(pages.varietyForm.notFoundMessage).toBeVisible();
    });

});
