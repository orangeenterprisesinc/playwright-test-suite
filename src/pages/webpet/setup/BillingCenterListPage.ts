/**
 * @fileoverview Billing Center list — `/setup/billing-centers`.
 *
 * Module-gated on GrowerBilling; see {@link BillingCenterFormPage}.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class BillingCenterListPage extends WebpetListPage {
    constructor(page: Page) {
        super(page, '/setup/billing-centers', 'Billing Centers');
    }

    /**
     * A billing centre name anywhere on the list. Page-scoped, matching the
     * lifted spec.
     */
    billingCenterNamed(name: string): Locator {
        return this.page.getByText(name);
    }
}

export default BillingCenterListPage;
