/**
 * @fileoverview TimeSheet Validation list — `/setup/timesheet/validations`
 * (PET-202).
 *
 * Module-gated on TimeSheetEntry: every route here 403s when the module is
 * absent from `PT_MODULES`, which is an accepted dev-environment outcome. Hence
 * {@link gotoOrForbidden} and the sibling helper on the form page.
 *
 * Unusually, this entity has a **deleted** list as well as a live one — it
 * supports soft delete and restore — so the route is exposed as its own
 * navigation.
 *
 * No multi-update surface: Validation has no bulk-editable fields (no Active
 * column), so nothing here drives the SelectedRowsBar.
 */
import { Locator, Page, Response } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class TimeSheetValidationListPage extends WebpetListPage {
    /** The create link, matched on its exact href. */
    readonly newLink: Locator;

    constructor(page: Page) {
        super(page, '/setup/timesheet/validations', /timesheet validations/i);

        this.newLink = page.locator(`a[href="${this.pageUrl}/new"]`);
    }

    /** Relative URL of the soft-deleted list. */
    get deletedUrl(): string {
        return `${this.pageUrl}/deleted`;
    }

    /** Navigate to the live list, reporting whether the module is licensed. */
    async gotoOrForbidden(): Promise<boolean> {
        return this.isAllowed(await this.page.goto(this.pageUrl));
    }

    /** As {@link gotoOrForbidden}, for the soft-deleted list. */
    async gotoDeletedOrForbidden(): Promise<boolean> {
        return this.isAllowed(await this.page.goto(this.deletedUrl));
    }

    /** Shared 403 test, so the two navigations cannot drift. */
    protected isAllowed(response: Response | null): boolean {
        return !(response && response.status() === 403);
    }
}

export default TimeSheetValidationListPage;
