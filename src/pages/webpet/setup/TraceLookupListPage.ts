/**
 * @fileoverview Traceability lookup list pages (`/setup/traceability/*`).
 *
 * One concrete class rather than a subclass per lookup: Grade, Method,
 * Packaging Style, Pool, Region, Storage and Warehouse are sibling clones
 * sharing the same TraceLookupItem structure, and Size differs only by carrying
 * extra columns — which are asserted through the grid's `columnHeader()`, not
 * through page-object members.
 *
 * Everything grid-shaped lives on {@link WebpetDataGridComponent}; this class
 * exists to bind the route and heading.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class TraceLookupListPage extends WebpetListPage {
    constructor(page: Page, listUrl: string, headingName: string) {
        super(page, listUrl, headingName);
    }

    /** A record name anywhere on the list. Page-scoped, matching the lifted specs. */
    itemNamed(name: string): Locator {
        return this.page.getByText(name);
    }
}

export default TraceLookupListPage;
