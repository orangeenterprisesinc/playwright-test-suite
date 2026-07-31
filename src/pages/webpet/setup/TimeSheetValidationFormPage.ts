/**
 * @fileoverview TimeSheet Validation create/edit form —
 * `/setup/timesheet/validations/{new,:id}` (PET-202).
 *
 * Module-gated on TimeSheetEntry; see {@link TimeSheetValidationListPage}.
 *
 * The audit log is a **dedicated page** at `…/:id/audit`
 * (`ValidationAuditLogPage`), not an inline section on the edit form — it used to
 * be inline, and the route change is the kind of thing a bare heading assertion
 * hides.
 */
import { Locator, Page, Response } from '@playwright/test';
import { WebpetFormPage } from '../WebpetFormPage';

/**
 * @extends WebpetFormPage
 */
export class TimeSheetValidationFormPage extends WebpetFormPage {
    /**
     * Shown when the id in the URL does not resolve.
     *
     * The bare `"not found"` the lifted spec used — no trailing period, unlike the
     * entity-specific messages on the setup forms.
     */
    readonly notFoundMessage: Locator;
    /** The dedicated audit-log page's heading. */
    readonly auditHeading: Locator;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/timesheet/validations', entity: 'Validation' });

        this.notFoundMessage = page.locator('text=not found');
        this.auditHeading = page.getByRole('heading', { name: /audit/i });
    }

    /** Open the create form, reporting whether the module is licensed. */
    async gotoNewOrForbidden(): Promise<boolean> {
        return this.isAllowed(await this.page.goto(`${this.config.listUrl}/new`));
    }

    /** Open an existing record, reporting whether the module is licensed. */
    async gotoEditOrForbidden(id: number | string): Promise<boolean> {
        return this.isAllowed(await this.page.goto(`${this.config.listUrl}/${String(id)}`));
    }

    /** Open a record's audit-log page, reporting whether the module is licensed. */
    async gotoAuditOrForbidden(id: number | string): Promise<boolean> {
        return this.isAllowed(await this.page.goto(`${this.config.listUrl}/${String(id)}/audit`));
    }

    /** Shared 403 test, so the navigations cannot drift apart. */
    protected isAllowed(response: Response | null): boolean {
        return !(response && response.status() === 403);
    }
}

export default TimeSheetValidationFormPage;
