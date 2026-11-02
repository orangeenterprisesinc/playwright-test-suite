/**
 * File ▸ Administration ▸ Setup ▸ Scripts (`/setup/filter-scripts`, "Filter Scripts"): the Edit Filter Script form (WEBPET-3864).
 *
 * Not a SetupScreenPage: the list has no New button (View deleted / Report / Multi Update). Measured 2026-11-02 (su):
 * Screen (#partName) and Script Type (#scriptType) are read-only text showing names; Description is read-only; Report
 * Viewer Users has "Add Users" (#users-picker, "Select users...") and "Empty" (disabled with no users); the footer
 * carries Execute Script. Read only: leave through Cancel, never Save.
 */
import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';
import { DataGridComponent } from '../../components/DataGridComponent';

export class FilterScriptsPage extends BasePage {
    static readonly MENU_PATH = ['File', 'Administration', 'Setup', 'Scripts'];
    readonly pageUrl = '/setup/filter-scripts';
    readonly pageTitle: string | RegExp = /.*/;

    readonly grid: DataGridComponent;
    readonly nameInput: Locator;
    readonly screenInput: Locator;
    readonly scriptTypeInput: Locator;
    readonly descriptionInput: Locator;
    readonly executeScriptButton: Locator;
    readonly usersHeading: Locator;
    readonly addUsersPicker: Locator;
    readonly emptyUsersButton: Locator;
    readonly saveButton: Locator;
    readonly cancelButton: Locator;
    private readonly leftNav: LeftNavigationPage;

    constructor(page: Page) {
        super(page);
        this.leftNav = new LeftNavigationPage(page);
        this.grid = new DataGridComponent(page, 'Filter Scripts', 'Filter Script');
        const main = page.getByRole('main');
        this.nameInput = main.locator('#name');
        this.screenInput = main.getByRole('textbox', { name: 'Screen', exact: true });
        this.scriptTypeInput = main.getByRole('textbox', { name: 'Script Type', exact: true });
        this.descriptionInput = main.getByRole('textbox', { name: 'Description', exact: true });
        this.executeScriptButton = main.getByRole('button', { name: 'Execute Script', exact: true });
        this.usersHeading = main.getByRole('heading', { level: 2, name: 'Report Viewer Users' });
        this.addUsersPicker = main.getByRole('combobox', { name: 'Add Users' });
        this.emptyUsersButton = main.getByRole('button', { name: 'Empty', exact: true });
        this.saveButton = main.getByRole('button', { name: 'Save', exact: true });
        this.cancelButton = main.getByRole('button', { name: 'Cancel', exact: true });
    }

    async gotoList(): Promise<void> {
        await this.leftNav.openScreen(FilterScriptsPage.MENU_PATH, this.pageUrl);
        await this.grid.nameFilter.waitFor({ state: 'visible', timeout: 30_000 });
    }

    /** Filter by name until one row is left, then open it; Name holding the value proves the form hydrated. */
    async openScript(name: string): Promise<void> {
        await this.grid.nameFilter.fill(name);
        await expect.poll(() => this.grid.totalRowCount().catch(() => -1), { timeout: 30_000, message: `the Name filter leaves only '${name}'` }).toBe(1);
        await this.grid.editLink(name).click();
        await this.page.waitForURL(/\/setup\/filter-scripts\/\d+(\?|$)/, { timeout: 15_000 });
        await expect(this.nameInput).toHaveValue(name, { timeout: 30_000 });
    }

    /** A field label on the form, required marker tolerated. */
    fieldLabel(text: string): Locator {
        const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return this.page.getByRole('main').locator('label').filter({ hasText: new RegExp(`^${escaped}(\\s*\\*)?$`) });
    }

    /** Nothing was changed, so Save is disabled; Cancel returns to the list. */
    async leaveWithoutSaving(): Promise<void> {
        await expect(this.saveButton, 'the script form is clean').toBeDisabled();
        await this.cancelButton.click();
        await this.page.waitForURL((u) => u.pathname === this.pageUrl, { timeout: 15_000 });
    }
}

export default FilterScriptsPage;
