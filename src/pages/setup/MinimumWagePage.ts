/**
 * File ▸ Administration ▸ Setup ▸ Minimum Wage (`/setup/minimum-wages`): E5's own wage record, 19.00 an hour.
 * Grid, on-blur validation and the Save dance come from SetupScreenPage.
 *
 * Measured on dev 2026-10-27: New form = textbox "Name *" (#name) and spinbutton "Current Rate *" (#currentRate); the
 * "Rate History Records" section appears only after the first save, so the rate is typed directly and no history row
 * is ever added or edited. No Delete member on purpose: E5 MINIMUM WAGE is a permanent fixture.
 */
import { expect, Locator, Page } from '@playwright/test';
import { SetupScreenPage, type FormOutcome } from '../SetupScreenPage';

export class MinimumWagePage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly rateInput: Locator;

    constructor(page: Page) {
        super(page, {
            listUrl: '/setup/minimum-wages',
            gridName: 'Minimum Wages',
            entity: 'Minimum Wage',
            menuPath: ['File', 'Administration', 'Setup', 'Minimum Wage'],
            rejectionMessage: /already (exists|in use)|Failed to (create|update)/i,
        });
        this.nameInput = page.getByRole('textbox', { name: 'Name *' });
        this.rateInput = page.getByRole('spinbutton', { name: 'Current Rate *' });
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    /** Menu → list filter → row click, then the user's F5 so the form has hydrated before anything is typed. */
    async openByName(name: string): Promise<void> {
        await this.gotoList();
        await this.grid.filterByName(name);
        // Click only the link the filter has re-rendered (its href carries ?name=), as DepartmentPage does.
        const settled = this.grid.editLink(name).and(this.page.locator('a[href*="?name="]'));
        await settled.waitFor({ state: 'visible', timeout: 30_000 });
        await settled.click();
        await this.page.waitForURL(this.editUrlPattern, { timeout: 15_000 });
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.nameInput.waitFor({ state: 'visible' });
        await expect(this.nameInput).toHaveValue(name, { timeout: 30_000 });
    }

    async createMinimumWage(data: { name: string; rate: number }): Promise<FormOutcome> {
        return this.createOnScreen(async () => {
            await this.rateInput.fill(String(data.rate));
            // Name last: validity is only recomputed when a plain text input blurs.
            await this.nameInput.fill(data.name);
        });
    }

    /** Waits for hydration first so a correct record never reads as empty. */
    async readRate(): Promise<number> {
        await expect(this.nameInput).not.toHaveValue('', { timeout: 30_000 });
        await expect(this.rateInput).not.toHaveValue('', { timeout: 30_000 });
        return Number(await this.rateInput.inputValue());
    }

    /** Read-first no-op (a clean form never enables Save); otherwise type, save, and return a fresh-load read-back. */
    async setRate(rate: number): Promise<number> {
        const current = await this.readRate();
        if (current === rate) return current;
        await this.rateInput.fill(String(rate));
        await this.saveEdit();
        return this.readRate();
    }
}

export default MinimumWagePage;
