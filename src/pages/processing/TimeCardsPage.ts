import { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * View ▸ Time Cards — the read-only grid of imported time cards, and the screen
 * Amy uses at the end of the WEBPET-1526 (B7) recording to confirm which
 * employee each sticker scan landed on.
 *
 * In her recording (keyframes 318 → 384) she filters the range to a single day
 * and reads the **Employee** and **Employee Selection** columns: the piece-outs
 * whose prefix matched an assignment show the owner's name, the rest show
 * "Undefined Employ…" (truncated by the column), all with Employee Selection
 * "Sticker Code". Opening a row gives an "Edit Time Out" panel carrying the
 * Memo that explains why.
 *
 * Two things carried over from {@link TransferToJobCardsPage}, which this
 * mirrors deliberately:
 *
 * 1. **The grid is ARIA-role based, not a `<table>`** — `getByRole('row')`
 *    works, `page.locator('tr')` finds nothing.
 * 2. **Rows only appear once a date range is applied.** Unlike Transfer, this
 *    screen needs no `analyze` call, so a populated range is the only
 *    precondition.
 *
 * The grid truncates long values ("Undefined Employ…"), so assertions here use
 * substring matching. Exact identity belongs on the API — `GET /time-cards`
 * returns `employeeCounter`, which is what proves *which* employee a row is on.
 * This screen proves what a reviewer actually sees.
 */
export class TimeCardsPage extends BasePage {
    readonly pageUrl: string = '/view/time-cards';
    readonly pageTitle: string | RegExp = /Time Cards/i;

    /** Page heading — present as soon as the screen mounts. */
    readonly heading: Locator;
    /**
     * Time Cards filters on two `datetime-local` textboxes plus an explicit
     * Apply Filter button — NOT the calendar popup Transfer to Job Cards uses.
     * The screen says so itself: "Read-only view of TimeCard records. Apply a
     * filter to load rows."
     */
    readonly startDateTime: Locator;
    readonly lastDateTime: Locator;
    readonly applyFilterButton: Locator;
    /** Every rendered row (ARIA role, not a table row). */
    readonly rows: Locator;
    /** The "Total N rows" footer the recording shows beneath the grid. */
    readonly totalRows: Locator;

    constructor(page: Page) {
        super(page);
        this.heading = page.getByRole('heading', { name: /^Time Cards$/i });
        this.startDateTime = page.getByRole('textbox', { name: 'Start Date/Time In' });
        this.lastDateTime = page.getByRole('textbox', { name: 'Last Date/Time In' });
        this.applyFilterButton = page.getByRole('button', { name: /^Apply Filter$/i });
        this.rows = page.getByRole('row');
        this.totalRows = page.getByText(/Total \d+ rows/i);
    }

    async goto(): Promise<void> {
        await this.page.goto(this.pageUrl);
        await this.heading.waitFor({ state: 'visible', timeout: 30_000 });
    }

    /**
     * Load the grid for a day — rows only appear once a range is applied, which
     * is the step Amy performs before reading the Employee columns (kf 318).
     */
    async applyDateRange(date = new Date()): Promise<void> {
        const pad = (n: number) => String(n).padStart(2, '0');
        const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

        // `datetime-local` inputs: fill takes the full `YYYY-MM-DDTHH:mm` value.
        // Both ends collapse onto the one day, matching the single-day range Amy
        // applies before reading the grid.
        await this.startDateTime.fill(`${ymd}T00:00`);
        await this.lastDateTime.fill(`${ymd}T23:59`);
        await this.applyFilterButton.click();

        // The grid renders its rows only after the filter round-trips.
        await this.totalRows.waitFor({ state: 'visible', timeout: 30_000 });
    }

    /**
     * A row located by its reference text — the device's own `Reference`, which
     * is the only value tying an office row back to the record that produced it.
     * The grid renders the reference in its own cell, so the accessible row name
     * contains it.
     */
    rowByReference(reference: string): Locator {
        return this.page.getByRole('row', { name: reference });
    }

    /**
     * The visible text of one row, for asserting the columns Amy reads:
     * Employee and Employee Selection. Returns the row's whole text because the
     * grid virtualizes cells and column order is not a contract.
     */
    async rowText(reference: string): Promise<string> {
        const row = this.rowByReference(reference);
        await row.first().waitFor({ state: 'visible', timeout: 20_000 });
        return (await row.first().innerText()).replace(/\s+/g, ' ').trim();
    }

    /** Screenshot of the grid as the reviewer sees it, for the run's evidence. */
    async screenshot(): Promise<Buffer> {
        return this.page.screenshot();
    }
}

export default TimeCardsPage;
