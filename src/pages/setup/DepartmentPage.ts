/**
 * Setup ▸ Department (`/setup/departments`): E1's own department, whose Weekly Overtime Method is the one lever.
 * Grid, on-blur validation and the Save dance come from SetupScreenPage.
 *
 * Measured on dev 2026-10-26: grid "Departments" (Name, Export Identifier, Active), New form needs only "Name *",
 * Edit form section Job Card ▸ Overtime & Rounding holds the "Weekly Overtime Method" combobox (None / Entire Rate /
 * Premium Only). About 400 "NotifTest" departments exist, so a record is always opened through the filtered list.
 */
import { expect, Locator, Page } from '@playwright/test';
import { SetupScreenPage, type FormOutcome } from '../SetupScreenPage';
import { PickerComponent } from '../../components/PickerComponent';

export class DepartmentPage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly weeklyOvertimeMethod: Locator;
    /** `#minimumWageCounter`: an input combobox labelled "Minimum Wage"; options are the active Minimum Wage records by name. */
    readonly minimumWageCombobox: Locator;
    /** `#minimumWageMethod`: a shadcn select labelled "Piece Minimum Wage & Averaging Period" (not "Minimum Wage Method"). */
    readonly minimumWageMethodSelect: Locator;
    private readonly pickers: PickerComponent;

    constructor(page: Page) {
        super(page, {
            listUrl: '/setup/departments',
            gridName: 'Departments',
            entity: 'Department',
            menuPath: ['File', 'Administration', 'Setup', 'Department'],
            rejectionMessage: /already (exists|in use)|Failed to (create|update)/i,
        });
        this.nameInput = page.getByRole('textbox', { name: 'Name *' });
        this.weeklyOvertimeMethod = page.getByRole('combobox', { name: /^Weekly Overtime Method/ });
        this.minimumWageCombobox = page.locator('input#minimumWageCounter');
        this.minimumWageMethodSelect = page.locator('#minimumWageMethod');
        this.pickers = new PickerComponent(page);
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    async openFromMenu(): Promise<void> {
        await this.gotoList();
    }

    /** Menu → list filter → row click, then the user's F5 so the form has hydrated before anything is changed. */
    async openByName(name: string): Promise<void> {
        await this.gotoList();
        await this.grid.filterByName(name);
        // Click only the link the filter has re-rendered (its href carries ?name=), as OvertimeRulePage does.
        const settled = this.grid.editLink(name).and(this.page.locator('a[href*="?name="]'));
        await settled.waitFor({ state: 'visible', timeout: 30_000 });
        await settled.click();
        await this.page.waitForURL(this.editUrlPattern, { timeout: 15_000 });
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.nameInput.waitFor({ state: 'visible' });
        await expect(this.nameInput).toHaveValue(name, { timeout: 30_000 });
    }

    /** Every other required field defaults (First Day of Payroll Week Monday, export formats <None>, Export Crew Source Work Crew). */
    async createDepartment(data: { name: string }): Promise<FormOutcome> {
        return this.createOnScreen(async () => {
            await this.nameInput.fill(data.name);
        });
    }

    /** Job Card ▸ Meal & Minimum Wage, right after Overtime & Rounding (measured 2026-10-27). */
    async gotoMinimumWageSection(): Promise<void> {
        const heading = this.page.getByRole('heading', { name: 'Meal & Minimum Wage', exact: true }).first();
        if (await heading.isVisible().catch(() => false)) await heading.scrollIntoViewIfNeeded();
        await this.minimumWageMethodSelect.scrollIntoViewIfNeeded({ timeout: 15_000 });
    }

    /** The wage as the picker shows it (the "<identifier> : " prefix dropped) and the method's text; "—" is none. */
    async readMinimumWage(): Promise<{ wage: string; method: string }> {
        await expect(this.nameInput).not.toHaveValue('', { timeout: 30_000 });
        // The wage list loads after the form; an early read is "" and would re-pick an already-correct department.
        await expect(this.minimumWageCombobox).not.toHaveAttribute('placeholder', /^Loading/, { timeout: 30_000 });
        await this.gotoMinimumWageSection();
        const wage = (await this.minimumWageCombobox.inputValue()).replace(/^[^:]*: /, '').trim();
        const method = (await this.minimumWageMethodSelect.innerText()).trim();
        return { wage, method };
    }

    /** Read-first no-op; otherwise pick what differs, one save, and a fresh-load read-back of both. */
    async setMinimumWage(want: { wage: string; method: string }): Promise<{ wage: string; method: string }> {
        // Both values hydrate after the form: give an already-correct department a moment before it reads as different.
        await expect
            .poll(async () => JSON.stringify(await this.readMinimumWage()), { timeout: 5_000 })
            .toBe(JSON.stringify(want))
            .catch(() => undefined);
        const current = await this.readMinimumWage();
        if (current.wage === want.wage && current.method === want.method) return current;

        if (current.wage !== want.wage) await this.pickers.pickCombobox(this.minimumWageCombobox, want.wage);
        if (current.method !== want.method) {
            await this.gotoMinimumWageSection();
            await this.pickers.pickSelect(this.minimumWageMethodSelect, want.method);
        }
        await this.saveEdit();
        return this.readMinimumWage();
    }

    private async gotoOvertimeSection(): Promise<void> {
        const heading = this.page.getByRole('heading', { name: 'Overtime & Rounding', exact: true }).first();
        if (await heading.isVisible().catch(() => false)) await heading.scrollIntoViewIfNeeded();
        await this.weeklyOvertimeMethod.scrollIntoViewIfNeeded({ timeout: 15_000 });
    }

    /** The control's label; a Select reads its text, a typable combobox its input value (CALIBRATE which one it is). */
    async readWeeklyOvertimeMethod(): Promise<string> {
        await expect(this.nameInput).not.toHaveValue('', { timeout: 30_000 });
        await this.gotoOvertimeSection();
        const isInput = (await this.weeklyOvertimeMethod.evaluate((el) => el.tagName)) === 'INPUT';
        return isInput ? this.weeklyOvertimeMethod.inputValue() : (await this.weeklyOvertimeMethod.innerText()).trim();
    }

    /** Read-first no-op (a clean form never enables Save); otherwise pick, save, and return a fresh-load read-back. */
    async setWeeklyOvertimeMethod(label: string): Promise<string> {
        // The value hydrates after the form: give an already-correct department a moment before it reads as different.
        await expect.poll(() => this.readWeeklyOvertimeMethod(), { timeout: 5_000 }).toBe(label).catch(() => undefined);
        const current = await this.readWeeklyOvertimeMethod();
        if (current === label) return current;

        const isInput = (await this.weeklyOvertimeMethod.evaluate((el) => el.tagName)) === 'INPUT';
        if (isInput) await this.pickers.pickCombobox(this.weeklyOvertimeMethod, label);
        else await this.pickers.pickSelect(this.weeklyOvertimeMethod, label);
        await this.saveEdit();
        return this.readWeeklyOvertimeMethod();
    }
}

export default DepartmentPage;
