import { Locator, Page, expect } from '@playwright/test';
import { CrewPunchPage } from './CrewPunchPage';

/**
 * Input ▸ Batch ▸ Crew Time Out (`/input/crew-time-out/new`) — the closing punch.
 *
 * It only offers employees who already have an open time-in for that crew and day, and rejects the
 * save with "No employees with open time in found for this crew" otherwise. So it cannot be used
 * before {@link CrewTimeInPage}, and a day without it is not transferable at all: the transfer
 * emits `warn.incomplete_time_in` and writes no job card.
 *
 * It carries the sub-crew **Table** (since WEBPET-3734 Crew Time In has none): every ticked
 * employee gets its own time-out card with the chosen table.
 */
export class CrewTimeOutPage extends CrewPunchPage {
    /** Sub-crew table. Crew-scoped: it only offers the chosen crew's tables. */
    readonly tableCombobox: Locator;

    constructor(page: Page) {
        super(page, '/input/crew-time-out', ['Input', 'Crew Time Out'], /New Crew Time Out/i);
        this.tableCombobox = page.locator('#crewTableCounter');
    }

    /**
     * Choose the sub-crew table. **Select the crew first**: the crew's change handler clears the
     * table, and the picker lists only the chosen crew's tables.
     */
    async selectTable(name: string): Promise<void> {
        await this.pickCombo(this.tableCombobox, name);
    }

    /** The table currently chosen, as the picker displays it. Crew-scoped, so it refetches after Crew fills and reads "" until it lands. */
    async readTable(): Promise<string> {
        await expect(this.tableCombobox).not.toHaveAttribute('placeholder', /^Loading/, { timeout: 15_000 });
        return this.tableCombobox.inputValue();
    }

    /**
     * No Phase is set here on purpose. Choosing a piece-paid job on this form makes "Number of
     * Pieces" required, and the pieces belong to the crew piece-out — putting them here as well
     * would count them twice. The closing punch only has to pair with the time-in.
     *
     * Without `employees` the roster is left as the form offers it, so existing callers behave as before.
     */
    async punchOut(opts: {
        day: string;
        hour: number;
        minute: number;
        crew: string;
        table?: string;
        employees?: string[];
    }): Promise<void> {
        await this.gotoNew();
        await this.setDateTime(opts.day, opts.hour, opts.minute);
        await this.selectCrew(opts.crew);
        if (opts.table) await this.selectTable(opts.table);
        if (opts.employees) await this.selectOnlyEmployees(opts.employees);
        await this.save();
    }

    /** Open a saved crew time-out from the list (the day's range, then its reference link), to read back what the form recorded. */
    async gotoEdit(opts: { day: string; reference: string }): Promise<void> {
        await this.gotoEditFromList('Edit Crew Time Out', opts.day, opts.reference);
    }
}

export default CrewTimeOutPage;
