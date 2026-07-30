/**
 * @fileoverview The five Inventory Setup list pages (PET-207…PET-210, PET-215).
 *
 * One concrete class rather than five near-identical subclasses: Item Type,
 * Item, Center, Unit Type and Unit differ only in route and heading, and every
 * one of their specs asserts exactly the same three things — the placeholder is
 * gone, the heading renders, the create affordance is present.
 *
 * The `inventory-stub-page` testid is the point of these tests. Each route was
 * originally an `InventoryStubPage` placeholder; the assertion that it has
 * **zero** matches is what proves the real list page shipped, and it would still
 * pass vacuously if the heading check were dropped — hence both.
 *
 * @module pages/webpet/setup/InventoryListPage
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @class InventoryListPage
 * @extends WebpetListPage
 */
export class InventoryListPage extends WebpetListPage {
    /**
     * The placeholder that these routes used to render. Asserted to have zero
     * matches — it exists here only to be checked as absent.
     */
    readonly stubPage: Locator;
    /**
     * The create affordance, matched on an href **suffix**.
     *
     * Deliberately different from the DataGrid list pages, which match a prefix
     * because they propagate URL state onto outbound links. These screens do
     * not, and the lifted specs use `$=` — widening it here would be a silent
     * behaviour change. It is targeted by href at all because the control is a
     * Button-rendered-as-link, so `getByRole('link', …)` does not match it.
     */
    readonly newLink: Locator;

    /**
     * @param page Playwright page
     * @param listUrl Relative list URL, e.g. `'/setup/inventory/centers'`
     * @param headingName The page's `<h1>` text, e.g. `'Inventory Centers'`
     */
    constructor(page: Page, listUrl: string, headingName: string) {
        super(page, listUrl, headingName);

        this.stubPage = page.getByTestId('inventory-stub-page');
        this.newLink = page.locator(`a[href$="${listUrl}/new"]`).first();
    }
}

export default InventoryListPage;
