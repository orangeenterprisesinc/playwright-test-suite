/**
 * Department form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when DepartmentListPage migrated to the new
 * DataGrid lib (PET-424). Form pages were not touched by that migration,
 * so the form tests below remain valid against the existing DOM.
 *
 * DelLlano migration (WEBPET-831): the "ADP 5" fixture is resolved by NAME —
 * DelLlano identity ids differ from the legacy PetData ids this spec was first
 * authored against, so we never hardcode a DepartmentCounter. Field selectors
 * were updated for the shared components (ActiveField Switch / shadcn Select /
 * Checkbox), and the onBlur-validation + dirty-Cancel (UnsavedChangesModal)
 * patterns mirror employee.spec.ts. Seed: tests/webpet/seed/delllano-e2e-seed.sql.
 *
 * Framework-aligned (Batch 01): locators live in DepartmentFormPage /
 * DepartmentListPage; action order and assertions are unchanged.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import { ensureDepartment, deleteDepartment, type EnsuredDepartment } from './data-factory';

// This file creates its own Department via the API (cloned from an existing
// record so the ~10 create-time validators are satisfied by construction)
// instead of depending on a seeded "ADP 5". Assert against the returned values.
// See data-factory.ts.
let dept: EnsuredDepartment;

test.beforeAll(async ({ request }) => {
    dept = await ensureDepartment(request);
});

test.afterAll(async ({ request }) => {
    if (dept) await deleteDepartment(request, dept.id);
});

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .

// ── New Department Form ────────────────────────────────────────────────────────

test.describe('New department form', { tag: ['@WebPet', '@wp-setup', '@wp-department', '@WPBatch01'] }, () => {

    test('[Department] Verify that the new department form renders the expected fields.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0134' },
    }, async ({ pages }) => {
        const form = pages.departmentForm;
        await form.gotoNew();
        await expect(form.nameInput).toBeVisible();
        await expect(form.exportIdentifierInput).toBeVisible();
        // Active/firstDayofWeek/crewRequired migrated off native <select>:
        //   active        → ActiveField Switch (role=switch, rendered in page header)
        //   firstDayofWeek → shadcn Select (SelectTrigger, role=combobox button)
        //   crewRequired   → shadcn Checkbox (role=checkbox button)
        await expect(form.activeSwitch).toBeVisible();
        await expect(form.firstDayOfWeekSelect).toBeVisible();
        await expect(form.crewRequiredCheckbox).toBeVisible();
    });

    test('[Department] Verify that Save is disabled until a required name is provided.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0135' },
    }, async ({ pages }) => {
        const form = pages.departmentForm;
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

    test('[Department] Verify that the export identifier auto-populates from the name on blur.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0136' },
    }, async ({ pages }) => {
        const form = pages.departmentForm;
        await form.gotoNew();
        await form.fillName('TestDept');
        await expect(form.exportIdentifierInput).toHaveValue('TestDept');
    });

    test('[Department] Verify that Cancel returns to the list without saving.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0137' },
    }, async ({ page, pages }) => {
        const form = pages.departmentForm;
        await form.gotoNew();
        await form.nameInput.fill('ShouldNotBeSaved');
        // Once the form is dirty, FormFooter relabels the footer's "Cancel" button
        // to "Discard changes"; clicking it triggers the UnsavedChangesModal
        // navigation guard, and "Don't Save" abandons edits and proceeds to the list.
        await form.discardChanges();
        await page.waitForURL('**/setup/departments');
        // List page is now DataGrid (role=grid); no <td> elements.
        await expect(pages.departmentList.grid.getRoot()).toBeVisible();
        await expect(pages.departmentList.departmentNamed('ShouldNotBeSaved')).not.toBeVisible();
    });

    test('[Department] Verify that a duplicate name keeps the user on the create form.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0138' },
    }, async ({ page, pages }) => {
        const form = pages.departmentForm;
        // Our factory department already exists; error shown inline.
        await form.gotoNew();
        page.on('dialog', (d) => d.dismiss());
        // Blur so the form validates (mode: 'onBlur') and the submit button enables.
        await form.fillName(dept.name);
        await form.footer.submitButton.click();
        await expect(form.footer.saveButton).toBeEnabled({ timeout: 10000 });
        await expect(page).toHaveURL(/\/setup\/departments\/new/);
    });

});

// ── Edit Department Form ───────────────────────────────────────────────────────

test.describe('Edit department form', { tag: ['@WebPet', '@wp-setup', '@wp-department', '@WPBatch01'] }, () => {

    test('[Department] Verify that the edit form loads the existing department data.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0139' },
    }, async ({ pages }) => {
        const form = pages.departmentForm;
        await form.gotoEdit(dept.id);
        await expect(form.nameInput).toHaveValue(dept.name);
        await expect(form.codeInput).toHaveValue(dept.code);
    });

    test('[Department] Verify that the name, barcode and export identifier are read-only.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0140' },
    }, async ({ pages }) => {
        const form = pages.departmentForm;
        await form.gotoEdit(dept.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.codeInput).toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).toHaveAttribute('readonly', '');
    });

    test('[Department] Verify that the first-day-of-week and crew-required controls stay editable.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0141' },
    }, async ({ pages }) => {
        const form = pages.departmentForm;
        await form.gotoEdit(dept.id);
        // firstDayofWeek → SelectTrigger button, crewRequired → Checkbox button
        // (migrated off native <select>). Both enabled on the edit form.
        await form.firstDayOfWeekSelect.waitFor({ state: 'visible' });
        await expect(form.firstDayOfWeekSelect).not.toBeDisabled();
        await expect(form.crewRequiredCheckbox).not.toBeDisabled();
    });

    test('[Department] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0142' },
    }, async ({ page, pages }) => {
        const form = pages.departmentForm;
        await form.gotoEdit(dept.id);
        // Form is pristine on load (not dirty), so Cancel navigates straight to the
        // list without the UnsavedChangesModal guard.
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/departments');
    });

    test('[Department] Verify that a nonexistent department id shows an error message.', {
        tag: ['@wp-ui', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0143' },
    }, async ({ pages }) => {
        await pages.departmentForm.gotoEdit(999999);
        await expect(pages.departmentForm.notFoundMessage).toBeVisible();
    });

});
