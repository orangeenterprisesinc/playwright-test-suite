/**
 * @fileoverview The Employee form's Documents tab — upload, list, sort,
 * download, delete.
 *
 * The only place in the converted suite that drives a **file upload through a
 * visible input** and a `<table>` rather than the DataGrid. Two details worth
 * recording:
 *
 * - **This tab is a real ARIA tab** (`role=tab`), unlike the Job form's tab strip
 *   which is ordinary buttons. The two are not interchangeable.
 * - **The document list is a plain table** (`<thead>`/`<tbody>`/`<td>`), not
 *   `[role="grid"]` — it predates the PET-424 DataGrid migration, so
 *   `WebpetDataGridComponent` does not apply here.
 *
 * The row-action buttons are icon-only and are addressed by `aria-label`, which
 * is their only accessible handle.
 *
 * @module components/webpet/EmployeeDocumentsComponent
 */
import { Locator, Page } from '@playwright/test';
import { BaseComponent } from '../BaseComponent';

/**
 * @class EmployeeDocumentsComponent
 * @extends BaseComponent
 */
export class EmployeeDocumentsComponent extends BaseComponent {
    /** The tab that reveals this panel. A real ARIA tab. */
    readonly tab: Locator;
    /** Document-type Select trigger. First on the panel. */
    readonly typeSelectTrigger: Locator;
    /** The file input. Visible here, unlike the profile avatar's hidden one. */
    readonly fileInput: Locator;
    /** Commits the chosen file. */
    readonly uploadButton: Locator;
    /** The first body row — used to detect that a sort re-ordered the table. */
    readonly firstBodyRow: Locator;
    /** The confirmation dialog raised by a delete. */
    readonly deleteConfirmDialog: Locator;

    constructor(page: Page) {
        super(page, page.locator('table'));

        this.tab = page.getByRole('tab', { name: 'Documents' });
        this.typeSelectTrigger = page.locator('[data-slot="select-trigger"]').first();
        this.fileInput = page.locator('input[type="file"]');
        this.uploadButton = page.locator('button:has-text("Upload")');
        this.firstBodyRow = page.locator('tbody tr:first-child');
        this.deleteConfirmDialog = page.getByRole('alertdialog');
    }

    /** The first option in the open document-type Select. */
    get firstTypeOption(): Locator {
        return this.page.locator('[data-slot="select-item"]').first();
    }

    /** A cell containing `filename` — the "did the upload land" signal. */
    documentCell(filename: string): Locator {
        return this.page.locator(`td:has-text("${filename}")`);
    }

    /** The table row for `filename`, from which the row actions hang. */
    documentRow(filename: string): Locator {
        return this.page.locator('tr', { hasText: filename });
    }

    /** A sortable column header button, e.g. `'Type'`. */
    columnSortButton(label: string): Locator {
        return this.page.locator('thead button', { hasText: label });
    }

    /** A row's icon-only Download button, addressed by its `aria-label`. */
    downloadButton(row: Locator): Locator {
        return row.locator('button[aria-label="Download"]');
    }

    /** A row's icon-only Delete button, addressed by its `aria-label`. */
    deleteButton(row: Locator): Locator {
        return row.locator('button[aria-label="Delete"]');
    }

    /**
     * The dialog's confirm action.
     *
     * `.last()` because the row's own Delete button is still in the DOM and
     * shares the accessible name — the dialog's copy is the later one.
     */
    get confirmDeleteButton(): Locator {
        return this.page.getByRole('button', { name: 'Delete' }).last();
    }

    /** Open the Documents tab. */
    async open(): Promise<void> {
        await this.tab.click();
    }
}

export default EmployeeDocumentsComponent;
