/**
 * Equipment form-page e2e.
 *
 * Framework-aligned (Batch 03): locators live in EquipmentFormPage /
 * EquipmentListPage, and the Equipment Type ParentPicker is driven through
 * ParentPickerComponent. Action order and assertions unchanged, including the
 * two FK-selection skips.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import { ensureEquipment, deleteEquipment, type EnsuredEquipment } from './data-factory';

// This file creates its own Equipment (with a resolved Equipment Type FK) via
// the API instead of depending on a seeded "Forklift". Assert against the
// returned values. See data-factory.ts.
let equip: EnsuredEquipment;

test.beforeAll(async ({ request }) => {
    equip = await ensureEquipment(request);
});

test.afterAll(async ({ request }) => {
    if (equip) await deleteEquipment(request, equip.id);
});

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .
//
// Error handling: alert() — API errors surfaced via window.alert.

// ── New Equipment Form ─────────────────────────────────────────────────────────

test.describe('New equipment form', { tag: ['@WebPet', '@wp-setup', '@wp-equipment', '@WPBatch03'] }, () => {

    test('[Equipment] Verify that the new equipment form renders the expected fields.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0159' },
    }, async ({ pages }) => {
        const form = pages.equipmentForm;
        await form.gotoNew();
        await expect(form.nameInput).toBeVisible();
        // Equipment Type is now a ParentPicker combobox.
        await expect(form.equipmentTypePicker.comboboxInput).toBeVisible();
        await expect(form.activeCheckbox).toBeVisible();
    });

    test('[Equipment] Verify that the equipment type dropdown is populated from the database.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0160' },
    }, async ({ pages }) => {
        const form = pages.equipmentForm;
        await form.gotoNew();
        await form.equipmentTypePicker.openCombobox();
        await expect(
            form.equipmentTypePicker.comboboxOptionByText(equip.equipmentTypeName),
        ).toBeVisible();
    });

    test('[Equipment] Verify that Save is disabled until the required name and type are provided.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0161' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0162' },
    }, async ({ pages }) => {
        const form = pages.equipmentForm;
        await form.gotoNew();
        await form.fillName('TestEquip');
        await expect(form.exportIdentifierInput).toHaveValue('TestEquip');
    });

    test('[Equipment] Verify that Cancel returns to the list without saving.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0163' },
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
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0164' },
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
        await expect(form.footer.saveButton).toBeEnabled({ timeout: 10000 });
        await expect(page).toHaveURL(/\/setup\/equipments\/new/);
    });

});

// ── Edit Equipment Form ────────────────────────────────────────────────────────

test.describe('Edit equipment form', { tag: ['@WebPet', '@wp-setup', '@wp-equipment', '@WPBatch03'] }, () => {

    test('[Equipment] Verify that the edit form loads the existing equipment data.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0165' },
    }, async ({ pages }) => {
        const form = pages.equipmentForm;
        await form.gotoEdit(equip.id);
        await expect(form.nameInput).toHaveValue(equip.name);
        await expect(form.codeInput).toHaveValue(equip.code);
    });

    test('[Equipment] Verify that the name, barcode and export identifier are read-only and the type is disabled.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0166' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0167' },
    }, async ({ pages }) => {
        const form = pages.equipmentForm;
        await form.gotoEdit(equip.id);
        await form.activeCheckbox.waitFor({ state: 'visible' });
        await expect(form.activeCheckbox).not.toBeDisabled();
        await expect(form.hourlyCostInput).not.toBeDisabled();
    });

    test('[Equipment] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0168' },
    }, async ({ page, pages }) => {
        const form = pages.equipmentForm;
        await form.gotoEdit(equip.id);
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/equipments');
    });

    test('[Equipment] Verify that a nonexistent equipment id shows an error message.', {
        tag: ['@wp-ui', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0169' },
    }, async ({ pages }) => {
        await pages.equipmentForm.gotoEdit(999999);
        await expect(pages.equipmentForm.notFoundMessage).toBeVisible();
    });

});
