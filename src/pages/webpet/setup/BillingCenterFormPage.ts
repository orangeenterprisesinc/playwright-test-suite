/**
 * @fileoverview Billing Center create/edit form — `/setup/billing-centers/{new,:id}`.
 *
 * Module-gated on GrowerBilling (PET-213), like Terms: when the module is absent
 * from `PT_MODULES` every route here 403s, which is an accepted dev-environment
 * outcome rather than a failure. {@link gotoNewOrForbidden} and
 * {@link gotoEditOrForbidden} return `false` in that case so a spec can bail
 * without asserting.
 *
 * The Active control is a `role=switch` here — not the `#active` id the
 * traceability screens use, nor the `input#active` checkbox Employee and
 * Customer use. Three different controls across the suite; each screen declares
 * its own so none is silently widened.
 *
 * @module pages/webpet/setup/BillingCenterFormPage
 */
import { Locator, Page } from '@playwright/test';
import { WebpetFormPage } from '../WebpetFormPage';

/**
 * @class BillingCenterFormPage
 * @extends WebpetFormPage
 */
export class BillingCenterFormPage extends WebpetFormPage {
    /** Readonly once the record exists. */
    readonly codeInput: Locator;
    /** The Active toggle, in the page-header extras. An ActiveField Switch. */
    readonly activeSwitch: Locator;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/billing-centers', entity: 'Billing Center' });

        this.codeInput = page.locator('input#code');
        this.activeSwitch = page.getByRole('switch', { name: /active/i });
    }

    /**
     * Open the create form, or report that the module is not licensed.
     *
     * @returns `false` when the route 403s because GrowerBilling is absent from
     *   `PT_MODULES` — the caller should return without asserting.
     */
    async gotoNewOrForbidden(): Promise<boolean> {
        const response = await this.page.goto(`${this.config.listUrl}/new`);
        return !(response && response.status() === 403);
    }

    /** As {@link gotoNewOrForbidden}, for an existing record. */
    async gotoEditOrForbidden(id: number | string): Promise<boolean> {
        const response = await this.page.goto(`${this.config.listUrl}/${String(id)}`);
        return !(response && response.status() === 403);
    }
}

export default BillingCenterFormPage;
