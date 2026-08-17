/**
 * Equipment form-page e2e for Catalog workflow **A12 — Equipment setup**.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/journey-a/a12-equipment-setup.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A12-002`…`A12-012` |
 *
 * Relocated from `tests/webpet/equipment.spec.ts` (WP-0159…WP-0169). Every
 * assertion below is the one that spec carried, in the same order and the
 * same describes; what changed is the fixture (`base.fixture`), the id/tag
 * vocabulary, and `beforeAll`/`afterAll` moving from webpet's `request`
 * fixture to `sessionApi`.
 */
import { expect, test } from '@fixtures/base.fixture';
import { ensureEquipment, deleteEquipment, type EnsuredEquipment } from '@data/generated/data-factory';

// This file creates its own Equipment (with a resolved Equipment Type FK) via
// the API instead of depending on a seeded "Forklift". Assert against the
// returned values. See data-factory.ts.
let equip: EnsuredEquipment;

test.beforeAll(async ({ sessionApi }) => {
    equip = await ensureEquipment(sessionApi);
});

test.afterAll(async ({ sessionApi }) => {
    if (equip) await deleteEquipment(sessionApi, equip.id);
});

// ── New Equipment Form ─────────────────────────────────────────────────────────

test.describe('New equipment form', { tag: ['@JourneyA', '@A12'] }, () => {

    test('[Equipment] Verify that the new equipment form renders the expected fields.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A12-002' },
            { type: 'requirement', description: 'A12-R1' },
        ],
    }, async ({ pages }) => {
        const form = pages.equipmentForm;
        await form.gotoNew();
        await expect(form.nameInput).toBeVisible();
        // Equipment Type is now a ParentPicker combobox.
        await expect(form.equipmentTypePicker.comboboxInput).toBeVisible();
        await expect(form.activeCheckbox).toBeVisible();
    });

    test('[Equipment] Verify that the equipment type dropdown is populated from the database.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A12-003' },
            { type: 'requirement', description: 'A12-R2' },
        ],
    }, async ({ pages }) => {
        const form = pages.equipmentForm;
        await form.gotoNew();
        await form.equipmentTypePicker.openCombobox();
        await expect(
            form.equipmentTypePicker.comboboxOptionByText(equip.equipmentTypeName),
        ).toBeVisible();
    });

    test('[Equipment] Verify that Save is disabled until the required name and type are provided.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A12-004' },
            { type: 'requirement', description: 'A12-R3' },
        ],
    }, async ({ pages }) => {
        // Un-skipped 2026-08-06: the skip's premise ("no shared helper selects a
        // combobox value") went stale — pickEquipmentType() uses comboboxItemByText,
        // the variant that registers the selection with react-hook-form.
        const form = pages.equipmentForm;
        await form.gotoNew();
        // FormFooter disables Save until isDirty && isValid (PET-450).
        await expect(form.footer.saveButton).toBeDisabled();
        await form.nameInput.click();
        await form.nameInput.blur();
        await expect(form.footer.saveButton).toBeDisabled();
        await form.fillName('Pet450ValidName');
        // Name alone is not enough — Equipment Type (FK) is also required on new.
        await expect(form.footer.saveButton).toBeDisabled();
        await form.pickEquipmentType(equip.equipmentTypeName);
        await expect(form.footer.saveButton).toBeEnabled();
    });

    test('[Equipment] Verify that the export identifier auto-populates from the name on blur.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A12-005' },
            { type: 'requirement', description: 'A12-R4' },
        ],
    }, async ({ pages }) => {
        const form = pages.equipmentForm;
        await form.gotoNew();
        await form.fillName('TestEquip');
        await expect(form.exportIdentifierInput).toHaveValue('TestEquip');
    });

    test('[Equipment] Verify that Cancel returns to the list without saving.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A12-006' },
            { type: 'requirement', description: 'A12-R5' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.equipmentForm;
        await form.gotoNew();
        await form.nameInput.fill('ShouldNotBeSaved');
        await form.discardChanges();
        await page.waitForURL('**/setup/equipments');
        // List page is now DataGrid (role=grid); no <td> elements.
        await expect(pages.equipmentList.grid.getRoot()).toBeVisible();
        await expect(pages.equipmentList.equipmentNamed('ShouldNotBeSaved')).not.toBeVisible();
    });

    test('[Equipment] Verify that a duplicate name keeps the user on the create form.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A12-007' },
            { type: 'requirement', description: 'A12-R6|A12-R7' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.equipmentForm;
        // This file's own equipment name triggers the server 409 on submit —
        // was the DelLlano-only literal 'Forklift', which dev does not seed.
        await form.gotoNew();
        page.on('dialog', (d) => d.dismiss());
        await form.fillName(equip.name);
        await form.pickEquipmentType(equip.equipmentTypeName);
        // Wait for the Save gate to open before clicking it — same race that made
        // WP-0232 pass locally and time out in CI (see job.spec.ts).
        await expect(form.footer.saveButton).toBeEnabled();
        await form.footer.submitButton.click();

        // Assert the failure is reported at all — same reasoning as WP-0232 in
        // job.spec.ts: "Save came back and the URL held" also describes a form where
        // nothing whatsoever was shown to the user.
        //
        // Deliberately NOT asserting the message text here. Job names its conflict
        // ("A job with this Name already exists…"), but this form was observed
        // showing "Couldn't reach the server. Check your connection." for a request
        // the API answers 409 in ~1.6s — pinning that string would enshrine wording
        // that looks wrong, and pinning the right string would fail. See the note on
        // this row in the plan (`test-plans/journey-a/a12-equipment-setup.md`).
        await expect(pages.toasts.errorToasts.first()).toBeVisible({ timeout: 10000 });

        await expect(form.footer.saveButton).toBeEnabled({ timeout: 10000 });
        await expect(page).toHaveURL(/\/setup\/equipments\/new/);
    });

});

