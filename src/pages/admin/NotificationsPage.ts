/**
 * File ▸ Administration ▸ Setup ▸ Notifications (`/setup/notifications`): the grid (Name / Email
 * Subject / Active) and the New/Edit form UI-005 builds its notification on. Row 0 of the recipient
 * list exists by default (Report Format PDF, 1st Time 08:00:00) and is left as it is.
 *
 * Notify Now is an Edit-header action, disabled unless the record is Active and the form is clean, so
 * it is driven from a freshly loaded Edit page. It asks "Today Only" / "All Recipients"; the run uses
 * All Recipients, which ignores the per-recipient date limits.
 */
import { expect, Locator, Page } from '@playwright/test';
import { SetupScreenPage } from '../SetupScreenPage';

export interface NewNotificationData {
    name: string;
    /** Filter script name exactly as the picker lists it. */
    filterScript: string;
    emailSubject: string;
    /** User Name as the recipient picker lists it. */
    recipient: string;
}

export class NotificationsPage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly filterScriptCombobox: Locator;
    readonly emailSubjectInput: Locator;
    readonly notifyNowButton: Locator;
    readonly confirmDialog: Locator;
    readonly allRecipientsButton: Locator;
    readonly resultsDialog: Locator;

    constructor(page: Page) {
        super(page, {
            listUrl: '/setup/notifications',
            gridName: 'Notifications',
            entity: 'Notification',
            menuPath: ['File', 'Administration', 'Setup', 'Notifications'],
            rejectionMessage: /already exists|Failed to create notification/,
        });
        this.nameInput = page.getByRole('textbox', { name: 'Name *' });
        this.filterScriptCombobox = page.getByRole('combobox', { name: 'Filter Script *' });
        this.emailSubjectInput = page.locator('#emailSubject');
        this.notifyNowButton = page.getByRole('button', { name: 'Notify Now' });
        this.confirmDialog = page
            .getByRole('alertdialog', { name: 'Confirm Manual Notification' })
            .or(page.getByRole('dialog', { name: 'Confirm Manual Notification' }));
        this.allRecipientsButton = this.confirmDialog.getByRole('button', { name: 'All Recipients' });
        this.resultsDialog = page.getByRole('dialog', { name: 'Notification Completed' });
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    /** Recipient row `index`'s User picker. The id carries dots, so it is matched as an attribute. */
    recipientUser(index = 0): Locator {
        return this.page.locator(`[id="recipients.${String(index)}.usersCounter"]`);
    }

    /** Pick from a base-ui Select by exact option name ("Employee Badge Script" sits next to "... 5"). */
    private async choose(trigger: Locator, label: string): Promise<void> {
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        const option = this.page.getByRole('option', { name: label, exact: true });
        await option.waitFor({ state: 'visible' });
        await option.click();
        await option.waitFor({ state: 'hidden' });
    }

    async fillForm(data: NewNotificationData): Promise<void> {
        await this.nameInput.fill(data.name);
        await this.choose(this.filterScriptCombobox, data.filterScript);
        await this.emailSubjectInput.fill(data.emailSubject);
        await this.choose(this.recipientUser(0), data.recipient);
    }

    /**
     * Save the New form. Unlike the base's submitForm this does not insist on landing on
     * `/setup/notifications/{id}`: the app may return to the list instead, so it waits for the form to
     * be left (or the rejection message) and the caller resolves the id when this returns null.
     */
    private async saveNew(): Promise<number | null> {
        await this.blurForValidation();
        await expect(this.saveButton, 'Save stayed disabled on the New Notification form').toBeEnabled({
            timeout: SetupScreenPage.SETTLE_TIMEOUT,
        });
        await this.saveButton.click();
        await expect(async () => {
            const left = !this.newUrlPattern.test(this.page.url());
            const rejected = await this.rejectionMessage.isVisible();
            expect(left || rejected).toBeTruthy();
        }).toPass({ timeout: SetupScreenPage.SETTLE_TIMEOUT });
        if (this.newUrlPattern.test(this.page.url())) throw new Error('New Notification was rejected by the form');
        return this.editUrlPattern.test(this.page.url()) ? this.savedIdFromUrl() : null;
    }

    /** List → New → fill → save. The new id, or null when the save returned to the list. */
    async create(data: NewNotificationData): Promise<number | null> {
        await this.gotoList();
        await this.openNewForm();
        await this.fillForm(data);
        return this.saveNew();
    }

    /** The results dialog may never render (WEBPET-1907), so absence is a result, not an error. */
    async awaitResultsDialog(timeout: number): Promise<{ seen: true; text: string } | { seen: false }> {
        const shown = await this.resultsDialog.waitFor({ state: 'visible', timeout }).then(() => true, () => false);
        if (!shown) return { seen: false };
        return { seen: true, text: (await this.resultsDialog.innerText()).trim() };
    }

    /**
     * Notify Now ▸ All Recipients from the open Edit page; resolves to the job id the POST returned.
     * The results dialog is not awaited: the page's own poll can hit WEBPET-1907, so the API poll is
     * the verdict.
     */
    async notifyNow(): Promise<{ jobId: string }> {
        await expect(this.notifyNowButton, 'Notify Now is disabled — the record is inactive or the form is dirty').toBeEnabled();
        const fired = this.page.waitForResponse(
            (res) => res.request().method() === 'POST' && /\/notifications\/\d+\/notify-now$/.test(new URL(res.url()).pathname),
        );
        await this.notifyNowButton.click();
        await this.confirmDialog.waitFor({ state: 'visible' });
        await this.allRecipientsButton.click();
        const res = await fired;
        if (!res.ok()) throw new Error(`POST notify-now failed with ${String(res.status())}: ${(await res.text()).slice(0, 400)}`);
        return { jobId: ((await res.json()) as { jobId: string }).jobId };
    }
}

export default NotificationsPage;
