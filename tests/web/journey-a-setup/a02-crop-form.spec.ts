/**
 * Crop form-page e2e for Catalog workflow **A2 — Ranch, field, crop, and
 * variety setup**.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A2 |
 * | Plan | `test-plans/journey-a/a02-ranch-field-crop-variety-setup.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A2-025`…`A2-037` |
 *
 * Relocated from `tests/webpet/crop.spec.ts` (WP-0096…WP-0108). Every
 * assertion below is the one that spec carried, in the same order and the
 * same describes; what changed is the fixture (`base.fixture`), the id/tag
 * vocabulary, and `beforeAll`/`afterAll` moving from webpet's `request`
 * fixture to `sessionApi`.
 *
 * This file provisions its one Crop in `beforeAll`, and no test here reads a
 * record another test created, so — unlike the ranch/field list files —
 * there is no need to serialize.
 *
 * The Cancel test asserts the list grid is visible *before* asserting the
 * discarded crop is absent from it: `base.fixture` pins no locale (unlike
 * `webpet.fixture`), so that positive anchor is what keeps the absence check
 * meaningful — a silently failed navigation would otherwise make the absence
 * check vacuously pass.
 */
import { expect, test } from '@fixtures/base.fixture';
import { ensureCrop, deleteCrop, type EnsuredCrop } from '@data/generated/data-factory';

// This file creates its own Crop via the API instead of depending on a shared
// "Admin" crop that may not exist in every client DB. The duplicate-name tests
// re-enter this crop's name to trigger the uniqueness check; the edit tests
// assert against its returned values.
let crop: EnsuredCrop;

test.beforeAll(async ({ sessionApi }) => {
    crop = await ensureCrop(sessionApi);
});

test.afterAll(async ({ sessionApi }) => {
    if (crop) await deleteCrop(sessionApi, crop.id);
});

// ── New Crop Form ──────────────────────────────────────────────────────────────

test.describe('New crop form', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Crop] Verify that the new crop form renders the expected fields.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-025' },
            { type: 'requirement', description: 'A2-R25' },
        ],
    }, async ({ pages }) => {
        await pages.cropForm.gotoNew();
        await expect(pages.cropForm.nameInput).toBeVisible();
        await expect(pages.cropForm.exportIdentifierInput).toBeVisible();
        // active migrated off native <select> → ActiveField Switch (#active).
        await expect(pages.cropForm.activeSwitch).toBeVisible();
    });

    test('[Crop] Verify that Save is disabled until a required name is provided.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-026' },
            { type: 'requirement', description: 'A2-R26' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-027' },
            { type: 'requirement', description: 'A2-R27' },
        ],
    }, async ({ pages }) => {
        await pages.cropForm.gotoNew();
        await pages.cropForm.fillName('TestCrop');
        await expect(pages.cropForm.exportIdentifierInput).toHaveValue('TestCrop');
    });

    test('[Crop] Verify that export identifier auto-populate is skipped when the field is already filled.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-028' },
            { type: 'requirement', description: 'A2-R28' },
        ],
    }, async ({ pages }) => {
        const form = pages.cropForm;
        await form.gotoNew();
        await form.exportIdentifierInput.fill('ManualId');
        await form.fillName('TestCrop');
        await expect(form.exportIdentifierInput).toHaveValue('ManualId');
    });

    test('[Crop] Verify that Cancel returns to the list without saving.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-029' },
            { type: 'requirement', description: 'A2-R29|A2-R30' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.cropForm;
        await form.gotoNew();
        await form.nameInput.fill('ShouldNotBeSaved');
        // Once dirty, FormFooter relabels "Cancel" → "Discard changes"; clicking it
        // triggers the UnsavedChangesModal guard, and "Don't Save" abandons edits.
        await form.discardChanges();
        await page.waitForURL('**/setup/crops');
        // Positive anchor before the negative: proves the grid actually rendered,
        // so the absence check below cannot pass because navigation silently failed.
        await expect(pages.cropList.grid.getRoot()).toBeVisible();
        await expect(pages.cropList.cropNamed('ShouldNotBeSaved')).not.toBeVisible();
    });

    test('[Crop] Verify that a duplicate name keeps the user on the create form.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-030' },
            { type: 'requirement', description: 'A2-R31' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-031' },
            { type: 'requirement', description: 'A2-R32' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-032' },
            { type: 'requirement', description: 'A2-R33' },
        ],
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

test.describe('Edit crop form', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Crop] Verify that the edit form loads the existing crop data.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-033' },
            { type: 'requirement', description: 'A2-R34' },
        ],
    }, async ({ pages }) => {
        const form = pages.cropForm;
        await form.gotoEdit(crop.id);
        await expect(form.nameInput).toHaveValue(crop.name);
        await expect(form.exportIdentifierInput).toHaveValue(crop.exportIdentifier);
    });

    test('[Crop] Verify that the name and export identifier are read-only on an existing crop.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-034' },
            { type: 'requirement', description: 'A2-R35|A2-R36' },
        ],
    }, async ({ pages }) => {
        const form = pages.cropForm;
        await form.gotoEdit(crop.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).toHaveAttribute('readonly', '');
    });

    test('[Crop] Verify that the traceability assignment sections render on the edit form.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-035' },
            { type: 'requirement', description: 'A2-R37' },
        ],
    }, async ({ pages }) => {
        // The legacy tabbed UI migrated to per-attribute AssignmentTab widgets in
        // the (edit-only) Traceability section, each headed "Include <attribute>".
        await pages.cropForm.gotoEdit(crop.id);
        await expect(pages.cropForm.traceabilitySection).toBeVisible();
    });

    test('[Crop] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-036' },
            { type: 'requirement', description: 'A2-R38' },
        ],
    }, async ({ page, pages }) => {
        await pages.cropForm.gotoEdit(crop.id);
        await pages.cropForm.footer.cancelButton.click();
        await page.waitForURL('**/setup/crops');
    });

    test('[Crop] Verify that a nonexistent crop id shows an error message.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-037' },
            { type: 'requirement', description: 'A2-R39' },
        ],
    }, async ({ pages }) => {
        await pages.cropForm.gotoEdit(999999);
        await expect(pages.cropForm.notFoundMessage).toBeVisible();
    });

});
