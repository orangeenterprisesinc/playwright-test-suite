/**
 * Job Group form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when JobGroupListPage migrated to the new
 * DataGrid lib (PET-424). Form pages were not touched by that migration,
 * so the form tests below remain valid against the existing DOM.
 *
 * Framework-aligned (Batch 01): locators live in JobGroupFormPage /
 * JobGroupListPage; action order and assertions are unchanged.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import { ensureJobGroup, deleteJobGroup, type EnsuredJobGroup } from '@data/generated/data-factory';

// This file owns its own JobGroup, created fresh via the API (no dependency on
// a seeded "Hourly" row). Assert against `group.*`, never a literal — that is
// what makes the file safe to run alongside others in parallel. See
// data-factory.ts.
let group: EnsuredJobGroup;

test.beforeAll(async ({ request }) => {
    group = await ensureJobGroup(request);
});

test.afterAll(async ({ request }) => {
    if (group) await deleteJobGroup(request, group.id);
});

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .
//
// Route: /setup/jobs/groups, /setup/jobs/groups/new, /setup/jobs/groups/:id
// Only "name" is read-only after save; exportIdentifier and code remain editable.

// ── New Job Group Form ─────────────────────────────────────────────────────────

test.describe('New job group form', { tag: ['@WebPet', '@wp-setup', '@wp-job-group', '@WPBatch01'] }, () => {

    test('[Job Group] Verify that the new job group form renders the expected fields.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0219' },
    }, async ({ pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoNew();
        await expect(form.nameInput).toBeVisible();
        await expect(form.exportIdentifierInput).toBeVisible();
        await expect(form.codeInput).toBeVisible();
        // active migrated off native <select> → ActiveField Switch (#active).
        await expect(form.activeSwitch).toBeVisible();
    });

    test('[Job Group] Verify that Save is disabled until a required name is provided.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0220' },
    }, async ({ pages }) => {
        const form = pages.jobGroupForm;
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

    test('[Job Group] Verify that the export identifier auto-populates from the name on blur.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0221' },
    }, async ({ pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoNew();
        await form.fillName('TestGroup');
        await expect(form.exportIdentifierInput).toHaveValue('TestGroup');
    });

    test('[Job Group] Verify that Cancel returns to the list without saving.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0222' },
    }, async ({ page, pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoNew();
        await form.nameInput.fill('ShouldNotBeSaved');
        // Once dirty, FormFooter relabels "Cancel" → "Discard changes"; clicking it
        // triggers the UnsavedChangesModal guard, and "Don't Save" abandons edits.
        await form.discardChanges();
        await page.waitForURL('**/setup/jobs/groups');
        // List page is now DataGrid (role=grid); no <td> elements.
        await expect(pages.jobGroupList.grid.getRoot()).toBeVisible();
        await expect(pages.jobGroupList.jobGroupNamed('ShouldNotBeSaved')).not.toBeVisible();
    });

    test('[Job Group] Verify that a duplicate name keeps the user on the create form.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0223' },
    }, async ({ page, pages }) => {
        const form = pages.jobGroupForm;
        // This file's own job-group name triggers a server 409 on submit, keeping
        // us on the create form.
        await form.gotoNew();
        page.on('dialog', (d) => d.dismiss());
        await form.fillName(group.name);
        await form.footer.submitButton.click();
        await expect(form.footer.saveButton).toBeEnabled({ timeout: 10000 });
        await expect(page).toHaveURL(/\/setup\/jobs\/groups\/new/);
    });

});

// ── Edit Job Group Form ────────────────────────────────────────────────────────

test.describe('Edit job group form', { tag: ['@WebPet', '@wp-setup', '@wp-job-group', '@WPBatch01'] }, () => {

    test('[Job Group] Verify that the edit form loads the existing job group data.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0224' },
    }, async ({ pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoEdit(group.id);
        await expect(form.nameInput).toHaveValue(group.name);
        await expect(form.codeInput).toHaveValue(group.code);
    });

    test('[Job Group] Verify that the name is read-only while export identifier and code stay editable.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0225' },
    }, async ({ pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoEdit(group.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).not.toHaveAttribute('readonly', '');
        await expect(form.codeInput).not.toHaveAttribute('readonly', '');
    });

    test('[Job Group] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0226' },
    }, async ({ page, pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoEdit(group.id);
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/jobs/groups');
    });

    test('[Job Group] Verify that a nonexistent job group id shows an error message.', {
        tag: ['@wp-ui', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0227' },
    }, async ({ pages }) => {
        await pages.jobGroupForm.gotoEdit(999999);
        await expect(pages.jobGroupForm.notFoundMessage).toBeVisible();
    });

});
