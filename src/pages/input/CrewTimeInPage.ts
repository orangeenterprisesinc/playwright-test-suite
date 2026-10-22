import { Locator, Page, expect } from '@playwright/test';
import { CrewPunchPage } from './CrewPunchPage';
import { ListDateRangeComponent } from '../../components/ListDateRangeComponent';

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
    /** One button that flips between "Select All" and "Deselect All" with the roster's state. */
    readonly selectAllToggle: Locator;
    private readonly dateRange: ListDateRangeComponent;

    constructor(page: Page) {
        super(page, '/input/crew-time-in', ['Input', 'Crew Time In'], /New Crew Time In/i);
        this.dateRange = new ListDateRangeComponent(page);
        this.tableCombobox = page.locator('#crewTableCounter');
        this.selectAllToggle = page.getByRole('button', { name: /^(De)?select All$/i });
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

    /** The table currently chosen, as the picker displays it. Crew-scoped, so it refetches after Crew fills and reads "" until it lands. */
    async readTable(): Promise<string> {
        await expect(this.tableCombobox).not.toHaveAttribute('placeholder', /^Loading/, { timeout: 15_000 });
        return this.tableCombobox.inputValue();
    }

    /** The crew currently chosen, as the picker displays it. */
    async readCrew(): Promise<string> {
        await expect(this.crewCombobox).not.toHaveAttribute('placeholder', /^Loading/, { timeout: 15_000 });
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
     * A roster checkbox by employee name. Dev labels them "<code>: <name>" (seen 2026-10-12), and
     * renders ": <name>" when the code is missing from the roster payload, so match the name as
     * the label's tail, optionally behind a "<code>: " prefix.
     */
    employeeCheckbox(name: string): Locator {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return this.page.getByRole('checkbox', { name: new RegExp(`^(?:[^:]*:\\s*)?${escaped}$`) });
    }

    /** Punch the crew's whole roster, whichever state it arrives in. */
    async selectAllEmployees(): Promise<void> {
        await this.selectAllToggle.waitFor({ state: 'visible', timeout: 25_000 });
        if (/^select all$/i.test((await this.selectAllToggle.innerText()).trim())) await this.selectAllToggle.click();
        await expect(this.selectAllToggle).toHaveText(/^Deselect All$/i);
    }

    /**
     * Narrow the punch to named employees: clear the roster, then tick back the ones asked for.
     * The toggle reads "Deselect All" only while every member is checked, so clear through it
     * when it says so — clicking "Select All" would do the opposite.
     */
    async selectOnlyEmployees(names: string[]): Promise<void> {
        await this.selectAllToggle.waitFor({ state: 'visible', timeout: 25_000 });
        if (/^deselect all$/i.test((await this.selectAllToggle.innerText()).trim())) await this.selectAllToggle.click();
        for (const name of names) {
            const box = this.employeeCheckbox(name);
            await box.waitFor({ state: 'visible', timeout: 15_000 });
            await box.check();
            await expect(box, `'${name}' did not stay selected`).toBeChecked();
        }
    }

    /** Clock a crew in. Without `employees` the crew's whole membership is punched. */
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
        // Always, and before the crew: the default timecard-sourced roster is empty for a fixture
        // crew with no history, and ticking this later blanked Field/Phase so Save refused.
        await this.useEmployeeCrew();
        await this.selectCrew(opts.crew);
        await this.selectRanch(opts.ranch);
        await this.selectField(opts.field);
        await this.selectJob(opts.job);
        // After the crew, which is what populates both the table picker and the roster.
        if (opts.table) await this.selectTable(opts.table);
        if (opts.employees) await this.selectOnlyEmployees(opts.employees);
        else await this.selectAllEmployees();
        await this.save();
    }

    /** Open a saved crew time-in from the list (the day's range, then its reference link), to read back what the form recorded. */
    async gotoEdit(opts: { day: string; reference: string }): Promise<void> {
        await this.leftNav.openScreen(['Input', 'Crew Time In'], '/input/crew-time-in');
        await this.dateRange.apply(opts.day);
        await this.page.getByRole('link', { name: `Edit Crew Time In: ${opts.reference}`, exact: true }).click();
        await this.page.waitForURL((url) => /^\/input\/crew-time-in\/\d+$/.test(url.pathname));
        await this.crewCombobox.waitFor({ state: 'visible', timeout: 30_000 });
        await expect(this.crewCombobox).not.toHaveValue('', { timeout: 30_000 });
    }
}

export default CrewTimeInPage;
