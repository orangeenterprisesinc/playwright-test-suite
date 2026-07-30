/**
 * @fileoverview Onboarding Badge list — `/setup/badge` (PET-559).
 *
 * See {@link OnboardingBadgeFormPage} for the RecordType split and the
 * route-versus-resource naming difference.
 *
 * @module pages/webpet/setup/OnboardingBadgeListPage
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @class OnboardingBadgeListPage
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

    /** A badge name anywhere on the list. Page-scoped, matching the lifted spec. */
    badgeNamed(name: string): Locator {
        return this.page.getByText(name);
    }
}

export default OnboardingBadgeListPage;
