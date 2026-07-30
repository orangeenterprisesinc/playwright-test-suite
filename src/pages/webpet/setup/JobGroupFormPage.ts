/**
 * @fileoverview Job Group create/edit form — `/setup/jobs/groups/{new,:id}`.
 *
 * Note the **nested** route: `/setup/jobs/groups`, not `/setup/job-groups`.
 * `WebpetFormPage`'s URL patterns escape the slashes, so the extra segment needs
 * no special handling.
 *
 * The read-only set is narrower here than on Department or Crew: only Name
 * locks after save, while Export Identifier and Code stay editable.
 *
 * @module pages/webpet/setup/JobGroupFormPage
 */
import { Locator, Page } from '@playwright/test';
import { WebpetFormPage } from '../WebpetFormPage';

/**
 * @class JobGroupFormPage
 * @extends WebpetFormPage
 */
export class JobGroupFormPage extends WebpetFormPage {
    /** Stays editable after save, unlike Department's and Crew's. */
    readonly codeInput: Locator;
    /**
     * Shown when the id in the URL does not resolve.
     *
     * Matches the bare `"not found."` the lifted spec used, rather than an
     * entity-specific sentence — narrowing it would be a behaviour change, and
     * the wording on this screen has not been confirmed.
     */
    readonly notFoundMessage: Locator;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/jobs/groups', entity: 'Job Group' });

        this.codeInput = page.locator('input#code');
        this.notFoundMessage = page.locator('text=not found.');
    }
}

export default JobGroupFormPage;
