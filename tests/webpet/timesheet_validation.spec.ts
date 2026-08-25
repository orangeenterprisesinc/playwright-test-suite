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
 *
 * Every guard below carries a **reason**. A blank-reason skip reads as deliberate,
 * and two of these were once misread as evidence that the create had succeeded,
 * which sent the WEBPET-1436 / BUG-11 investigation down the wrong path twice.
 *
 * `mode: 'serial'` (below) was deliberately withheld while BUG-11/WEBPET-1798
 * (the soft-deleted-name-collision 500) kept the create test failing — a
 * file-wide serial group would have abandoned every test after it, costing
 * more coverage than running unordered did. Re-enabled 2026-08-05 now that the
 * create passes: with a passing create, serial is the better config for this
 * coupling and costs nothing.
 */
import { expect, test } from '@fixtures/webpet.fixture';

test.describe.configure({ mode: 'serial' });

// Suffixed with a run-unique token: the literal names below were the exact
// rows BUG-11/WEBPET-1798's own bug repro soft-deleted on dev, and a
// soft-deleted row permanently occupies its name (the fix changed 500->409,
// it did not free the name) — so the bare literals would collide forever.
const RUN_TOKEN = Date.now().toString(36).slice(-6).toUpperCase();
const TEST_NAME = `_PET202TestValidation_${RUN_TOKEN}`;
const TEST_NAME_2 = `_PET202TestValidation2_${RUN_TOKEN}`;

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
    }, async ({ pages, request }) => {
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
        // submit() resolves against WebpetFormPage.editUrlPattern (<listUrl>/<id>), so
        // 'created' means the app actually navigated. The previous hand-rolled
        // waitForURL('**/validations/**') also matched the /new page we were already
        // on, resolved instantly, and left the assertions below running against the
        // unsaved create form — which reported this as "name is not read-only".
        expect(await form.submit()).toBe('created');
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
        test.skip(
            !listResp.ok(),
            `GET /api/validations returned HTTP ${listResp.status()}; cannot locate the record ` +
            `the create test makes.`,
        );
        const items = (await listResp.json()) as ValidationRow[];
        const rec = items.find((v) => v.name === TEST_NAME);
        test.skip(
            !rec,
            `no active validation named "${TEST_NAME}" — the create test (WP-0385) did not ` +
            `produce it, so there is nothing to open.`,
        );

        if (!(await form.gotoEditOrForbidden(rec!.validationCounter))) return;
        await expect(form.nameInput).toHaveAttribute('readonly', '');
    });

    test('[Validation] Verify that the audit log page loads for an existing record.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0387' },
    }, async ({ pages, request }) => {
        const form = pages.timeSheetValidationForm;
        const listResp = await request.get('/api/validations');
        test.skip(
            !listResp.ok(),
            `GET /api/validations returned HTTP ${listResp.status()}; cannot locate the record ` +
            `the create test makes.`,
        );
        const items = (await listResp.json()) as ValidationRow[];
        const rec = items.find((v) => v.name === TEST_NAME);
        test.skip(
            !rec,
            `no active validation named "${TEST_NAME}" — the create test (WP-0385) did not ` +
            `produce it, so there is no audit log to open.`,
        );

        // The audit log is a dedicated page (validations/:id/audit →
        // ValidationAuditLogPage), not an inline section on the edit form anymore.
        if (!(await form.gotoAuditOrForbidden(rec!.validationCounter))) return;
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

        try {
            // Filtered lookup: the deleted list is past the grid's 100-row
            // virtualization threshold, so the newest row is not in the DOM.
            if (!(await list.gotoDeletedOrForbidden())) return;
            await list.grid.waitForGrid();
            await list.grid.revealRowWithText(TEST_NAME_2);
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
            await list.grid.revealRowWithText(TEST_NAME_2);
            await expect(list.grid.cellByText(TEST_NAME_2)).toHaveCount(0);
        } finally {
            // No purge endpoint for Validation (WEBPET-1798): a record left
            // soft-deleted by a failed assert would occupy its name forever.
            const stillDeletedResp = await request.get('/api/validations/deleted');
            if (stillDeletedResp.ok()) {
                const stillDeleted = (await stillDeletedResp.json()) as ValidationRow[];
                const stuck = stillDeleted.find((v) => v.name === TEST_NAME_2);
                if (stuck) {
                    await request.post(
                        `/api/validations/${String(stuck.validationCounter)}/restore`,
                        { data: { rowversion: stuck.version } },
                    );
                }
            }
        }

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