// ── Edit Equipment Form ────────────────────────────────────────────────────────

test.describe('Edit equipment form', { tag: ['@JourneyA', '@A12'] }, () => {

    test('[Equipment] Verify that the edit form loads the existing equipment data.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A12-008' },
            { type: 'requirement', description: 'A12-R8' },
        ],
    }, async ({ pages }) => {
        const form = pages.equipmentForm;
        await form.gotoEdit(equip.id);
        await expect(form.nameInput).toHaveValue(equip.name);
        await expect(form.codeInput).toHaveValue(equip.code);
    });

    test('[Equipment] Verify that the name, barcode and export identifier are read-only and the type is disabled.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A12-009' },
            { type: 'requirement', description: 'A12-R9' },
        ],
    }, async ({ pages }) => {
        const form = pages.equipmentForm;
        await form.gotoEdit(equip.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.codeInput).toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).toHaveAttribute('readonly', '');
        // Equipment Type (ParentPicker combobox) is disabled on existing records —
        // a combobox, so `disabled`, never `readonly`.
        await expect(form.equipmentTypePicker.comboboxInput).toBeDisabled();
    });

    test('[Equipment] Verify that the active checkbox and hourly cost are editable.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A12-010' },
            { type: 'requirement', description: 'A12-R10' },
        ],
    }, async ({ pages }) => {
        const form = pages.equipmentForm;
        await form.gotoEdit(equip.id);
        await form.activeCheckbox.waitFor({ state: 'visible' });
        await expect(form.activeCheckbox).not.toBeDisabled();
        await expect(form.hourlyCostInput).not.toBeDisabled();
    });

    test('[Equipment] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A12-011' },
            { type: 'requirement', description: 'A12-R11' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.equipmentForm;
        await form.gotoEdit(equip.id);
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/equipments');
    });

    test('[Equipment] Verify that a nonexistent equipment id shows an error message.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A12-012' },
            { type: 'requirement', description: 'A12-R12' },
        ],
    }, async ({ pages }) => {
        await pages.equipmentForm.gotoEdit(999999);
        await expect(pages.equipmentForm.notFoundMessage).toBeVisible();
    });

});
