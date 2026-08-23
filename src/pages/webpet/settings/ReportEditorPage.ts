/**
 * @fileoverview The WYSIWYG Report Editor — `/settings/reports/:reportName`
 * (WEBPET-731…740).
 *
 * Rebuilt around a popover-editor model (web-pet bfe869b10 + bb9065e1e,
 * reconfirmed live 2026-08-23). No iframe, no marker overlay, no inspector
 * rail, no page headings — everything renders inline inside
 * `data-testid="preview-sheet"`.
 *
 * Two locator families look alike and must not be conflated:
 *
 * - **Sheet triggers** — "Page Settings" / "Header" / "Table" / "Footer",
 *   `data-slot="popover-trigger"` buttons rendered ON the canvas, inside the
 *   sheet. These names are ALSO the visible section labels (WP-0314). The
 *   identical four names exist a second time, in an anchor nav OUTSIDE the
 *   sheet — {@link sheetTrigger} vs {@link navAnchor} scope to one or the
 *   other so neither trips Playwright's strict mode.
 * - **Content triggers** — "Company Name", "Address", "Edit filter summary",
 *   per-column "Column settings" / "Resize <Label> column", etc. Their
 *   accessible name is a fixed `aria-label`; the visible text is the current
 *   value, so role+name matching stays stable while the value changes.
 *
 * Most triggers open a `role=dialog` (Page Settings, Header, Table, a
 * column's Column settings); content triggers like Company Name instead open
 * an inline popover input that grabs focus pre-filled with the current value.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';

/**
 * @extends BasePage
 */
export class ReportEditorPage extends BasePage {
    readonly pageUrl: string = '/settings/reports';
    readonly pageTitle: string | RegExp = /.*/;

    /** The rendered sheet. Its bounding box is how zoom and orientation are measured. */
    readonly previewSheet: Locator;
    readonly zoomInButton: Locator;
    readonly resetZoomButton: Locator;
    /** `data-testid="report-config-save"` — disabled until the draft is dirty. */
    readonly saveButton: Locator;

    constructor(page: Page) {
        super(page);

        this.previewSheet = page.getByTestId('preview-sheet');
        this.zoomInButton = page.getByRole('button', { name: 'Zoom in' });
        this.resetZoomButton = page.getByRole('button', { name: 'Reset zoom' });
        this.saveButton = page.getByTestId('report-config-save');
    }

    /** Open the editor for a named report. */
    async gotoReport(reportName: string): Promise<void> {
        await this.page.goto(`${this.pageUrl}/${reportName}`);
    }

    /**
     * A section popover trigger rendered ON the canvas, inside the preview
     * sheet — "Page Settings" / "Header" / "Table" / "Footer". Scoping to the
     * sheet is what keeps this out of a strict-mode collision with the
     * identically-named entries in the anchor nav (see {@link navAnchor}).
     */
    sheetTrigger(name: string): Locator {
        // The sheet renders a second, plain "Footer" button besides the popover
        // trigger — the data-slot filter is what keeps this strict-mode-unique.
        return this.previewSheet
            .locator('[data-slot="popover-trigger"]')
            .and(this.previewSheet.getByRole('button', { name, exact: true }));
    }

    /** The matching entry in the anchor nav menu, outside the sheet. */
    navAnchor(name: string): Locator {
        return this.page.locator('nav').getByRole('button', { name, exact: true });
    }

    /**
     * A content-level trigger inside the sheet — e.g. "Company Name",
     * "Address", "Edit filter summary". Its accessible name is a fixed
     * aria-label while the displayed text is the current value, so exact
     * role+name matching is stable as the value changes (WP-0311).
     */
    contentTrigger(name: string): Locator {
        return this.previewSheet.getByRole('button', { name, exact: true });
    }

    /**
     * The currently-open editor dialog (Page Settings / Header / Table / a
     * column's Column settings / …). `.last()` in case a closing dialog is
     * still mid-transition in the DOM when a new one opens.
     */
    get editorDialog(): Locator {
        return this.page.getByRole('dialog').last();
    }

    /** A tab inside the open Table dialog — General / Filter Summary / Grouping / Pivot / Conditional Rules. */
    tableTab(name: string | RegExp): Locator {
        return this.editorDialog.getByRole('tab', { name });
    }

    /** All table column header cells in the sheet, in current render order (draggable — dragTo reorders, fact verified live). */
    get columnHeaders(): Locator {
        return this.previewSheet.locator('th');
    }

    /**
     * A column's "Column settings" trigger. Its accessible name is the same
     * generic "Column settings" for every column — the visible text is the
     * column label instead — so pass `label` to scope to one column's header
     * cell; omit it when any column will do (WP-0316).
     */
    columnSettingsButton(label?: string): Locator {
        const scope = label ? this.columnHeaders.filter({ hasText: label }) : this.previewSheet;
        const button = scope.getByRole('button', { name: 'Column settings', exact: true });
        return label ? button : button.first();
    }

    /** A column's resize handle — its accessible name embeds the column label. */
    resizeButton(label: string): Locator {
        return this.previewSheet.getByRole('button', { name: `Resize ${label} column`, exact: true });
    }

    /**
     * The focused inline-edit input a content trigger opens (e.g. Company
     * Name). Scoped to the popover portal so it never matches a dialog's own
     * textboxes (Label, the Header text block, …).
     */
    get inlineEditorInput(): Locator {
        // The inline editor's input carries no identifying container (plain
        // span/div ancestry, no popover slot) — focus is its only stable handle,
        // and the editor exists exactly while it is focused.
        return this.page.locator('input[data-slot="input"]:focus');
    }

    /** Scoped to the open dialog — "Orientation" is only ever meaningful inside Page Settings. */
    get orientationCombobox(): Locator {
        return this.editorDialog.getByRole('combobox', { name: /Orientation/i });
    }

    /** An option in the open Orientation combobox popup. */
    orientationOption(name: string | RegExp): Locator {
        // Base UI Select portal — items live in the [data-open] select-content,
        // not under an ARIA option role (same idiom as ScanDeviceFormPage).
        return this.page
            .locator('[data-slot="select-content"][data-open] [data-slot="select-item"]')
            .filter({ hasText: name });
    }
}

export default ReportEditorPage;
