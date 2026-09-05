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
import {
    ensureJobGroup,
    deleteJobGroup,
    ensureJob,
    deleteJob,
    uniqueName,
    type EnsuredJobGroup,
    type EnsuredJob,
} from './data-factory';

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
// Name and Code (the auto-generated barcode, WEBPET-2682) are both read-only
// after save; exportIdentifier is the only field that stays editable.

// ── New Job Group Form ─────────────────────────────────────────────────────────

test.describe('New job group form', { tag: ['@WebPet', '@wp-setup', '@wp-job-group', '@WPBatch01'] }, () => {

    // Own record, unlike `group` (owned by the file-level beforeAll/afterAll):
    // this test creates a second job group via the UI, so it cleans up its own.
    let extraGroupId: number | null = null;

    test.afterEach(async ({ request }) => {
        if (extraGroupId != null) {
            await deleteJobGroup(request, extraGroupId);
            extraGroupId = null;
        }
    });

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

    test('[Job Group] Verify that leaving Code blank on create auto-generates a barcode.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0409' },
    }, async ({ page, pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoNew();
        await form.fillName(uniqueName('WP2682JG'));
        // Code is left blank — WEBPET-2682 shipped the server auto-generating it.
        expect(await form.submit()).toBe('created');

        const match = page.url().match(/\/setup\/jobs\/groups\/(\d+)/);
        expect(match, 'URL should contain the new job group id after save').not.toBeNull();
        extraGroupId = parseInt(match![1]!, 10);

        // Code is read-only on edit (WP-0225); read the generated value, never type it.
        await expect(form.codeInput).toHaveValue(/^\d+$/);
    });

});

// ── Edit Job Group Form ────────────────────────────────────────────────────────

test.describe('Edit job group form', { tag: ['@WebPet', '@wp-setup', '@wp-job-group', '@WPBatch01'] }, () => {

    // This file's own Job — assigned to `group` and cleaned up here rather than
    // via a shared seeded row, so the assignment test is safe in parallel.
    let assignedJob: EnsuredJob;

    test.beforeAll(async ({ request }) => {
        assignedJob = await ensureJob(request);
    });

    test.afterAll(async ({ request }) => {
        if (assignedJob) await deleteJob(request, assignedJob.id);
    });

    test('[Job Group] Verify that the edit form loads the existing job group data.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0224' },
    }, async ({ pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoEdit(group.id);
        await expect(form.nameInput).toHaveValue(group.name);
        await expect(form.codeInput).toHaveValue(group.code);
    });

    test('[Job Group] Verify that name and code are read-only while export identifier stays editable.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0225' },
    }, async ({ pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoEdit(group.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        // Code is the barcode, and WEBPET-2682 made it auto-generated on create; it
        // locks on edit so the generated value cannot be overwritten. That brought Job
        // Group in line with crew/department/employee/equipment/job/variety; customer is
        // now the only setup entity left asserting an editable code.
        await expect(form.codeInput).toHaveAttribute('readonly', '');
        // The attribute is markup; this is the guarantee it exists for.
        await expect(form.codeInput).not.toBeEditable();
        // Export identifier is a mapping field, not identity — it stays editable.
        await expect(form.exportIdentifierInput).not.toHaveAttribute('readonly', '');
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

    test('[Job Group] Verify that an assigned Job persists across a reload.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0410' },
    }, async ({ page, pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoEdit(group.id);
        await form.waitForForm();
        await form.addJob(assignedJob.name);
        await expect(form.footer.saveButtonExact).toBeEnabled();

        // Wait on the actual PUT rather than on-page state: this screen's post-save
        // navigation isn't confirmed (some setup forms stay put, others return to
        // the list), so the response is the one deterministic "it's done" signal.
        const saveResponse = page.waitForResponse(
            (res) => res.url().includes(`/api/job-groups/${group.id}`) && res.request().method() === 'PUT',
        );
        await form.footer.saveButtonExact.click();
        expect((await saveResponse).ok()).toBe(true);

        // Re-open the edit form and hard-reload so only server state, never
        // on-page cache, can satisfy this assertion.
        await form.gotoEdit(group.id);
        await page.reload();
        await form.waitForForm();
        await expect(form.jobRow(assignedJob.name)).toBeVisible();
    });

    test('[Job Group] Verify that Duplicate Record opens a prefilled new form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0411' },
    }, async ({ page, pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoEdit(group.id);
        await expect(form.duplicateRecordButton).toBeVisible();
        // duplicateRecord() waits for the record to land before clicking — the
        // handler is `record && navigate(...)`, so an early click does nothing.
        await form.duplicateRecord();
        await expect(page).toHaveURL(/\/setup\/jobs\/groups\/new/);
        await expect(form.nameInput).toHaveValue(group.name);
        // WEBPET-2682: the deployed bundle's mount effect reads
        // reset({...toFormValues(src), code: null, jobs: []}) — i.e. Code and the
        // Jobs grid should clear on duplicate — but live dev clears neither (a
        // probe duplicating a group with barcode 15839 plus one assigned job showed
        // both still present on the resulting new form). That discrepancy is open
        // with product, so this test deliberately asserts neither behaviour — do
        // not "fix" it by adding one.
    });

});
