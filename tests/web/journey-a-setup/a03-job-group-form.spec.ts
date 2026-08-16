/**
 * Job Group form-page e2e for Catalog workflow **A3 — Job setup and earning
 * codes**.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A3 |
 * | Plan | `test-plans/journey-a/a03-job-setup-and-earning-codes.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A3-013`…`A3-021` (continues the `A3-R…` requirement family started in `a03-job-form.spec.ts`) |
 *
 * Relocated from `tests/webpet/job-group.spec.ts` (WP-0219…WP-0227). Every
 * assertion below is the one that spec carried, in the same order and the
 * same describes; what changed is the fixture (`base.fixture`), the id/tag
 * vocabulary, and `beforeAll`/`afterAll` moving from webpet's `request`
 * fixture to `sessionApi`.
 *
 * Route: /setup/jobs/groups, /setup/jobs/groups/new, /setup/jobs/groups/:id
 * Only "name" is read-only after save; exportIdentifier and code remain editable.
 *
 * `A3-017` (the duplicate-name test) is a deliberate non-repair: it shares a
 * hole that its job-form sibling (`A3-006`) fixed — no assertion on the
 * surfaced error message, just that the create form stays reachable —
 * closing that gap needs live browser probing, so it is relocated verbatim,
 * including its `page.on('dialog')` dismiss handler.
 *
 * Two tests (`A3-013`, `A3-018`) both carried web-pet's `@wp-smoke` tag; a
 * journey file allows at most one `@Smoke`, so `A3-018` (the edit form
 * loading saved data) keeps it and `A3-013` (the new-form render) demotes to
 * `['@HighLevel', '@Regression']`.
 */
import { expect, test } from '@fixtures/base.fixture';
import { ensureJobGroup, deleteJobGroup, type EnsuredJobGroup } from '@data/generated/data-factory';

// This file owns its own JobGroup, created fresh via the API (no dependency on
// a seeded "Hourly" row). Assert against `group.*`, never a literal — that is
// what makes the file safe to run alongside others in parallel. See
// data-factory.ts.
let group: EnsuredJobGroup;

test.beforeAll(async ({ sessionApi }) => {
    group = await ensureJobGroup(sessionApi);
});

test.afterAll(async ({ sessionApi }) => {
    if (group) await deleteJobGroup(sessionApi, group.id);
});

// ── New Job Group Form ─────────────────────────────────────────────────────────

test.describe('New job group form', { tag: ['@JourneyA', '@A3'] }, () => {

    test('[Job Group] Verify that the new job group form renders the expected fields.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-013' },
            { type: 'requirement', description: 'A3-R18' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-014' },
            { type: 'requirement', description: 'A3-R19' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-015' },
            { type: 'requirement', description: 'A3-R20' },
        ],
    }, async ({ pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoNew();
        await form.fillName('TestGroup');
        await expect(form.exportIdentifierInput).toHaveValue('TestGroup');
    });

    test('[Job Group] Verify that Cancel returns to the list without saving.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-016' },
            { type: 'requirement', description: 'A3-R21|A3-R22' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-017' },
            { type: 'requirement', description: 'A3-R23' },
        ],
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

test.describe('Edit job group form', { tag: ['@JourneyA', '@A3'] }, () => {

    test('[Job Group] Verify that the edit form loads the existing job group data.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-018' },
            { type: 'requirement', description: 'A3-R24' },
        ],
    }, async ({ pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoEdit(group.id);
        await expect(form.nameInput).toHaveValue(group.name);
        await expect(form.codeInput).toHaveValue(group.code);
    });

    test('[Job Group] Verify that the name is read-only while export identifier and code stay editable.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-019' },
            { type: 'requirement', description: 'A3-R25|A3-R26' },
        ],
    }, async ({ pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoEdit(group.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).not.toHaveAttribute('readonly', '');
        await expect(form.codeInput).not.toHaveAttribute('readonly', '');
    });

    test('[Job Group] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-020' },
            { type: 'requirement', description: 'A3-R27' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.jobGroupForm;
        await form.gotoEdit(group.id);
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/jobs/groups');
    });

    test('[Job Group] Verify that a nonexistent job group id shows an error message.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-021' },
            { type: 'requirement', description: 'A3-R28' },
        ],
    }, async ({ pages }) => {
        await pages.jobGroupForm.gotoEdit(999999);
        await expect(pages.jobGroupForm.notFoundMessage).toBeVisible();
    });

});
