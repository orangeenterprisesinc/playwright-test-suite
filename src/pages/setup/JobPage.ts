/**
 * Setup ▸ Job (`/setup/jobs`): the job record D6 re-rates. Grid, on-blur validation and the Save
 * dance come from SetupScreenPage.
 *
 * The rate change is catalog D6's own step 1 ("change the pay rate or setup record"), so it is
 * driven here rather than through `PUT /jobs/{id}` — a workflow step a user performs belongs on
 * screen, and a repro recording that skips it shows nothing.
 *
 * Live 2026-09-29: editing a Piece job renders both `#pieceRate` ("Piece Rate *") and `#hourlyRate`
 * ("Hourly Rate"); the piece one is the required field. The form hydrates after `GET /jobs/{id}`
 * answers, and anything typed before that lands is wiped by the reset — hence the wait on Name
 * holding the record's value before touching the rate.
 */
import { expect, Locator, Page } from '@playwright/test';
import { SetupScreenPage } from '../SetupScreenPage';

export class JobPage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly pieceRateInput: Locator;
    readonly hourlyRateInput: Locator;

    constructor(page: Page) {
        super(page, {
            listUrl: '/setup/jobs',
            gridName: 'Jobs',
            entity: 'Job',
            menuPath: ['Setup', 'Job'],
            rejectionMessage: /already (exists|in use)|Failed to (create|update) job/i,
        });
        this.nameInput = page.locator('#name');
        this.pieceRateInput = page.locator('#pieceRate');
        this.hourlyRateInput = page.locator('#hourlyRate');
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    /** Open a job's Edit form by id and wait for the record to hydrate into the fields. */
    async gotoEditById(jobCounter: number, expectedName: string): Promise<void> {
        await this.page.goto(`/setup/jobs/${jobCounter}`);
        await this.nameInput.waitFor({ state: 'visible' });
        // The form resets when GET /jobs/{id} lands; typing before that is silently discarded.
        await expect(this.nameInput).toHaveValue(expectedName, { timeout: 30_000 });
    }

    /**
     * Set the job's piece rate on screen and save. Returns the value the form holds afterwards, so
     * the caller asserts the change against the UI it just drove rather than against its own input.
     */
    async setPieceRate(rate: number): Promise<string> {
        const current = await this.pieceRateInput.inputValue();
        // Writing the value it already holds leaves the form clean, and Save correctly never
        // enables — so there is nothing to save, not a failure.
        if (Number(current) === rate) return current;

        const editUrl = this.page.url();
        await this.pieceRateInput.fill(String(rate));
        // Validation runs on blur, and Save stays disabled until it has.
        await this.pieceRateInput.blur();
        await expect(this.saveButton, `Save stayed disabled after setting Piece Rate to ${rate}`).toBeEnabled({ timeout: 15_000 });
        await this.saveButton.click();
        // The Unsaved-changes bar clears once the update commits.
        await expect(this.unsavedChangesBar).toBeHidden({ timeout: 15_000 });

        // Saving leaves the form, so read the rate back from a fresh load of the record rather than
        // from the fields we just typed into - that is what makes this a UI verification.
        await this.page.goto(editUrl);
        await this.pieceRateInput.waitFor({ state: 'visible', timeout: 30_000 });
        await expect(this.pieceRateInput).not.toHaveValue('', { timeout: 30_000 });
        return this.pieceRateInput.inputValue();
    }
}

export default JobPage;
