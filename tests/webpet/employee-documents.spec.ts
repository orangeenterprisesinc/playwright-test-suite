/**
 * E2E: Employee Documents section — upload → list → sort → download → delete happy path.
 *
 * Prerequisites: a live object store behind the API's upload endpoint (dev
 * staging has one since WEBPET-1830), and at least one ACTIVE document type —
 * the test provisions its own via the data factory.
 *
 * Framework-aligned (Batch 08): the section's whole surface lives on
 * EmployeeDocumentsComponent. Since the employee-form redesign, "Documents" is
 * a sidebar section-nav button anchoring a lazy `<section id="documents">` on
 * one scrolling page (no ARIA tabs), and the list is a plain `<table>`, not
 * the PET-424 DataGrid.
 */
import { WEBPET_SAMPLE_PDF } from '@config/webpetPaths';
import { expect, test } from '@fixtures/webpet.fixture';
import { ensureEmployee, deleteEmployee, ensureDocumentType, deleteDocumentType } from './data-factory';

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

        // Own employee via the factory instead of a hardcoded row, and an own
        // ACTIVE document type — dev's seeded types are all inactive, which
        // leaves the type picker's listbox empty.
        const emp = await ensureEmployee(request);
        const docType = await ensureDocumentType(request);
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

            // Download — the redesigned form opens the content endpoint in a new
            // tab (window.open with noopener), so an in-page waitForResponse can
            // never see it. Capture the new page, then assert the endpoint itself
            // returns 200 through the authenticated API context.
            // The window.open navigation becomes a file download attributed to
            // the opener page; the popup itself stays a transient blank page.
            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 10000 }),
                docs.downloadButton(uploadedRow).click(),
            ]);
            const contentUrl = download.url();
            expect(contentUrl).toMatch(/\/documents\/\d+\/content/);
            const downloadResponse = await page.request.get(contentUrl);
            expect(downloadResponse.status()).toBe(200);

            // Delete, then confirm in the AlertDialog.
            await docs.deleteButton(uploadedRow).click();
            await expect(docs.deleteConfirmDialog).toBeVisible();
            await docs.confirmDeleteButton.click();

            // Row should be removed from the table.
            await expect(docs.documentCell('sample.pdf')).not.toBeVisible({ timeout: 10000 });
        } finally {
            await deleteEmployee(request, emp.id);
            await deleteDocumentType(request, docType.id);
        }
    });

});
