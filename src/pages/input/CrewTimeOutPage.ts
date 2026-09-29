import { Page } from '@playwright/test';
import { CrewPunchPage } from './CrewPunchPage';

/**
 * Input ▸ Batch ▸ Crew Time Out (`/input/crew-time-out/new`) — the closing punch.
 *
 * It only offers employees who already have an open time-in for that crew and day, and rejects the
 * save with "No employees with open time in found for this crew" otherwise. So it cannot be used
 * before {@link CrewTimeInPage}, and a day without it is not transferable at all: the transfer
 * emits `warn.incomplete_time_in` and writes no job card.
 */
export class CrewTimeOutPage extends CrewPunchPage {
    constructor(page: Page) {
        super(page, '/input/crew-time-out/new', /New Crew Time Out/i);
    }

    /**
     * No Phase is set here on purpose. Choosing a piece-paid job on this form makes "Number of
     * Pieces" required, and the pieces belong to the crew piece-out — putting them here as well
     * would count them twice. The closing punch only has to pair with the time-in.
     */
    async punchOut(opts: { day: string; hour: number; minute: number; crew: string }): Promise<void> {
        await this.gotoNew();
        await this.setDateTime(opts.day, opts.hour, opts.minute);
        await this.selectCrew(opts.crew);
        await this.save();
    }
}

export default CrewTimeOutPage;
