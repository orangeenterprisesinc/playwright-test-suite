/**
 * @fileoverview Job Card Preferences — `/settings/job-card-preferences`
 * (File ▸ Administration ▸ Job Card Preferences).
 *
 * One scrolling page with a "Search settings..." box, left-nav section buttons and a single
 * Cancel / Save (Save disabled until dirty). Controls are measured by role and accessible name,
 * not by `#fieldId` — that is why this is not part of PreferencesPage. Only the setter E6 needs
 * (a number) exists; the switch and combobox are read-only here.
 */
import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';

export class JobCardPreferencesPage extends BasePage {
    readonly pageUrl: string = '/settings/job-card-preferences';
    readonly pageTitle: string | RegExp = /.*/;

    readonly searchbox: Locator;
    readonly saveButton: Locator;
    private readonly leftNav: LeftNavigationPage;

    constructor(page: Page) {
        super(page);
        this.searchbox = page.getByRole('searchbox', { name: 'Search settings...' });
        this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
        this.leftNav = new LeftNavigationPage(page);
    }

    /** `openScreen` reloads when already on the route, so a second call is the fresh load a read-back needs. */
    async openFromMenu(): Promise<void> {
        await this.leftNav.openScreen(['File', 'Administration', 'Job Card Preferences'], this.pageUrl);
        await this.saveButton.waitFor({ state: 'visible', timeout: 30_000 });
        // A switch reads OFF until the record hydrates, so a read before this would pass a gate falsely.
        await expect(this.page.getByRole('spinbutton').first(), 'Job Card Preferences never hydrated').not.toHaveValue('', { timeout: 30_000 });
    }

    /** The left-nav button; the same text is also the section's own heading. */
    async gotoSection(name: string): Promise<void> {
        await this.page.getByRole('button', { name, exact: true }).click();
        await this.page.getByRole('heading', { name, exact: true }).first().scrollIntoViewIfNeeded();
    }

    spinbutton(label: string): Locator {
        return this.page.getByRole('spinbutton', { name: label, exact: true });
    }

    switchControl(label: string): Locator {
        return this.page.getByRole('switch', { name: label, exact: true });
    }

    combobox(label: string): Locator {
        return this.page.getByRole('combobox', { name: label, exact: true });
    }

    async readNumber(label: string): Promise<number> {
        const input = this.spinbutton(label);
        await input.scrollIntoViewIfNeeded();
        await expect.poll(() => input.inputValue(), { message: `Job Card Preferences '${label}' stayed empty` }).not.toBe('');
        return Number(await input.inputValue());
    }

    async readSwitch(label: string): Promise<boolean> {
        const control = this.switchControl(label);
        await control.scrollIntoViewIfNeeded();
        return (await control.getAttribute('aria-checked')) === 'true';
    }

    async readCombobox(label: string): Promise<string> {
        const control = this.combobox(label);
        await control.scrollIntoViewIfNeeded();
        const isInput = (await control.evaluate((el) => el.tagName)) === 'INPUT';
        const read = async () => (isInput ? await control.inputValue() : (await control.innerText()).trim());
        await expect.poll(read, { message: `Job Card Preferences '${label}' stayed empty` }).not.toBe('');
        return read();
    }

    /** No-op when the value already matches; otherwise fill, blur, and Save must enable. */
    async setNumber(label: string, value: number): Promise<void> {
        if ((await this.readNumber(label)) === value) return;
        const input = this.spinbutton(label);
        await input.fill(String(value));
        await input.blur();
        await expect(this.saveButton, `Save stayed disabled after '${label}' was set to ${value}`).toBeEnabled();
    }

    /** The preferences endpoint path is unmeasured, so the PUT/PATCH is matched by `/preferences/i`. */
    async save(): Promise<number> {
        const response = this.page.waitForResponse(
            (res) => /preferences/i.test(new URL(res.url()).pathname) && ['PUT', 'PATCH'].includes(res.request().method()),
        );
        await this.saveButton.click();
        const saved = await response;
        expect(saved.ok(), `Job Card Preferences save returned ${saved.status()}`).toBe(true);
        await expect(this.saveButton).toBeDisabled();
        return saved.status();
    }

    /** Null when Save is disabled (the form already matches what is stored). */
    async saveIfDirty(): Promise<number | null> {
        if (await this.saveButton.isDisabled()) return null;
        return this.save();
    }
}

export default JobCardPreferencesPage;
