import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';
import { PickerComponent } from '../../components/PickerComponent';

/**
 * Setup ▸ Alias Set, `/setup/alias-sets` (New form at `/new`). Measured 2026-11-20 (QA Automation): Alias Type Windows lists
 * 74 alias fields as a table "Alias Field | Value | Color"; the Value textbox of a row is that field's caption.
 */
export class AliasSetPage extends BasePage {
    static readonly MENU_PATH = ['Setup', 'Alias Set'];
    readonly pageUrl = '/setup/alias-sets';
    readonly pageTitle: string | RegExp = /.*/;

    readonly newButton: Locator;
    readonly nameInput: Locator;
    readonly aliasTypeSelect: Locator;
    readonly saveButton: Locator;
    private readonly leftNav: LeftNavigationPage;
    private readonly pickers: PickerComponent;

    constructor(page: Page) {
        super(page);
        this.leftNav = new LeftNavigationPage(page);
        this.pickers = new PickerComponent(page);
        const main = page.getByRole('main');
        this.newButton = main.getByRole('button', { name: /^New\b/ });
        this.nameInput = main.locator('#name');
        this.aliasTypeSelect = main.locator('#aliasType');
        this.saveButton = main.getByRole('button', { name: 'Save', exact: true });
    }

    async openNew(): Promise<void> {
        await this.leftNav.openScreen(AliasSetPage.MENU_PATH, this.pageUrl);
        await this.newButton.click();
        await this.page.waitForURL((u) => u.pathname.startsWith(`${this.pageUrl}/new`), { timeout: 15_000 });
        await this.nameInput.waitFor({ state: 'visible', timeout: 30_000 });
    }

    private captionRow(field: string): Locator {
        return this.page
            .getByRole('main')
            .getByRole('row')
            .filter({ has: this.page.getByRole('cell', { name: field, exact: true }) });
    }

    /** Captions are keyed by the Alias Field name as the Windows table lists it ("Menu: Crew"). */
    async createWindowsSet(name: string, captions: Record<string, string>): Promise<void> {
        await this.openNew();
        await this.nameInput.fill(name);
        await this.pickers.pickSelect(this.aliasTypeSelect, 'Windows');

        for (const [field, caption] of Object.entries(captions)) {
            const row = this.captionRow(field).first();
            const listed = await row.waitFor({ state: 'attached', timeout: 20_000 }).then(() => true, () => false);
            if (!listed) throw new Error(`The Windows Alias Fields table has no '${field}' row; cannot set its caption '${caption}'.`);
            const value = row.getByRole('textbox').first();
            await value.scrollIntoViewIfNeeded();
            await value.fill(caption);
            await value.blur();
            await expect(value, `the '${field}' caption holds ${caption}`).toHaveValue(caption);
        }

        const posted = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /\/alias-sets\/?$/.test(new URL(r.url()).pathname),
            { timeout: 30_000 },
        );
        // Validation is on blur: Save stays disabled until Name has blurred.
        await this.nameInput.blur();
        await expect(this.saveButton, 'Save enabled once Name, Alias Type and captions are set').toBeEnabled({ timeout: 15_000 });
        await this.saveButton.click();
        expect((await posted).status(), 'POST alias-sets').toBeLessThan(300);
    }
}

export default AliasSetPage;
