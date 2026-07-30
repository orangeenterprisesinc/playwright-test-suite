/**
 * @fileoverview Job list — `/setup/jobs`.
 *
 * Note this is the parent route of Job Group (`/setup/jobs/groups`), so the
 * grid's exact-href row matching matters more here than elsewhere.
 *
 * @module pages/webpet/setup/JobListPage
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @class JobListPage
 * @extends WebpetListPage
 */
export class JobListPage extends WebpetListPage {
    constructor(page: Page) {
        super(page, '/setup/jobs', 'Jobs');
    }

    /** A job name anywhere on the list. Page-scoped, matching the lifted spec. */
    jobNamed(name: string): Locator {
        return this.page.getByText(name);
    }
}

export default JobListPage;
