/**
 * @fileoverview Job Group list — `/setup/jobs/groups`.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../webpet/WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class JobGroupListPage extends WebpetListPage {
    constructor(page: Page) {
        super(page, '/setup/jobs/groups', 'Job Groups');
    }

    /**
     * A job group name anywhere on the list, used to assert a discarded record
     * was never saved. Page-scoped, matching the lifted spec.
     */
    jobGroupNamed(name: string): Locator {
        return this.page.getByText(name);
    }
}

export default JobGroupListPage;
