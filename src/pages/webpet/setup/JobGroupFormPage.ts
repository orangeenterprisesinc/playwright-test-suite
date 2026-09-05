/**
 * @fileoverview Job Group create/edit form — `/setup/jobs/groups/{new,:id}`.
 *
 * Note the **nested** route: `/setup/jobs/groups`, not `/setup/job-groups`.
 * `WebpetFormPage`'s URL patterns escape the slashes, so the extra segment needs
 * no special handling.
 *
 * WEBPET-2682 widened the read-only set: Name **and** Code both lock once the
 * record exists. Code is the barcode, auto-assigned by the server when the field
 * is left blank on create, so it is no longer a value the UI sets. Export
 * Identifier is the only mapping field still editable after save.
 */
import { Locator, Page, expect } from '@playwright/test';
import { WebpetFormPage } from '../WebpetFormPage';

/**
 * @extends WebpetFormPage
 */
export class JobGroupFormPage extends WebpetFormPage {
    /** The barcode. Read-only once the record exists — read it, never type it. */
    readonly codeInput: Locator;
    /**
     * Shown when the id in the URL does not resolve.
     *
     * Matches the bare `"not found."` the lifted spec used, rather than an
     * entity-specific sentence — narrowing it would be a behaviour change, and
     * the wording on this screen has not been confirmed.
     */
    readonly notFoundMessage: Locator;
    /** The Jobs assignment section, rendered on the edit form only. */
    readonly jobsSection: Locator;
    /** The "— Add Jobs —" combobox that opens the job picker. */
    readonly addJobInput: Locator;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/jobs/groups', entity: 'Job Group' });

        this.codeInput = page.locator('input#code');
        this.notFoundMessage = page.locator('text=not found.');
        this.jobsSection = page.locator('section#jobs');
        this.addJobInput = page.locator('input#add-Jobs');
    }

    /**
     * A row in the assigned-Jobs table, matched by the job's name. Scoped to
     * {@link jobsSection} so nothing elsewhere on the form can satisfy it.
     */
    jobRow(name: string): Locator {
        return this.jobsSection.locator('table tbody tr').filter({ hasText: name });
    }

    /**
     * Assign an existing Job by name.
     *
     * The picker is the same portaled combobox `ParentPickerComponent` drives,
     * so the popup is page-scoped, not inside {@link jobsSection}. Add stays
     * disabled until an option is chosen, hence the ordering.
     */
    async addJob(name: string): Promise<void> {
        await this.addJobInput.click();
        const popup = this.page.locator('[data-slot="combobox-popup"]');
        await expect(popup).toBeVisible();
        await popup.locator('[data-slot="combobox-item"]', { hasText: name }).first().click();
        await this.jobsSection.getByRole('button', { name: 'Add', exact: true }).click();
    }
}

export default JobGroupFormPage;
