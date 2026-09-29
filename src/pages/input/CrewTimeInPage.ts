import { Page } from '@playwright/test';
import { CrewPunchPage } from './CrewPunchPage';

/**
 * Input ▸ Batch ▸ Crew Time In (`/input/crew-time-in/new`) — clocks a whole crew in.
 *
 * The job is here, labelled **Phase** rather than "Job" — and it is what makes the day
 * transferable: without it analyze returns `plannableTotal 0` (measured 4 vs 0 on dev 2026-09-29)
 * while still listing the rows as eligible, so a jobless day silently produces no job cards.
 */
export class CrewTimeInPage extends CrewPunchPage {
    constructor(page: Page) {
        super(page, '/input/crew-time-in/new', /New Crew Time In/i);
    }

    /** The crew's members are pre-selected once the crew is chosen, so only the context is set here. */
    async punchIn(opts: { day: string; hour: number; minute: number; crew: string; ranch: string; field: string; job: string }): Promise<void> {
        await this.gotoNew();
        await this.setDateTime(opts.day, opts.hour, opts.minute);
        await this.selectCrew(opts.crew);
        await this.selectRanch(opts.ranch);
        await this.selectField(opts.field);
        await this.selectJob(opts.job);
        await this.save();
    }
}

export default CrewTimeInPage;
