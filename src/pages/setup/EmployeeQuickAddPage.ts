/**
 * Employee Add ▸ Quick (`/setup/employees/quick-add`): the one-screen New Employee form (WEBPET-3927 / 3929).
 *
 * Measured on dev 2026-11-02 (su):
 * - No Barcode field: the server assigns the code (7503, 7504 in a row) and a code-less save answered 201. If the
 *   auto-barcode counter falls behind again the save 409s; `save` fails by name and never touches the counter.
 * - Name is optional; left blank the server composes "<Last> <First>". Specs fill it so the residue sweep can date the row.
 * - Crew arrives pre-filled from preferences (B1 CREW on su): `clearCrew` empties it so a throwaway joins no journey roster.
 * - Save resets the form and shows a status banner "<name> was added. Ready for the next employee." with a Print badge
 *   button and an Open record link (/setup/employees/<id>).
 * - Print badge POSTs employees/<id>/badge (a one-page PDF) into a hidden 0×0 blob: iframe that prints it; the page stays put.
 */
import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';
import { PickerComponent } from '../../components/PickerComponent';

export interface QuickAddData {
    name: string;
    firstName: string;
    lastName: string;
    middle?: string;
    exportIdentifier?: string;
    defaultRanch?: string;
    defaultField?: string;
    defaultJob?: string;
}

export interface PrintedBadge {
    status: number;
    pdf: Buffer;
}

export class EmployeeQuickAddPage extends BasePage {
    static readonly MENU_PATH = ['Employee Add', 'Quick'];
    readonly pageUrl = '/setup/employees/quick-add';
    readonly pageTitle: string | RegExp = /.*/;

    readonly nameInput: Locator;
    readonly firstNameInput: Locator;
    readonly lastNameInput: Locator;
    readonly middleNameInput: Locator;
    readonly exportIdentifierInput: Locator;
    readonly crewCombobox: Locator;
    readonly defaultRanchSelect: Locator;
    readonly defaultFieldCombobox: Locator;
    readonly defaultJobCombobox: Locator;
    readonly saveButton: Locator;
    readonly banner: Locator;
    readonly printBadgeButton: Locator;
    readonly openRecordLink: Locator;
    readonly badgeFrame: Locator;
    private readonly leftNav: LeftNavigationPage;
    private readonly pickers: PickerComponent;

    constructor(page: Page) {
        super(page);
        this.leftNav = new LeftNavigationPage(page);
        this.pickers = new PickerComponent(page);
        this.nameInput = page.locator('#name');
        this.firstNameInput = page.locator('#firstName');
        this.lastNameInput = page.locator('#lastName');
        this.middleNameInput = page.locator('#middleName');
        this.exportIdentifierInput = page.locator('#exportIdentifier');
        this.crewCombobox = page.locator('input#crewCounter');
        this.defaultRanchSelect = page.locator('button#defaultRanchCounter');
        this.defaultFieldCombobox = page.locator('input#defaultFieldCounter');
        this.defaultJobCombobox = page.locator('input#defaultJobCounter');
        this.saveButton = page.getByRole('button', { name: 'Save employee', exact: true });
        this.banner = page.getByRole('main').getByRole('status').filter({ hasText: 'Ready for the next employee.' });
        this.printBadgeButton = this.banner.getByRole('button', { name: 'Print badge', exact: true });
        this.openRecordLink = this.banner.getByRole('link', { name: 'Open record', exact: true });
        this.badgeFrame = page.locator('iframe[src^="blob:"]').last();
    }

    async open(): Promise<void> {
        await this.leftNav.openScreen(EmployeeQuickAddPage.MENU_PATH, this.pageUrl);
        await this.firstNameInput.waitFor({ state: 'visible', timeout: 30_000 });
    }

    currentPath(): string {
        return new URL(this.page.url()).pathname;
    }

    /** The form's field labels in order, required markers stripped. */
    async formLabels(): Promise<string[]> {
        await this.firstNameInput.waitFor({ state: 'visible' });
        return (await this.page.getByRole('main').locator('label').allTextContents()).map((t) => t.replace(/\s*\*\s*$/, '').trim());
    }

