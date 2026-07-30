/**
 * @fileoverview Customer list — `/setup/customers`.
 *
 * @module pages/webpet/setup/CustomerListPage
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @class CustomerListPage
 * @extends WebpetListPage
 */
export class CustomerListPage extends WebpetListPage {
    constructor(page: Page) {
        super(page, '/setup/customers', 'Customers');
    }

    /**
     * A customer name anywhere on the list, used to assert a discarded record
     * was never saved. Page-scoped, matching the lifted spec.
     */
    customerNamed(name: string): Locator {
        return this.page.getByText(name);
    }
}

export default CustomerListPage;
