/**
 * Smoke + CRUD tests for PET-202 (TimeSheet Validation, TimeSheetEntry
 * module-gated).
 *
 * When the TimeSheetEntry module is not in PT_MODULES every route here returns
 * 403. The page objects' `goto*OrForbidden` helpers report that so the spec can
 * still pass in dev environments without the module enabled.
 *
 * Prerequisites (with TimeSheetEntry enabled):
 *   - dev server running:  cd apps/web && pnpm dev
 *   - API server running:  cd apps/api && go run .
 *   - PT_MODULES env includes "TimeSheetEntry"
 *
 * No multi-update specs — Validation has no bulk-edit fields (no Active column).
 *
 * Framework-aligned (Batch 09): locators live in
 * TimeSheetValidationListPage / TimeSheetValidationFormPage. This was the last
 * consumer of the `type { Page }` re-export from tests/webpet/fixtures.ts, which
 * the module-gate helpers made unnecessary.
 *
 * ## Cross-test coupling, preserved deliberately
 *
 * The edit-form tests read a record the create test made, and the delete/restore
 * test cleans up both. That is order-dependent and would not be written this way
 * today — but rewriting it would change what runs, so it stays. The `test.skip()`
 * guards are what keep it honest when the earlier test did not run.
 */
import { expect, test } from '@fixtures/webpet.fixture';

const TEST_NAME = '_PET202TestValidation';
const TEST_NAME_2 = '_PET202TestValidation2';

interface ValidationRow {
    validationCounter: number;
    name: string;
    version: string;
}

// ── List Page ──────────────────────────────────────────────────────────────────

test.describe('Setup > TimeSheet Validation — list page', { tag: ['@WebPet', '@wp-setup', '@wp-validation', '@WPBatch09'] }, () => {

    test('[Validation] Verify that the list page renders, or that the module is absent from the sidebar.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0379' },
    }, async ({ pages }) => {
        const list = pages.timeSheetValidationList;
        if (!(await list.gotoOrForbidden())) {
            // Module off: the sidebar link must not be visible either.
            await pages.shell.gotoDashboard();
            await expect(pages.shell.navLinkMatching(/timesheet setup/i)).toHaveCount(0);
            return;
        }
        await expect(list.heading).toBeVisible();
        await expect(list.newLink).toBeVisible();
    });

    test('[Validation] Verify that the Name column header is visible.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0380' },
    }, async ({ pages }) => {
        const list = pages.timeSheetValidationList;
        if (!(await list.gotoOrForbidden())) return;
        await list.grid.waitForGrid();
        await expect(list.grid.columnHeader(/^Name/)).toBeVisible();
    });

    test('[Validation] Verify that filtering by name narrows the results.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0381' },
    }, async ({ pages }) => {
        const list = pages.timeSheetValidationList;
        if (!(await list.gotoOrForbidden())) return;
        await list.grid.waitForGrid();
        // Filter to something unlikely to match, so the grid is empty.
        await list.grid.textFilter(0).fill('zzz_unlikely_match');
        await expect(list.grid.cellByText('zzz_unlikely_match')).toHaveCount(0);
    });

});

// ── New Form ───────────────────────────────────────────────────────────────────

test.describe('Setup > TimeSheet Validation — new form', { tag: ['@WebPet', '@wp-setup', '@wp-validation', '@WPBatch09'] }, () => {

    test('[Validation] Verify that the new form renders the name field.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0382' },
    }, async ({ pages }) => {
        const form = pages.timeSheetValidationForm;
        if (!(await form.gotoNewOrForbidden())) return;
        await expect(form.nameInput).toBeVisible();
    });

    test('[Validation] Verify that Save is disabled until a required name is provided.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0383' },
    }, async ({ pages }) => {
        const form = pages.timeSheetValidationForm;
        if (!(await form.gotoNewOrForbidden())) return;
        // FormFooter disables Save until isDirty && isValid (PET-451).
        await expect(form.footer.saveButton).toBeDisabled();
        await form.nameInput.click();
        await form.nameInput.blur();
        await expect(form.footer.saveButton).toBeDisabled();
        await form.nameInput.fill('Pet451ValidName');
        // mode: 'onBlur' — validation (and thus isValid → Save-enabled) only runs on
        // blur, so blur before asserting Save is enabled.
        await form.nameInput.blur();
        await expect(form.footer.saveButton).toBeEnabled();
    });

    test('[Validation] Verify that Cancel returns to the list.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0384' },
    }, async ({ page, pages }) => {
        const form = pages.timeSheetValidationForm;
        if (!(await form.gotoNewOrForbidden())) return;
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/timesheet/validations');
    });

    test('[Validation] Verify that creating a validation navigates to the edit form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0385' },
    }, async ({ page, pages, request }) => {
        const form = pages.timeSheetValidationForm;
        if (!(await form.gotoNewOrForbidden())) return;

        // Clean up any pre-existing test record from a prior interrupted run.
        const existing = await request.get('/api/validations');
        if (existing.ok()) {
            const items = (await existing.json()) as ValidationRow[];
            const prior = items.find((v) => v.name === TEST_NAME);
            if (prior) {
                await request.delete(`/api/validations/${String(prior.validationCounter)}`, {
                    data: { rowversion: prior.version },
                });
            }
        }

        // fillName blurs, which runs onBlur validation so the submit button enables.
        await form.fillName(TEST_NAME);
        await form.footer.submitButton.click();
        // Should navigate to the edit form after successful create.
        await page.waitForURL('**/setup/timesheet/validations/**');
        await expect(form.nameInput).toHaveValue(TEST_NAME);
        // Name is read-only after first save.
        await expect(form.nameInput).toHaveAttribute('readonly', '');
    });

});

