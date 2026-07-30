/**
 * @fileoverview Terms list — `/setup/terms`. Gated by the GrowerBilling module.
 *
 * The only Batch 1 screen whose route can legitimately 403: when GrowerBilling
 * is absent from `PT_MODULES` the list is forbidden and the sidebar entry is
 * hidden too. Both outcomes are acceptable, which is why
 * {@link WebpetListPage.goto} returns the response — the status is the branch
 * condition, and it is only readable from the return value.
 *
 * @module pages/webpet/setup/TermListPage
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @class TermListPage
 * @extends WebpetListPage
 */
export class TermListPage extends WebpetListPage {
    /**
     * The create affordance.
     *
     * A Button-rendered-as-Link, so it resolves as `role=link` on some builds
     * and `role=button` on others — matched either way, exactly as the lifted
     * spec did.
     */
    readonly newTermButton: Locator;

    constructor(page: Page) {
        super(page, '/setup/terms', 'Terms');

        this.newTermButton = page
            .getByRole('link', { name: /new term/i })
            .or(page.getByRole('button', { name: /new term/i }));
    }
}

export default TermListPage;
