/**
 * @fileoverview Variety list — `/setup/varieties`.
 *
 * @module pages/webpet/setup/VarietyListPage
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @class VarietyListPage
 * @extends WebpetListPage
 */
export class VarietyListPage extends WebpetListPage {
    constructor(page: Page) {
        super(page, '/setup/varieties', 'Varieties');
    }

    /**
     * A variety name anywhere on the list, used to assert a discarded record was
     * never saved. Page-scoped, matching the lifted spec.
     */
    varietyNamed(name: string): Locator {
        return this.page.getByText(name);
    }
}

export default VarietyListPage;