// ── Edit Form ──────────────────────────────────────────────────────────────────

test.describe('Setup > TimeSheet Validation — edit form', { tag: ['@WebPet', '@wp-setup', '@wp-validation', '@WPBatch09'] }, () => {

    test('[Validation] Verify that the name is read-only on an existing record.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0386' },
    }, async ({ pages, request }) => {
        const form = pages.timeSheetValidationForm;
        // Fetch the record the create test made — see the file header on coupling.
        const listResp = await request.get('/api/validations');
        if (!listResp.ok()) return;
        const items = (await listResp.json()) as ValidationRow[];
        const rec = items.find((v) => v.name === TEST_NAME);
        if (!rec) {
            test.skip();
            return;
        }

        if (!(await form.gotoEditOrForbidden(rec.validationCounter))) return;
        await expect(form.nameInput).toHaveAttribute('readonly', '');
    });

    test('[Validation] Verify that the audit log page loads for an existing record.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0387' },
    }, async ({ pages, request }) => {
        const form = pages.timeSheetValidationForm;
        const listResp = await request.get('/api/validations');
        if (!listResp.ok()) return;
        const items = (await listResp.json()) as ValidationRow[];
        const rec = items.find((v) => v.name === TEST_NAME);
        if (!rec) {
            test.skip();
            return;
        }

        // The audit log is a dedicated page (validations/:id/audit →
        // ValidationAuditLogPage), not an inline section on the edit form anymore.
        if (!(await form.gotoAuditOrForbidden(rec.validationCounter))) return;
        await expect(form.auditHeading).toBeVisible();
    });

    test('[Validation] Verify that a nonexistent id shows an error message.', {
        tag: ['@wp-ui', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0388' },
    }, async ({ pages }) => {
        const form = pages.timeSheetValidationForm;
        if (!(await form.gotoEditOrForbidden(999999999))) return;
        await expect(form.notFoundMessage).toBeVisible({ timeout: 10000 });
    });

});

// ── Soft Delete + Restore ──────────────────────────────────────────────────────

test.describe('Setup > TimeSheet Validation — soft delete and restore', { tag: ['@WebPet', '@wp-setup', '@wp-validation', '@WPBatch09'] }, () => {

    test('[Validation] Verify that a record can be soft-deleted and restored, with the deleted list reflecting both.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0389' },
    }, async ({ page, pages, request }) => {
        const list = pages.timeSheetValidationList;

        // Create a fresh record for this test.
        const createResp = await request.post('/api/validations', {
            data: { name: TEST_NAME_2 },
        });
        if (!createResp.ok()) {
            // If it already exists, fall through and find it below.
            const listResp = await request.get('/api/validations');
            if (!listResp.ok()) return;
        }

        const listResp = await request.get('/api/validations');
        if (!listResp.ok()) return;
        const items = (await listResp.json()) as ValidationRow[];
        const rec = items.find((v) => v.name === TEST_NAME_2);
        if (!rec) return;

        // Soft-delete via API.
        const deleteResp = await request.delete(`/api/validations/${String(rec.validationCounter)}`, {
            data: { rowversion: rec.version },
        });
        expect(deleteResp.status()).toBe(204);

        // Deleted list should show the record.
        if (!(await list.gotoDeletedOrForbidden())) return;
        await list.grid.waitForGrid();
        await expect(list.grid.cellByText(TEST_NAME_2)).toBeVisible();

        // Restore.
        const deletedResp = await request.get('/api/validations/deleted');
        if (!deletedResp.ok()) return;
        const deletedItems = (await deletedResp.json()) as ValidationRow[];
        const deletedRec = deletedItems.find((v) => v.name === TEST_NAME_2);
        if (!deletedRec) return;

        const restoreResp = await request.post(
            `/api/validations/${String(deletedRec.validationCounter)}/restore`,
            { data: { rowversion: deletedRec.version } },
        );
        expect(restoreResp.status()).toBe(204);

        // After restore the record leaves the deleted list.
        await page.reload();
        await list.grid.waitForGrid();
        await expect(list.grid.cellByText(TEST_NAME_2)).toHaveCount(0);

        // Cleanup — soft-delete both test records again.
        for (const name of [TEST_NAME_2, TEST_NAME]) {
            const after = await request.get('/api/validations');
            if (!after.ok()) continue;
            const afterItems = (await after.json()) as ValidationRow[];
            const afterRec = afterItems.find((v) => v.name === name);
            if (afterRec) {
                await request.delete(`/api/validations/${String(afterRec.validationCounter)}`, {
                    data: { rowversion: afterRec.version },
                });
            }
        }
    });

});
