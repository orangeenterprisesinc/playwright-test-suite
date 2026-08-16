/**
 * Crew form-page e2e for Catalog workflow **A4 — Crew setup**.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A4 |
 * | Plan | `test-plans/journey-a/a04-crew-setup.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A4-002`…`A4-012` |
 *
 * Relocated from `tests/webpet/crew.spec.ts` (WP-0085…WP-0095). Every
 * assertion below is the one that spec carried, in the same order and the
 * same describes; what changed is the fixture (`base.fixture`), the id/tag
 * vocabulary, and `beforeAll`/`afterAll` moving from webpet's `request`
 * fixture to `sessionApi`.
 *
 * List-page coverage for Crew lives in `a04-setup-list-smoke.spec.ts`
 * (CrewListPage migrated to the DataGrid lib under PET-424); form pages were
 * not touched by that migration, so the form tests below remain valid
 * against the existing DOM.
 *
 * Two tests (`A4-002`, `A4-007`) both carried web-pet's `@wp-smoke` tag; a
 * journey file allows at most one `@Smoke`, so `A4-007` (the edit form
 * loading saved data) keeps it and `A4-002` (the new-form render) demotes to
 * `['@HighLevel', '@Regression']`.
 */
import { expect, test } from '@fixtures/base.fixture';
import {
    ensureCrew,
    deleteCrew,
    ensureDepartment,
    deleteDepartment,
    type EnsuredCrew,
    type EnsuredDepartment,
} from '@data/generated/data-factory';

// This file owns its own Crew AND its own Department, created fresh via the API
// (no dependency on a shared, hardcoded "Crew 01" / id=1 or a seeded "ADP 5"
// department). Assert against `crew.*` / `dept.*`, never a literal — that is
// what makes the file safe to run alongside others in parallel: no two files
// touch the same row. See data-factory.ts.
let crew: EnsuredCrew;
let dept: EnsuredDepartment;

test.beforeAll(async ({ sessionApi }) => {
    crew = await ensureCrew(sessionApi);
    dept = await ensureDepartment(sessionApi);
});

test.afterAll(async ({ sessionApi }) => {
    if (crew) await deleteCrew(sessionApi, crew.id);
    if (dept) await deleteDepartment(sessionApi, dept.id);
});

// ── New Crew Form ──────────────────────────────────────────────────────────────

test.describe('New crew form', { tag: ['@JourneyA', '@A4'] }, () => {

    test('[Crew] Verify that the new crew form renders the expected fields.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4-002' },
            { type: 'requirement', description: 'A4-R1' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4-003' },
            { type: 'requirement', description: 'A4-R2' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4-004' },
            { type: 'requirement', description: 'A4-R3' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4-005' },
            { type: 'requirement', description: 'A4-R4' },
        ],
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoNew();
        await form.fillName('TestCrew');
        await expect(form.exportIdentifierInput).toHaveValue('TestCrew');
    });

    test('[Crew] Verify that Cancel returns to the list without saving.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4-006' },
            { type: 'requirement', description: 'A4-R5|A4-R6' },
        ],
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

test.describe('Edit crew form', { tag: ['@JourneyA', '@A4'] }, () => {

    test('[Crew] Verify that the edit form loads the existing crew data.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4-007' },
            { type: 'requirement', description: 'A4-R7' },
        ],
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        await expect(form.nameInput).toHaveValue(crew.name);
    });

    test('[Crew] Verify that the name, barcode and export identifier are read-only.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4-008' },
            { type: 'requirement', description: 'A4-R8' },
        ],
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.codeInput).toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).toHaveAttribute('readonly', '');
    });

    test('[Crew] Verify that the short name field is editable.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4-009' },
            { type: 'requirement', description: 'A4-R9' },
        ],
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        await form.shortNameInput.waitFor({ state: 'visible' });
        await expect(form.shortNameInput).not.toHaveAttribute('readonly', '');
    });

    test('[Crew] Verify that the department dropdown is populated on the edit form.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4-010' },
            { type: 'requirement', description: 'A4-R10' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4-011' },
            { type: 'requirement', description: 'A4-R11' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/crews');
    });

    test('[Crew] Verify that a nonexistent crew id shows an error message.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4-012' },
            { type: 'requirement', description: 'A4-R12' },
        ],
    }, async ({ pages }) => {
        await pages.crewForm.gotoEdit(999999);
        await expect(pages.crewForm.notFoundMessage).toBeVisible();
    });

});
