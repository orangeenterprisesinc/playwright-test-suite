// spec: test-plans/screens/records.md
// seed: tests/seed.spec.ts

/**
 * Department form-page e2e — form-only coverage (list-page coverage moved to
 * setup-batch-b-smoke.spec.ts before this migration; not carried here).
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/screens/records.md` |
 * | Runner rows | `src/data/runner/screens.csv` → `SCR-095`…`SCR-104` |
 *
 * Relocated from `tests/webpet/department.spec.ts` (WP-0134…WP-0143). Every
 * assertion below is the one that spec carried, in the same order and the same
 * describes; what changed is the fixture (`base.fixture`), the id and tag
 * vocabulary, and `beforeAll`/`afterAll` moving from webpet's `request`
 * fixture to `sessionApi` — see the note in `customer.spec.ts`, which carries
 * the same change and the fixture-runner justification.
 *
 * This file creates its own Department via the API (cloned from an existing
 * record so the ~10 create-time validators are satisfied by construction)
 * instead of depending on a seeded "ADP 5". Assert against the returned
 * values. See `src/data/generated/data-factory.ts`.
 */
import { expect, test } from '@fixtures/base.fixture';
import { ensureDepartment, deleteDepartment, type EnsuredDepartment } from '@data/generated/data-factory';

let dept: EnsuredDepartment;

test.beforeAll(async ({ sessionApi }) => {
    dept = await ensureDepartment(sessionApi);
});

test.afterAll(async ({ sessionApi }) => {
    if (dept) await deleteDepartment(sessionApi, dept.id);
});

// ── New Department Form ────────────────────────────────────────────────────────

test.describe('New department form', { tag: ['@Screens', '@Records'] }, () => {

    test('[Department] Verify that the new department form renders the expected fields.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-095' },
            { type: 'requirement', description: 'SCR-R120' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-096' },
            { type: 'requirement', description: 'SCR-R121' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-097' },
            { type: 'requirement', description: 'SCR-R122' },
        ],
    }, async ({ pages }) => {
        const form = pages.departmentForm;
        await form.gotoNew();
        await form.fillName('TestDept');
        await expect(form.exportIdentifierInput).toHaveValue('TestDept');
    });

    test('[Department] Verify that Cancel returns to the list without saving.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-098' },
            { type: 'requirement', description: 'SCR-R123|SCR-R124' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.departmentForm;
        await form.gotoNew();
        await form.nameInput.fill('ShouldNotBeSaved');
        // Once the form is dirty, FormFooter relabels the footer's "Cancel" button
        // to "Discard changes"; clicking it triggers the UnsavedChangesModal
        // navigation guard, and "Don't Save" abandons edits and proceeds to the list.
        await form.discardChanges();
        await page.waitForURL('**/setup/departments');
        // Positive anchor before the negative: proves the grid actually rendered,
        // so the absence check below cannot pass because navigation silently failed.
        await expect(pages.departmentList.grid.getRoot()).toBeVisible();
        await expect(pages.departmentList.departmentNamed('ShouldNotBeSaved')).not.toBeVisible();
    });

    test('[Department] Verify that a duplicate name keeps the user on the create form.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-099' },
            { type: 'requirement', description: 'SCR-R125' },
        ],
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

test.describe('Edit department form', { tag: ['@Screens', '@Records'] }, () => {

    test('[Department] Verify that the edit form loads the existing department data.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-100' },
            { type: 'requirement', description: 'SCR-R126' },
        ],
    }, async ({ pages }) => {
        const form = pages.departmentForm;
        await form.gotoEdit(dept.id);
        await expect(form.nameInput).toHaveValue(dept.name);
        await expect(form.codeInput).toHaveValue(dept.code);
    });

    test('[Department] Verify that the name, barcode and export identifier are read-only.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-101' },
            { type: 'requirement', description: 'SCR-R127' },
        ],
    }, async ({ pages }) => {
        const form = pages.departmentForm;
        await form.gotoEdit(dept.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.codeInput).toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).toHaveAttribute('readonly', '');
    });

    test('[Department] Verify that the first-day-of-week and crew-required controls stay editable.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-102' },
            { type: 'requirement', description: 'SCR-R128' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-103' },
            { type: 'requirement', description: 'SCR-R129' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.departmentForm;
        await form.gotoEdit(dept.id);
        // Form is pristine on load (not dirty), so Cancel navigates straight to the
        // list without the UnsavedChangesModal guard.
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/departments');
    });

    test('[Department] Verify that a nonexistent department id shows an error message.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-104' },
            { type: 'requirement', description: 'SCR-R130' },
        ],
    }, async ({ pages }) => {
        await pages.departmentForm.gotoEdit(999999);
        await expect(pages.departmentForm.notFoundMessage).toBeVisible();
    });

});
