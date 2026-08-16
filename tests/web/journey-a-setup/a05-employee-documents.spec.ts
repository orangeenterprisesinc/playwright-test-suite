/**
 * Employee Documents tab e2e for Catalog workflow **A5 — Employee setup**:
 * upload → list → sort → download → delete happy path.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A5 |
 * | Plan | `test-plans/journey-a/a05-employee-setup.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A5-018` |
 *
 * Relocated from `tests/webpet/employee-documents.spec.ts` (WP-0144). Every
 * assertion below is the one that spec carried, in the same order; what
 * changed is the fixture (`base.fixture`) and the id/tag vocabulary.
 *
 * Deliberately NOT guarded on `S3_ENDPOINT` (2026-08-04 decision, unchanged by
 * this move): a red here on an environment without object storage provisioned
 * is the report, not a defect to heal around.
 *
 * The tab's whole surface lives on `EmployeeDocumentsComponent`, which records
 * the two things that make it unlike the rest of the suite — it is a real
 * ARIA tab (not a button strip), and its list is a plain `<table>`, not the
 * PET-424 DataGrid.
 */
import { WEBPET_SAMPLE_PDF } from '@config/webpetPaths';
import { expect, test } from '@fixtures/base.fixture';
import { ensureEmployee, deleteEmployee } from '@data/generated/data-factory';

test.describe('Employee Documents tab', { tag: ['@JourneyA', '@A5'] }, () => {

    test('[Documents] Verify the upload, list, sort, download and delete happy path.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-018' },
            { type: 'requirement', description: 'A5-R19|A5-R20|A5-R21' },
        ],
    }, async ({ page, pages, sessionApi }) => {
        // Deliberately NOT guarded on S3_ENDPOINT any more (2026-08-04 decision). This
        // used to skip whenever object storage was unset, which meant document upload
        // had zero coverage on dev and nobody could see that. It now fails there, and
        // the failure is the ticket: dev staging needs S3/MinIO provisioned. Restore a
        // guard only if document upload is declared out of scope for dev.

        // No timeout override. A 240s one was added on the theory that this test was
        // simply the sum of six slow-but-successful round trips; that was wrong.
        // Playwright's default actionTimeout is 0, so a single unmatched locator is
        // bounded only by the test timeout and can consume the whole budget — which
        // is exactly what happened, and raising the budget only made the same hang
        // take four minutes. The global 110s is right; a longer one would mask this
        // failure mode again.

        const form = pages.employeeForm;
        const docs = form.documents;

        // Own employee via the factory instead of a hardcoded row.
        const emp = await ensureEmployee(sessionApi);
        try {
            await form.gotoEdit(emp.id);
            await form.waitForForm();

            await docs.open();

            // Pick the first available document type.
            await docs.typeSelectTrigger.click();
            await expect(docs.firstTypeOption).toBeVisible({ timeout: 5000 });
            await docs.firstTypeOption.click();

            await docs.fileInput.setInputFiles(WEBPET_SAMPLE_PDF);

            await docs.uploadButton.click();
            await expect(docs.documentCell('sample.pdf')).toBeVisible({ timeout: 15000 });

            const uploadedRow = docs.documentRow('sample.pdf');
            await expect(uploadedRow).toBeVisible();

            // Sort by Type. The assertion is intentionally lenient: what matters is
            // that sorting was triggered without crashing and the uploaded row is
            // still present. With a single row the sort is a no-op, so the
            // before/after row text is captured for diagnostic context only.
            const beforeText = await docs.firstBodyRow.textContent();
            await docs.columnSortButton('Type').click();
            // Give the sort a moment to re-render.
            await page.waitForTimeout(300);
            const afterText = await docs.firstBodyRow.textContent();
            await expect(docs.documentCell('sample.pdf')).toBeVisible();
            void beforeText;
            void afterText;

            // Download — intercept the API call and assert it returns 200.
            const [downloadResponse] = await Promise.all([
                page.waitForResponse(
                    (resp) => resp.url().includes('/documents/') && resp.url().includes('/content'),
                ),
                docs.downloadButton(uploadedRow).click(),
            ]);
            expect(downloadResponse.status()).toBe(200);

            // Delete, then confirm in the AlertDialog.
            await docs.deleteButton(uploadedRow).click();
            await expect(docs.deleteConfirmDialog).toBeVisible();
            await docs.confirmDeleteButton.click();

            // Row should be removed from the table.
            await expect(docs.documentCell('sample.pdf')).not.toBeVisible({ timeout: 10000 });
        } finally {
            await deleteEmployee(sessionApi, emp.id);
        }
    });

});
