import { Locator, Page, expect } from '@playwright/test';
import { CrewPunchPage } from './CrewPunchPage';

/**
 * Input ▸ Batch ▸ Crew Time In (`/input/crew-time-in/new`) — clocks a whole crew in.
 *
 * The job is here, labelled **Phase** rather than "Job" — and it is what makes the day
 * transferable: without it analyze returns `plannableTotal 0` (measured 4 vs 0 on dev 2026-09-29)
 * while still listing the rows as eligible, so a jobless day silently produces no job cards.
 */
export class CrewTimeInPage extends CrewPunchPage {
    /** Sub-crew table. Crew-scoped: it only offers the chosen crew's tables. */
    readonly tableCombobox: Locator;
    readonly deselectAllButton: Locator;

    constructor(page: Page) {
        super(page, '/input/crew-time-in/new', /New Crew Time In/i);
        this.tableCombobox = page.locator('#crewTableCounter');
        this.deselectAllButton = page.getByRole('button', { name: /Deselect All/i });
    }

    /**
     * Choose the sub-crew table. **Select the crew first.**
     *
     * The picker is crew-scoped in the direction that surprises: opened with no crew
     * set it lists every table in the tenant, and once a crew is set it lists only
     * that crew's — so an empty listbox means "this crew owns no tables", not "not
     * loaded yet" (measured live 2026-09-30). Picking before the crew would offer a
     * table belonging to someone else.
     */
    async selectTable(name: string): Promise<void> {
        await this.pickCombo(this.tableCombobox, name);
    }

    /** The table currently chosen, as the picker displays it. */
    async readTable(): Promise<string> {
        return this.tableCombobox.inputValue();
    }

    /** The crew currently chosen, as the picker displays it. */
    async readCrew(): Promise<string> {
        return this.crewCombobox.inputValue();
    }

    /**
     * Source the roster from crew membership. Unchecked, the form lists only employees who
     * already have time cards for the crew (`employees-from-timecards`), which is empty for a
     * fixture crew with no history; checked, it asks `crew-time-in/employees?crewCounter=`.
     */
    async useEmployeeCrew(): Promise<void> {
        const box = this.page.getByRole('checkbox', { name: 'Use Employee Crew' });
        if (!(await box.isChecked())) await box.check();
        await expect(box).toBeChecked();
    }

    /**
     * Narrow the punch to named employees.
     *
     * The crew's members arrive **pre-checked**, so this deselects everything and
     * ticks back the ones asked for — the opposite of the select-from-empty a reader
     * would assume. Each checkbox is named by the employee's name alone: not the code,
     * not "code - name".
     */
    async selectOnlyEmployees(names: string[]): Promise<void> {
        await this.deselectAllButton.waitFor({ state: 'visible', timeout: 25_000 });
        await this.deselectAllButton.click();
        for (const name of names) {
            const box = this.page.getByRole('checkbox', { name, exact: true });
            await box.waitFor({ state: 'visible', timeout: 15_000 });
            await box.check();
            await expect(box, `'${name}' did not stay selected`).toBeChecked();
        }
    }

    /**
     * Clock a crew in. Without `employees` the crew's whole membership is punched,
     * which is the form's own default.
     */
    async punchIn(opts: {
        day: string;
        hour: number;
        minute: number;
        crew: string;
        ranch: string;
        field: string;
        job: string;
        table?: string;
        employees?: string[];
    }): Promise<void> {
        await this.gotoNew();
        await this.setDateTime(opts.day, opts.hour, opts.minute);
        // Before the crew and the rest: ticking it later blanked Field/Phase and Save then refused.
        if (opts.employees) await this.useEmployeeCrew();
        await this.selectCrew(opts.crew);
        await this.selectRanch(opts.ranch);
        await this.selectField(opts.field);
        await this.selectJob(opts.job);
        // After the crew, which is what populates both the table picker and the roster.
        if (opts.table) await this.selectTable(opts.table);
        if (opts.employees) await this.selectOnlyEmployees(opts.employees);
        await this.save();
    }

    /** Open a saved crew time-in by id, to read back what the form recorded. */
    async gotoEdit(id: number): Promise<void> {
        await this.page.goto(`/input/crew-time-in/${String(id)}`);
        await this.crewCombobox.waitFor({ state: 'visible', timeout: 30_000 });
        await expect(this.crewCombobox).not.toHaveValue('', { timeout: 30_000 });
    }
}

export default CrewTimeInPage;
