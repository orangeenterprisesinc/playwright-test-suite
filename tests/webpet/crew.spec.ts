/**
 * Crew form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when CrewListPage migrated to the new
 * DataGrid lib (PET-424). Form pages were not touched by that migration,
 * so the form tests below remain valid against the existing DOM.
 *
 * Framework-aligned (Batch 01): locators live in CrewFormPage / CrewListPage,
 * and the Department ParentPicker is driven through ParentPickerComponent
 * instead of the free-function helpers. Action order and assertions unchanged.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import {
    ensureCrew,
    deleteCrew,
    ensureDepartment,
    deleteDepartment,
    type EnsuredCrew,
    type EnsuredDepartment,
} from './data-factory';

// This file owns its own Crew AND its own Department, created fresh via the API
// (no dependency on a shared, hardcoded "Crew 01" / id=1 or a seeded "ADP 5"
// department). Assert against `crew.*` / `dept.*`, never a literal — that is
// what makes the file safe to run alongside others in parallel: no two files
// touch the same row. See data-factory.ts.
let crew: EnsuredCrew;
let dept: EnsuredDepartment;

test.beforeAll(async ({ request }) => {
    crew = await ensureCrew(request);
    dept = await ensureDepartment(request);
});

test.afterAll(async ({ request }) => {
    if (crew) await deleteCrew(request, crew.id);
    if (dept) await deleteDepartment(request, dept.id);
});

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .

// ── New Crew Form ──────────────────────────────────────────────────────────────

test.describe('New crew form', { tag: ['@WebPet', '@wp-setup', '@wp-crew', '@WPBatch01'] }, () => {

    test('[Crew] Verify that the new crew form renders the expected fields.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0085' },
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoNew();
        await expect(form.nameInput).toBeVisible();
        await expect(form.exportIdentifierInput).toBeVisible();
        // active migrated off native <select> → ActiveField Switch (#active).
        await expect(form.activeSwitch).toBeVisible();
        // Department is now a ParentPicker combobox.
        await expect(form.departmentPicker.comboboxInput).toBeVisible();
    });

    test('[Crew] Verify that the department dropdown is populated from the database.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0086' },
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoNew();
        // Type this file's own department name to filter the (potentially long) list
        // to it, then assert it's present — proves the dropdown is DB-backed without
        // depending on a seeded "ADP 5" row.
        await form.filterDepartments(dept.name);
        await expect(form.departmentOption(dept.name)).toBeVisible();
    });

    test('[Crew] Verify that Save is disabled until a required name is provided.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0087' },
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoNew();
        // FormFooter disables Save until isDirty && isValid (PET-450).
        await expect(form.footer.saveButton).toBeDisabled();
        await form.nameInput.click();
        await form.nameInput.blur();
        await expect(form.footer.saveButton).toBeDisabled();
        await form.nameInput.fill('Pet450ValidName');
        // Form validates on blur (mode: 'onBlur'); blur so isValid recomputes and
        // FormFooter enables Save.
        await form.nameInput.blur();
        await expect(form.footer.saveButton).toBeEnabled();
    });

    test('[Crew] Verify that the export identifier auto-populates from the name on blur.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0088' },
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoNew();
        await form.fillName('TestCrew');
        await expect(form.exportIdentifierInput).toHaveValue('TestCrew');
    });

    test('[Crew] Verify that Cancel returns to the list without saving.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0089' },
    }, async ({ page, pages }) => {
        const form = pages.crewForm;
        await form.gotoNew();
        await form.nameInput.fill('ShouldNotBeSaved');
        // Once dirty, FormFooter relabels "Cancel" → "Discard changes"; clicking it
        // triggers the UnsavedChangesModal guard, and "Don't Save" abandons edits.
        await form.discardChanges();
        await page.waitForURL('**/setup/crews');
        // List page is now DataGrid (role=grid); no <td> elements.
        await expect(pages.crewList.grid.getRoot()).toBeVisible();
        await expect(pages.crewList.crewNamed('ShouldNotBeSaved')).not.toBeVisible();
    });

});

// ── Edit Crew Form ─────────────────────────────────────────────────────────────

test.describe('Edit crew form', { tag: ['@WebPet', '@wp-setup', '@wp-crew', '@WPBatch01'] }, () => {

    test('[Crew] Verify that the edit form loads the existing crew data.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0090' },
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        await expect(form.nameInput).toHaveValue(crew.name);
    });

    test('[Crew] Verify that the name, barcode and export identifier are read-only.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0091' },
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.codeInput).toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).toHaveAttribute('readonly', '');
    });

    test('[Crew] Verify that the short name field is editable.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0092' },
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        await form.shortNameInput.waitFor({ state: 'visible' });
        await expect(form.shortNameInput).not.toHaveAttribute('readonly', '');
    });

    test('[Crew] Verify that the department dropdown is populated on the edit form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0093' },
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        // The Department combobox lists every department in the DB, independent of
        // this crew. Filter to this file's own department to prove the list is
        // DB-backed without depending on a seeded "ADP 5" row.
        await form.filterDepartments(dept.name);
        await expect(form.departmentOption(dept.name)).toBeVisible();
    });

    test('[Crew] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0094' },
    }, async ({ page, pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/crews');
    });

    test('[Crew] Verify that a nonexistent crew id shows an error message.', {
        tag: ['@wp-ui', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0095' },
    }, async ({ pages }) => {
        await pages.crewForm.gotoEdit(999999);
        await expect(pages.crewForm.notFoundMessage).toBeVisible();
    });

});
