/**
 * File ▸ Administration ▸ Setup ▸ Over-Time-Rule (`/setup/overtime-rules`): the rule E13 puts on two jobs, one wage order each.
 * Grid, on-blur validation and the Save dance come from SetupScreenPage.
 *
 * Measured on dev 2026-10-26: grid "Over-Time Rules", row link "Edit Over-Time Rule: <name>", form fields
 * Name / Over-Time Daily Hours / Double-Time Daily Hours / Wage Order / Ag Type.
 */
import { expect, Locator, Page } from '@playwright/test';
import { SetupScreenPage, type FormOutcome } from '../SetupScreenPage';

export interface OvertimeRuleData {
    name: string;
    overtimeDailyHours: number;
    doubleTimeDailyHours: number;
    wageOrder: string;
    agType: boolean;
}

export type OvertimeRuleReadBack = Omit<OvertimeRuleData, 'name'>;

export class OvertimeRulePage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly overtimeHoursInput: Locator;
    readonly doubleTimeHoursInput: Locator;
    readonly wageOrderInput: Locator;
    readonly agTypeSwitch: Locator;

    constructor(page: Page) {
        super(page, {
            listUrl: '/setup/overtime-rules',
            gridName: 'Over-Time Rules',
            entity: 'Over-Time Rule',
            menuPath: ['File', 'Administration', 'Setup', 'Over-Time-Rule'],
            rejectionMessage: /already (exists|in use)|Failed to (create|update)/i,
        });
        this.nameInput = page.getByRole('textbox', { name: 'Name *' });
        this.overtimeHoursInput = page.getByRole('spinbutton', { name: 'Over-Time Daily Hours' });
        this.doubleTimeHoursInput = page.getByRole('spinbutton', { name: 'Double-Time Daily Hours' });
        this.wageOrderInput = page.getByRole('textbox', { name: 'Wage Order' });
        this.agTypeSwitch = page.getByRole('switch', { name: 'Ag Type' });
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    async openFromMenu(): Promise<void> {
        await this.gotoList();
    }

    async filterByName(name: string): Promise<void> {
        await this.grid.filterByName(name);
    }

    /** Menu → list filter → row click, then the user's F5 so the form has hydrated before anything is typed. */
    async openByName(name: string): Promise<void> {
        await this.gotoList();
        await this.filterByName(name);
        // Click only the link the filter has re-rendered (its href carries ?name=); the pre-filter row swallows the
        // click and the route never changes (DataGridComponent.openRecord, E13 2026-10-26).
        const settled = this.grid.editLink(name).and(this.page.locator('a[href*="?name="]'));
        await settled.waitFor({ state: 'visible', timeout: 30_000 });
        await settled.click();
        await this.page.waitForURL(this.editUrlPattern, { timeout: 15_000 });
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.nameInput.waitFor({ state: 'visible' });
        await expect(this.nameInput).toHaveValue(name, { timeout: 30_000 });
    }

    async openNew(): Promise<void> {
        await this.gotoList();
        await this.openNewForm();
    }

    private async setAgType(on: boolean): Promise<void> {
        if ((await this.agTypeSwitch.getAttribute('aria-checked')) === String(on)) return;
        await this.agTypeSwitch.click();
        await expect(this.agTypeSwitch).toHaveAttribute('aria-checked', String(on));
    }

    async fillRule(data: OvertimeRuleData): Promise<void> {
        await this.overtimeHoursInput.fill(String(data.overtimeDailyHours));
        await this.doubleTimeHoursInput.fill(String(data.doubleTimeDailyHours));
        await this.wageOrderInput.fill(data.wageOrder);
        await this.setAgType(data.agType);
        // Name last: validity is only recomputed when a plain text input blurs.
        await this.nameInput.fill(data.name);
    }

    async createRule(data: OvertimeRuleData): Promise<FormOutcome> {
        return this.createOnScreen(() => this.fillRule(data));
    }

    /** What the open Edit form shows; waits for hydration first so a correct rule never reads as empty. */
    async readRule(): Promise<OvertimeRuleReadBack> {
        await expect(this.nameInput).not.toHaveValue('', { timeout: 30_000 });
        await expect(this.overtimeHoursInput).not.toHaveValue('', { timeout: 30_000 });
        return {
            overtimeDailyHours: Number(await this.overtimeHoursInput.inputValue()),
            doubleTimeDailyHours: Number(await this.doubleTimeHoursInput.inputValue()),
            wageOrder: await this.wageOrderInput.inputValue(),
            agType: (await this.agTypeSwitch.getAttribute('aria-checked')) === 'true',
        };
    }

    /** Repairs only what differs (a clean form never enables Save), then returns the fresh-load read-back. */
    async setRule(data: OvertimeRuleData): Promise<OvertimeRuleReadBack> {
        const current = await this.readRule();
        let dirty = false;
        if (current.overtimeDailyHours !== data.overtimeDailyHours) {
            await this.overtimeHoursInput.fill(String(data.overtimeDailyHours));
            dirty = true;
        }
        if (current.doubleTimeDailyHours !== data.doubleTimeDailyHours) {
            await this.doubleTimeHoursInput.fill(String(data.doubleTimeDailyHours));
            dirty = true;
        }
        if (current.wageOrder !== data.wageOrder) {
            await this.wageOrderInput.fill(data.wageOrder);
            dirty = true;
        }
        if (current.agType !== data.agType) {
            await this.setAgType(data.agType);
            dirty = true;
        }
        if (!dirty) return current;
        await this.saveEdit();
        return this.readRule();
    }

    async readBack(name: string): Promise<OvertimeRuleReadBack> {
        await this.openByName(name);
        return this.readRule();
    }
}

export default OvertimeRulePage;
