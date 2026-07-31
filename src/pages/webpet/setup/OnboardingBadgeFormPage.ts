/**
 * @fileoverview Onboarding Badge create/edit form — `/setup/badge/{new,:id}`
 * (PET-559).
 *
 * Onboarding badges are Employee rows with `RecordType = 1`. They expose a
 * **narrower** form than a regular Employee — no SSN, hire/release dates or
 * address — which is why this is its own page object rather than a mode of
 * {@link EmployeeFormPage}.
 *
 * Note the route/resource split: the section is routed under `/setup/badge`
 * (AppRouter path `'badge'`), while the API resource is `/api/onboarding-badges`.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetFormPage } from '../WebpetFormPage';

/**
 * @extends WebpetFormPage
 */
export class OnboardingBadgeFormPage extends WebpetFormPage {
    /** Barcode. */
    readonly codeInput: Locator;
    /** A native checkbox on this screen, not the ActiveField Switch. */
    readonly activeCheckbox: Locator;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/badge', entity: 'Badge' });

        this.codeInput = page.locator('input#code');
        this.activeCheckbox = page.locator('input#active');
    }
}

export default OnboardingBadgeFormPage;