    /** A card title ("Employee", "Job", "Time Card Defaults"); CSS upper-cases it, the text does not. */
    section(title: string): Locator {
        return this.page.getByRole('main').getByText(title, { exact: true });
    }

    /** Empties the preference-filled Crew; the default lands a beat after the form, an unset default leaves it empty. */
    async clearCrew(): Promise<void> {
        await expect(this.crewCombobox).not.toHaveValue('', { timeout: 10_000 }).catch(() => undefined);
        if ((await this.crewCombobox.inputValue()) !== '') {
            // Default Field and Default Job grow their own "Clear" once set, so scope to the Crew control.
            await this.crewCombobox.locator('xpath=ancestor::*[.//button[@aria-label="Clear"]][1]').getByRole('button', { name: 'Clear', exact: true }).click();
        }
        await expect(this.crewCombobox).toHaveValue('');
    }

    async fill(data: QuickAddData): Promise<void> {
        await this.firstNameInput.fill(data.firstName);
        await this.lastNameInput.fill(data.lastName);
        if (data.middle) await this.middleNameInput.fill(data.middle);
        if (data.exportIdentifier) await this.exportIdentifierInput.fill(data.exportIdentifier);
        if (data.defaultRanch) await this.pickers.pickSelect(this.defaultRanchSelect, data.defaultRanch);
        if (data.defaultField) {
            await expect(this.defaultFieldCombobox, 'Default Field unlocks once a Default Ranch is chosen').toBeEnabled({ timeout: 15_000 });
            await this.pickers.pickCombobox(this.defaultFieldCombobox, data.defaultField);
        }
        if (data.defaultJob) await this.pickers.pickCombobox(this.defaultJobCombobox, data.defaultJob);
        await this.nameInput.fill(data.name);
    }

    /** Save employee → POST employees → the banner names `name`. */
    async save(name: string): Promise<void> {
        await this.nameInput.focus();
        await this.nameInput.blur();
        await expect(this.saveButton, 'Save employee stayed disabled: First and Last Name are required').toBeEnabled({ timeout: 15_000 });
        const created = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/employees'),
            { timeout: 30_000 },
        );
        await this.saveButton.click();
        const res = await created;
        if (res.status() === 409) {
            throw new Error(
                `Quick Add save answered 409: ${(await res.text()).slice(0, 300)}. Quick Add has no Barcode field, so a code clash ` +
                    'means the employee auto-barcode counter is behind the real max; a test never bumps it.',
            );
        }
        expect(res.status(), 'POST employees').toBe(201);
        await expect(this.banner).toContainText(name, { timeout: 15_000 });
    }

    /** Print badge: the badge PDF the app produced and handed to its hidden print frame. */
    async printBadge(): Promise<PrintedBadge> {
        const badge = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /\/employees\/\d+\/badge$/.test(new URL(r.url()).pathname),
            { timeout: 30_000 },
        );
        await this.printBadgeButton.click();
        const res = await badge;
        await expect(this.badgeFrame).toBeAttached({ timeout: 15_000 });
        // The POST's body reads empty through Playwright here (2026-11-02); the print frame's blob holds the same PDF.
        const src = (await this.badgeFrame.getAttribute('src')) ?? '';
        const bytes = await this.page.evaluate(async (url) => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), src);
        return { status: res.status(), pdf: Buffer.from(bytes) };
    }

    /** Follows the banner's Open record link; returns the employee id it pointed at. */
    async openRecord(): Promise<number> {
        const href = (await this.openRecordLink.getAttribute('href')) ?? '';
        const id = Number(/\/setup\/employees\/(\d+)$/.exec(href)?.[1]);
        if (!Number.isFinite(id)) throw new Error(`Open record links to '${href}', not an employee record`);
        await this.openRecordLink.click();
        await this.page.waitForURL((u) => u.pathname === `/setup/employees/${String(id)}`, { timeout: 15_000 });
        return id;
    }
}

export default EmployeeQuickAddPage;
