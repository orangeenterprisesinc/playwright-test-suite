/**
 * Setup ▸ Table (`/setup/crew-tables`): the pack-house sub-crew grouping of catalog C6. A list of
 * tables (Name / Crew / Supervisor / Active) and a New/Edit form with Name, Crew, Supervisor and an
 * Active switch. Grid, on-blur validation and the Save dance come from SetupScreenPage.
 *
 * Live 2026-09-25: the sidebar item is "Table" under Setup (alphabetical, between Ranch and
 * Variety); the grid is named "Tables"; buttons read "New Table"; edit links "Edit Table: <name>".
 * The only rejection is the server's per-crew uniqueness 409, surfaced as the generic toast.
 */
import { expect, Locator, Page } from '@playwright/test';
import { SetupScreenPage } from '../SetupScreenPage';

export interface NewCrewTableData {
    name: string;
    /** Crew name as the picker lists it. */
    crew: string;
    /** Supervisor name as the picker lists it (an active employee); omitted leaves it empty. */
    supervisor?: string;
}

export type CrewTableSaveOutcome = 'created' | 'duplicate-name';

export class CrewTablePage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly crewCombobox: Locator;
    readonly supervisorCombobox: Locator;
    readonly activeSwitch: Locator;
    readonly listbox: Locator;
    /** "Table created" success toast. */
    readonly tableCreatedToast: Locator;
    /** Shown on the Edit page when the record cannot be loaded (dev defect, see crewTablesApi.ts). */
    readonly notFoundMessage: Locator;

    constructor(page: Page) {
        super(page, {
            listUrl: '/setup/crew-tables',
            gridName: 'Tables',
            entity: 'Table',
            menuPath: ['Setup', 'Table'],
            rejectionMessage: /already exists for this crew|Failed to create table/,
        });
        this.nameInput = page.getByRole('textbox', { name: 'Name *' });
        this.crewCombobox = page.getByRole('combobox', { name: 'Crew *' });
        this.supervisorCombobox = page.getByRole('combobox', { name: 'Supervisor' });
        this.activeSwitch = page.getByRole('switch', { name: 'Active' });
        this.listbox = page.getByRole('listbox');
        this.tableCreatedToast = page.getByText('Table created');
        this.notFoundMessage = page.getByText('Table not found.');
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    /** The bare name, or "<exportIdentifier> : <name>" — how the pickers label options and values. */
    private static labelPattern(label: string): RegExp {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|: )${escaped}$`);
    }

    private option(label: string): Locator {
        return this.page.getByRole('option', { name: CrewTablePage.labelPattern(label) });
    }

    /**
     * Pick from a searchable picker. The pickers look their options up on the server
     * (`limit=101`), so a name beyond the first page only appears after typing it.
     */
    private async pick(combobox: Locator, label: string): Promise<void> {
        await combobox.click();
        await this.listbox.waitFor({ state: 'visible' });
        const option = this.option(label);
        if (!(await option.isVisible().catch(() => false))) {
            await this.page.keyboard.type(label);
        }
        await option.click();
        // The picker is an <input role="combobox">: the selection is its value, not its text.
        await expect(combobox).toHaveValue(CrewTablePage.labelPattern(label));
    }

    async selectCrew(crew: string): Promise<void> {
        await this.pick(this.crewCombobox, crew);
    }

    async selectSupervisor(supervisor: string): Promise<void> {
        await this.pick(this.supervisorCombobox, supervisor);
    }

    async gotoTablesList(): Promise<void> {
        await this.gotoList();
    }

    async openNewTableForm(): Promise<void> {
        await this.openNewForm();
    }

    async openEditTable(name: string): Promise<void> {
        await this.openEdit(name);
    }

    async fillForm(data: NewCrewTableData): Promise<void> {
        await this.nameInput.fill(data.name);
        await this.selectCrew(data.crew);
        if (data.supervisor !== undefined) await this.selectSupervisor(data.supervisor);
    }

    /** Submit the New Table form; the only rejection is a duplicate name under the same crew. */
    async submit(): Promise<CrewTableSaveOutcome> {
        const outcome = await this.submitForm();
        return outcome === 'created' ? 'created' : 'duplicate-name';
    }

    /** List → New → fill → save. */
    async createTable(data: NewCrewTableData): Promise<CrewTableSaveOutcome> {
        await this.gotoTablesList();
        await this.openNewTableForm();
        await this.fillForm(data);
        return this.submit();
    }

    /** The saved record's id from the Edit URL `/setup/crew-tables/{id}`. */
    savedTableId(): number {
        const match = /\/setup\/crew-tables\/(\d+)/.exec(this.page.url());
        if (!match) throw new Error(`not on an Edit Table page: ${this.page.url()}`);
        return Number(match[1]);
    }

    tableRow(name: string): Locator {
        return this.grid.rowFor(name);
    }

    /** Filter the list by name and assert the one row shows the crew and Active "Yes". */
    async expectListedUnderCrew(name: string, crew: string): Promise<void> {
        await this.grid.filterByName(name);
        const row = this.tableRow(name);
        await expect(row).toHaveCount(1);
        await expect(row).toContainText(crew);
        await expect(row).toContainText('Yes');
    }
}

export default CrewTablePage;
