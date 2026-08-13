/**
 * @fileoverview Ranch list — `/setup/ranches`.
 *
 * The richest list screen in the suite: inline cell editing (Active toggle,
 * Department FK combobox, WorkerCompCode text), multi-row selection with
 * propagate-or-not, Undo via the SelectedRowsBar, and sort/filter state
 * reflected in the URL. Everything grid-shaped lives on
 * {@link WebpetDataGridComponent}; only the ranch-specific bits are here.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class RanchListPage extends WebpetListPage {
    /**
     * The page title.
     *
     * Asserted as document text rather than a heading role: the title is
     * rendered through `setPageHeader(...)` into a slot, so the role query is
     * not reliable here. `.first()` because the word also appears in the
     * sidebar.
     */
    readonly titleText: Locator;
    /**
     * The historic "Ranchs" typo. Asserted **absent** — this is a regression
     * guard, so the locator exists purely to be checked as not-visible.
     */
    readonly misspelledTitle: Locator;

    constructor(page: Page) {
        super(page, '/setup/ranches', 'Ranches');

        this.titleText = page.getByText('Ranches', { exact: true }).first();
        this.misspelledTitle = page.getByText('Ranchs', { exact: true });
    }
}

export default RanchListPage;
