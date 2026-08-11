import type { Browser } from 'webdriverio';
import { APP_PACKAGE } from '@utils/device/adb';

const id = (rid: string) => `id=${APP_PACKAGE}:id/${rid}`;

/**
 * MainMenuViewActivity — the launcher screen. Buttons carry fixed resource ids
 * (MainMenuViewActivity.setButtonClickEvent): time_in, time_out, crew_in,
 * crew_out, export_button, import_button, sync_button… Labels are alias-driven,
 * so selectors use ids, never text.
 */
export class PetPocketMainMenuPage {
    constructor(private readonly driver: Browser) {}

    get crewInButton() {
        return this.driver.$(id('crew_in'));
    }
    get timeInButton() {
        return this.driver.$(id('time_in'));
    }
    get exportButton() {
        return this.driver.$(id('export_button'));
    }

    async waitUntilShown(): Promise<void> {
        await this.driver.waitUntil(
            async () => (await this.driver.getCurrentPackage()) === APP_PACKAGE,
            { timeout: 60_000, timeoutMsg: 'PET Pocket did not come to foreground' },
        );
        await this.crewInButton.waitForDisplayed({ timeout: 30_000 });
    }

    async openCrewTimeIn(): Promise<void> {
        await this.crewInButton.click();
    }

    /** The positive button of the app's stock confirmation dialogs. */
    get confirmButton() {
        return this.driver.$('id=android:id/button1');
    }

    /** The body text of the app's stock AlertDialogs. */
    get dialogMessage() {
        return this.driver.$('id=android:id/message');
    }

    /**
     * Tap EXPORT, answer the "Go ahead with Exporting Records?" confirmation, then
     * read the result dialog the app raises after the send and return its text.
     * Skipping the confirmation is silent: the button tap alone serializes
     * nothing, which looks exactly like an app that simply had no records — hence
     * we always surface the result rather than dismissing it blindly.
     */
    async exportRecords(): Promise<string> {
        await this.exportButton.waitForDisplayed({ timeout: 15_000 });
        await this.exportButton.click();
        await this.confirmButton.waitForDisplayed({ timeout: 15_000 });
        await this.confirmButton.click();
        return this.readAndDismissExportResult();
    }

    /**
     * Read the result dialog's message, then clear it. Returns '' when no dialog
     * appears. The message is the app's own words — with no relay destination it
     * reads "…Missing body tag" (a failed send), with one it confirms success —
     * so the caller can log/assert it rather than let a failure pass unseen. The
     * authoritative sent/not-sent signal is still logcat (see waitForSendResult),
     * because this on-screen text is the app's, and mistranslates some failures.
     */
    async readAndDismissExportResult(): Promise<string> {
        // The confirmation dialog shares button1 with the result dialog, so wait
        // for it to clear before reading — otherwise we capture "Go ahead with
        // Exporting Records?" instead of the outcome.
        await this.confirmButton
            .waitForDisplayed({ reverse: true, timeout: 5_000 })
            .catch(() => undefined);
        let message = '';
        try {
            await this.confirmButton.waitForDisplayed({ timeout: 20_000 });
            message = (await this.dialogMessage.getText().catch(() => '')).trim();
            await this.confirmButton.click();
        } catch {
            // No result dialog appeared (e.g. a clean send that shows none).
        }
        return message;
    }
}
