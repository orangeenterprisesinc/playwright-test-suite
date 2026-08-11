import type { Browser } from 'webdriverio';
import { APP_PACKAGE } from '@utils/device/adb';

const id = (rid: string) => `id=${APP_PACKAGE}:id/${rid}`;

/**
 * CrewInActivity — "Crew In", the screen behind both B1 (crew time-in) and B2
 * (crew move / job change: the same screen driven again with a new field/job,
 * handled by its `updateJobInEmployeeRecord` cases). Layout `edit_record.xml`.
 *
 * Verified on the running app (API 29): `spinner_field` / `spinner_job` /
 * `spinner_crew` are **Buttons** that open pick dialogs — despite the "spinner"
 * ids — and each auto-fills only when exactly one setup record exists. SAVE
 * (`save_recordButton`) opens the stock "Employee Selection" multi-choice
 * dialog with every member pre-checked; `android:id/button1` is DONE and
 * `button2` is BACK.
 */
export class PetPocketCrewInPage {
    constructor(private readonly driver: Browser) {}

    get fieldButton() {
        return this.driver.$(id('spinner_field'));
    }
    get jobButton() {
        return this.driver.$(id('spinner_job'));
    }
    get crewButton() {
        return this.driver.$(id('spinner_crew'));
    }
    get saveButton() {
        return this.driver.$(id('save_recordButton'));
    }
    get mainMenuButton() {
        return this.driver.$(id('main_menu'));
    }
    get doneButton() {
        return this.driver.$('id=android:id/button1');
    }
    get rosterRows() {
        return this.driver.$$('android=new UiSelector().resourceId("android:id/text1")');
    }

    async waitUntilShown(): Promise<void> {
        await this.saveButton.waitForDisplayed({ timeout: 30_000 });
    }

    async context(): Promise<{ field: string; job: string; crew: string }> {
        return {
            field: await this.fieldButton.getText(),
            job: await this.jobButton.getText(),
            crew: await this.crewButton.getText(),
        };
    }

    /**
     * Select a setup record by scanning its barcode — the way the screen is
     * actually driven in the field, and the only way that works here.
     *
     * The `spinner_*` views report `clickable=false`: they are display slots, not
     * pickers, so tapping them does nothing (their pick dialogs open only on
     * paths this screen does not wire up). The activity instead consumes hardware
     * keyboard input through `dispatchKeyEvent` → `mScanner.processKeyEvent`, so a
     * digit string followed by Enter is decoded as a scan and fills the matching
     * slot. Verified on the emulator: `4101` → Field "B1 FIELD",
     * `4201` → Job "B1 HARVEST".
     *
     * With exactly one setup record of a type the app pre-fills that slot, which
     * is why the single-record fixture needed no scanning at all.
     */
    async scanBarcode(code: string): Promise<void> {
        await this.driver.execute('mobile: shell', {
            command: 'input',
            args: ['text', code],
        });
        await this.driver.execute('mobile: shell', {
            command: 'input',
            args: ['keyevent', '66'], // KEYCODE_ENTER — terminates the scan
        });
    }

    /** Scan a barcode and wait for the named slot to show `expected`. */
    private async scanInto(
        slot: () => ReturnType<Browser['$']>,
        code: string,
        expected: string,
    ): Promise<void> {
        await this.scanBarcode(code);
        await this.driver.waitUntil(async () => (await slot().getText()) === expected, {
            timeout: 15_000,
            timeoutMsg: `Scanning '${code}' did not set the slot to '${expected}'`,
        });
    }

    async selectFieldByBarcode(code: string, expectedName: string): Promise<void> {
        await this.scanInto(() => this.fieldButton, code, expectedName);
    }
    async selectJobByBarcode(code: string, expectedName: string): Promise<void> {
        await this.scanInto(() => this.jobButton, code, expectedName);
    }
    async selectCrewByBarcode(code: string, expectedName: string): Promise<void> {
        await this.scanInto(() => this.crewButton, code, expectedName);
    }

    /** SAVE opens the roster; the dialog's DONE button confirms it rendered. */
    async openRoster(): Promise<void> {
        await this.saveButton.click();
        await this.doneButton.waitForDisplayed({ timeout: 20_000 });
    }

    async rosterNames(): Promise<string[]> {
        // ChainablePromiseArray.map resolves on its own — do not wrap in Promise.all.
        return this.rosterRows.map((row) => row.getText());
    }

    /** Toggle one roster member off (rows start checked). */
    async uncheck(employeeName: string): Promise<void> {
        const row = this.driver.$(
            `android=new UiSelector().resourceId("android:id/text1").text("${employeeName}")`,
        );
        await row.waitForDisplayed({ timeout: 15_000 });
        await row.click();
    }

    /**
     * Commit the selection — writes one time-in per checked member.
     *
     * Verifies the dialog closed and taps once more if not: under load (e.g.
     * while adb screenrecord is capturing) the emulator can drop a tap, and a
     * still-open dialog fails later as a confusing "no such element" on the Crew
     * In screen, whose views are absent from the accessibility tree while a
     * dialog is up.
     */
    async confirmRoster(): Promise<void> {
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            await this.doneButton.click();
            try {
                await this.doneButton.waitForDisplayed({ reverse: true, timeout: 8_000 });
                return;
            } catch {
                if (attempt === 2) {
                    throw new Error('Employee Selection dialog did not close after tapping DONE');
                }
            }
        }
    }

    async backToMainMenu(): Promise<void> {
        await this.mainMenuButton.click();
    }
}
