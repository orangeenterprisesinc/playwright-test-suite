/**
 * @fileoverview Billing Center list — `/setup/billing-centers`.
 *
 * Module-gated on GrowerBilling; see {@link BillingCenterFormPage}.
 */
import { Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class BillingCenterListPage extends WebpetListPage {
    constructor(page: Page) {
        super(page, '/setup/billing-centers', 'Billing Centers');
    }
}

export default BillingCenterListPage;
