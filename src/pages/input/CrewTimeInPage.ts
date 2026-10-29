import { Page, expect } from '@playwright/test';
import { CrewPunchPage } from './CrewPunchPage';

/**
 * Input ▸ Batch ▸ Crew Time In (`/input/crew-time-in/new`) — clocks a whole crew in.
 *
 * The job is here, labelled **Phase** rather than "Job" — and it is what makes the day
 * transferable: without it analyze returns `plannableTotal 0` (measured 4 vs 0 on dev 2026-09-29)
 * while still listing the rows as eligible, so a jobless day silently produces no job cards.
 *
 * There is no Table picker: WEBPET-3734 (web-pet #1526) removed it, as legacy Crew In never had one.
 * The table is chosen on Crew Time Out ({@link CrewTimeOutPage}).
 */
export class CrewTimeInPage extends CrewPunchPage {
    constructor(page: Page) {
        super(page, '/input/crew-time-in', ['Input', 'Crew Time In'], /New Crew Time In/i);
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

    /** Clock a crew in. Without `employees` the crew's whole membership is punched. */
    async punchIn(opts: {
        day: string;
        hour: number;
        minute: number;
        crew: string;
        ranch: string;
        field: string;
        job: string;
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
        if (opts.employees) await this.selectOnlyEmployees(opts.employees);
        else await this.selectAllEmployees();
        await this.save();
    }
}

export default CrewTimeInPage;
