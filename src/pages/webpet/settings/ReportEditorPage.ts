/**
 * @fileoverview The WYSIWYG Report Editor — `/settings/reports/:reportName`
 * (WEBPET-731…740).
 *
 * Structurally unlike anything else in the suite: the preview is a **sandboxed
 * iframe** running an agent script, and the host reflects the iframe's selection
 * back onto its own DOM. So there are two locator families here and they must not
 * be mixed up:
 *
 * - **Host-side** — `[data-active-area]`, `[data-marker-area]`,
 *   `[data-inspector-area]`, `preview-sheet`. Plain page locators.
 * - **Frame-side** — `[data-area]`, `th[data-col-id]`, and any preview text.
 *   Reached through {@link previewFrame}, a `FrameLocator`.
 *
 * The `data-*` hooks are the stable contract between the two: the agent posts a
 * selection across the bridge and the host paints `data-active-area`. Asserting
 * on rendered text instead would not distinguish "the bridge works" from "the
 * iframe happens to contain that string".
 *
 * The inspector opens on a **numbered section index**; each entry drills into an
 * area editor, and Back returns to the index. There is no left nav.
 *
 * @module pages/webpet/settings/ReportEditorPage
 */
import { FrameLocator, Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';

/**
 * @class ReportEditorPage
 * @extends BasePage
 */
export class ReportEditorPage extends BasePage {
    readonly pageUrl: string = '/settings/reports';
    readonly pageTitle: string | RegExp = /.*/;

    // ── Host-side ───────────────────────────────────────────────────
    /** The preview iframe element itself — for attribute assertions. */
    readonly previewIframe: Locator;
    /** The rendered sheet. Its bounding box is how zoom and orientation are measured. */
    readonly previewSheet: Locator;
    /** The branding Company Name field, in the Header area editor. */
    readonly companyNameInput: Locator;
    readonly zoomInButton: Locator;
    readonly resetZoomButton: Locator;
    readonly orientationCombobox: Locator;

    constructor(page: Page) {
        super(page);

        this.previewIframe = page.locator('iframe').first();
        this.previewSheet = page.getByTestId('preview-sheet');
        this.companyNameInput = page.getByRole('textbox', { name: /Company Name/i });
        this.zoomInButton = page.getByRole('button', { name: 'Zoom in' });
        this.resetZoomButton = page.getByRole('button', { name: 'Reset zoom' });
        this.orientationCombobox = page.getByRole('combobox', { name: /Orientation/i });
    }

    /** Open the editor for a named report. */
    async gotoReport(reportName: string): Promise<void> {
        await this.page.goto(`${this.pageUrl}/${reportName}`);
    }

    /** The page heading, which names the report being edited. */
    editHeading(reportName: string): Locator {
        return this.page.getByRole('heading', {
            name: new RegExp(`Edit ${reportName} Report`, 'i'),
        });
    }

    /** The host's reflection of the iframe's current selection. */
    activeArea(area: string): Locator {
        return this.page.locator(`[data-active-area="${area}"]`);
    }

    /**
     * A numbered marker in the host overlay.
     *
     * `.first()` matches the lifted spec: an area can carry more than one marker
     * and the tests only ever drive the first.
     */
    marker(area: string): Locator {
        return this.page.locator(`[data-marker-area="${area}"]`).first();
    }

    /** An open area editor in the right-hand inspector Sheet. */
    inspector(area: string): Locator {
        return this.page.locator(`[data-inspector-area="${area}"]`);
    }

    /**
     * An entry on the inspector's section index, or its Back control.
     *
     * The index and its area editors share the button role, which is why these are
     * matched by name rather than by position.
     */
    indexButton(name: string | RegExp): Locator {
        return this.page.getByRole('button', { name });
    }

    /** A tab inside the Table area editor — Columns / Sorting / Grouping / Pivot. */
    tableTab(name: string | RegExp): Locator {
        return this.page.getByRole('tab', { name });
    }

    /** An option in the open Orientation combobox. */
    orientationOption(name: string | RegExp): Locator {
        return this.page.getByRole('option', { name });
    }

    // ── Frame-side ──────────────────────────────────────────────────

    /** The preview's frame. Everything below is scoped to it. */
    get previewFrame(): FrameLocator {
        return this.page.frameLocator('iframe');
    }

    /** An editable region *inside* the preview — the click target the agent sees. */
    frameArea(area: string): Locator {
        return this.previewFrame.locator(`[data-area="${area}"]`).first();
    }

    /** The preview table's column headers, in render order. */
    get frameColumnHeaders(): Locator {
        return this.previewFrame.locator('th[data-col-id]');
    }

    /** Text rendered inside the preview — used to prove a draft edit propagated. */
    frameText(text: string): Locator {
        return this.previewFrame.getByText(text).first();
    }
}

export default ReportEditorPage;
