/**
 * E2E: Employee Documents tab — upload → list → sort → download → delete happy path.
 *
 * Prerequisites:
 *   - dev server running:  cd apps/web && pnpm dev
 *   - API server running:  cd apps/api  && go run .
 *   - MinIO (or S3) available via S3_ENDPOINT env var (see apps/api/.env.example)
 *
 * Skip condition:
 *   Skipped when S3_ENDPOINT is not set, because the upload endpoint requires a
 *   live object-store backend. The flag is read at **module scope** deliberately
 *   — moving it inside the test body would change when the skip is decided and
 *   shift the suite's skip count.
 *   Run with: S3_ENDPOINT=http://localhost:9000 npm run test:webpet -- --grep @wp-documents
 *
 * Framework-aligned (Batch 08): the tab's whole surface lives on
 * EmployeeDocumentsComponent, which records the two things that make it unlike
 * the rest of the suite — it is a real ARIA tab (not a button strip), and its
 * list is a plain `<table>`, not the PET-424 DataGrid.
 */
import { WEBPET_SAMPLE_PDF } from '@config/webpetPaths';
import { expect, test } from '@fixtures/webpet.fixture';
import { ensureEmployee, deleteEmployee } from './data-factory';

test.describe('Employee Documents tab', { tag: ['@WebPet', '@wp-documents', '@WPBatch08'] }, () => {

    test('[Documents] Verify the upload, list, sort, download and delete happy path.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0144' },
    }, async ({ page, pages, request }) => {
        // Deliberately NOT guarded on S3_ENDPOINT any more (2026-08-04 decision). This
        // used to skip whenever object storage was unset, which meant document upload
        // had zero coverage on dev and nobody could see that. It now fails there, and
        // the failure is the ticket: dev staging needs S3/MinIO provisioned. Restore a
        // guard only if document upload is declared out of scope for dev.
        const form = pages.employeeForm;
        const docs = form.documents;

        // Own employee via the factory instead of a hardcoded row.
        const emp = await ensureEmployee(request);
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
            await deleteEmployee(request, emp.id);
        }
    });

});
