/**
 * @fileoverview Onboarding Badge list — `/setup/badge` (PET-559).
 *
 * See {@link OnboardingBadgeFormPage} for the RecordType split and the
 * route-versus-resource naming difference.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class OnboardingBadgeListPage extends WebpetListPage {
    /**
     * The create affordance.
     *
     * A real `role=button` here (unlike the href-anchored create links on the
     * inventory and DataGrid lists), matched case-insensitively as the lifted
     * spec did.
     */
    readonly newBadgeButton: Locator;

    constructor(page: Page) {
        super(page, '/setup/badge', /onboarding badges/i);

        this.newBadgeButton = page.getByRole('button', { name: /new badge/i });
    }
}

export default OnboardingBadgeListPage;
