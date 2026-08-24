/**
 * @fileoverview The Employee form's Documents section — upload, list, sort,
 * download, delete.
 *
 * The only place in the converted suite that drives a **file upload through a
 * visible input** and a `<table>` rather than the DataGrid. Two details worth
 * recording:
 *
 * - **This is a sidebar section-nav BUTTON, not an ARIA tab.** The redesigned
 *   employee form has no `role="tab"` elements at all — "Documents" is a plain
 *   `<button>` (sibling of Run Info / Rate History / Code Badge History /
 *   Assignment History / Job Rates / I-9) that scroll-anchors to
 *   `<section id="documents">` on one long scrolling page, the same pattern as
 *   `WebpetFormPage.formTab`. It does not swap panels the way a real tab strip
 *   would.
 * - **The document list is a plain table** (`<thead>`/`<tbody>`/`<td>`), not
 *   `[role="grid"]` — it predates the PET-424 DataGrid migration, so
 *   `WebpetDataGridComponent` does not apply here.
 *
 * The section lazy-loads: it renders a "Loading…" placeholder until it is
 * activated/scrolled into view, then mounts its real content. `open()` waits
 * for a firm content signal (the file input) rather than for the placeholder
 * to disappear, in case the placeholder node is removed rather than hidden.
 *
 * The row-action buttons are icon-only and are addressed by `aria-label`, which
 * is their only accessible handle.
 *
 * NOTE: everything below the nav button is a best-effort realignment from the
 * documented DOM facts (section id, H2, lazy "Loading…" placeholder) — the
 * section's *internal* markup (select, file input, table, sort headers,
 * dialog) was not observed live. Locators marked "guess" below are the most
 * likely shape per the repo's existing Select/table idioms and should be
 * corrected against a real trace/snapshot before being trusted blindly.
 */
import { Locator, Page } from '@playwright/test';
import { BaseComponent } from '../BaseComponent';

/**
 * @extends BaseComponent
 */
export class EmployeeDocumentsComponent extends BaseComponent {
    /** The sidebar section-nav button that scroll-anchors to this section. Page-scoped: it lives outside `section#documents`, in the sidebar. */
    readonly tab: Locator;
    /** Document-type Select trigger, scoped to the section. GUESS: assumes exactly one select in this section, unlike the page-wide first-select collision the old selector had. */
    readonly typeSelectTrigger: Locator;
    /** The file input. Visible here, unlike the profile avatar's hidden one. */
    readonly fileInput: Locator;
    /** Commits the chosen file. GUESS: exact accessible name unconfirmed. */
    readonly uploadButton: Locator;
    /** The first body row — used to detect that a sort re-ordered the table. */
    readonly firstBodyRow: Locator;
    /**
     * The confirmation dialog raised by a delete.
     *
     * Deliberately page-scoped, not section-scoped: base-ui/Radix-style
     * alertdialogs typically portal to `document.body`, outside `section#documents`.
     */
    readonly deleteConfirmDialog: Locator;

    constructor(page: Page) {
        super(page, page.locator('section#documents'));

        this.tab = page.getByRole('button', { name: 'Documents' });
        this.typeSelectTrigger = this.locator('[data-slot="select-trigger"]');
        this.fileInput = this.locator('input[type="file"]');
        this.uploadButton = this.getByRole('button', { name: /upload/i });
        this.firstBodyRow = this.locator('tbody tr:first-child');
        this.deleteConfirmDialog = page.getByRole('alertdialog');
    }

    /** The first option in the open document-type Select, scoped to the open portal. */
    get firstTypeOption(): Locator {
        return this.page.locator('[data-slot="select-content"] [data-slot="select-item"]').first();
    }

    /** A cell containing `filename` — the "did the upload land" signal. */
    documentCell(filename: string): Locator {
        return this.locator(`td:has-text("${filename}")`);
    }

    /** The table row for `filename`, from which the row actions hang. */
    documentRow(filename: string): Locator {
        return this.locator('tr').filter({ hasText: filename });
    }

    /**
     * A sortable column header button, e.g. `'Type'`.
     *
     * The header buttons carry `aria-label="Sort ascending"` — that label IS
     * their accessible name, so `getByRole('button', { name: 'Type' })` can
     * never match. Filter on the visible column text instead.
     */
    columnSortButton(label: string): Locator {
        return this.locator('thead').getByRole('button').filter({ hasText: label });
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
     * The dialog's confirm action, scoped to the dialog itself.
     *
     * Scoping (rather than the old page-wide `.last()`) is what actually
     * resolves the collision with the row's own Delete button — the row button
     * is not inside `deleteConfirmDialog`, so no ambiguity remains once scoped.
     */
    get confirmDeleteButton(): Locator {
        return this.deleteConfirmDialog.getByRole('button', { name: 'Delete' });
    }

    /**
     * Open the Documents section and wait for its lazy content to mount.
     *
     * Clicking the nav button only scroll-anchors to `section#documents`; the
     * section itself renders a "Loading…" placeholder until activated. The file
     * input is the firmest "real content is here" signal available without a
     * confirmed placeholder selector.
     */
    async open(): Promise<void> {
        await this.tab.click();
        await this.fileInput.waitFor({ state: 'visible', timeout: 15000 });
    }
}

export default EmployeeDocumentsComponent;
