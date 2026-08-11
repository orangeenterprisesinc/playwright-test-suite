import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Input ▸ Transfer to Job Card (catalog D2/D4) — the screen Amy's Journey B
 * recordings end on: after a device sync and import, the crew's punches show up
 * here for review before anything is committed.
 *
 * Locators come from the deployed V2 screen (`transfer/v2/TransferToJobCardsPageV2.tsx`
 * plus `DemotedTimecardsGrid`), confirmed by dumping the live DOM on dev staging —
 * not from the component names.
 *
 * Two things to know before asserting on rows:
 *
 * 1. **The grid is ARIA-role based, not a `<table>`.** The shared `DataGrid`
 *    renders virtualized divs with `role="grid"/"row"/"cell"`, so `getByRole('row')`
 *    works but `page.locator('tr')` finds nothing.
 * 2. **Rows only appear after a date range is applied**, and the grid is populated by
 *    `POST /transfer-to-job-cards/analyze`, which is gated by the server-side
 *    `PT_TRANSFER_ANALYZE_ENABLED` flag — when it is off the endpoint 404s and the
 *    grid stays empty regardless of the data. {@link analyzeEnabled} distinguishes
 *    that environment gap from a genuinely missing row.
 *
 * Journey B uses this screen read-only; running the transfer itself is D4.
 */
export class TransferToJobCardsPage extends BasePage {
    readonly pageUrl: string = '/transfer-to-job-cards';
    readonly pageTitle: string | RegExp = /Transfer to Job Cards/i;

    /** Page root — present as soon as the screen mounts. */
    readonly pageRoot: Locator;
    /** Counters strip (ready / blocking / warnings / deferred). */
    readonly topStrip: Locator;
    readonly timeCardsTab: Locator;
    readonly jobCardsTab: Locator;
    /** The time-cards grid. */
    readonly grid: Locator;
    readonly gridHeader: Locator;
    /** Every rendered row (ARIA role, not a table row). */
    readonly rows: Locator;
    /** Shown while no date range has been applied — i.e. nothing analyzed yet. */
    readonly pickRangePrompt: Locator;
    /** Banner the page shows when the analyze call fails. */
    readonly analyzeError: Locator;
    /** The date-range column filter — the grid stays empty until it is applied. */
    readonly dateRangeFilter: Locator;

    constructor(page: Page) {
        super(page);
        this.pageRoot = page.getByTestId('transfer-v2-page');
        this.topStrip = page.getByTestId('transfer-v2-top-strip');
        this.timeCardsTab = page.getByTestId('ttjc-tab-timecards');
        this.jobCardsTab = page.getByTestId('ttjc-tab-jobcards');
        this.grid = page.getByTestId('v2-demoted-grid');
        this.gridHeader = page.getByTestId('v2-grid-header');
        this.rows = page.getByRole('row');
        this.pickRangePrompt = page.getByTestId('v2-grid-empty-pick-range');
        this.analyzeError = page.getByTestId('transfer-analyze-error-banner');
        this.dateRangeFilter = page.locator('#filter-dateTime');
    }

    async goto(): Promise<void> {
        await this.page.goto(this.pageUrl);
        await this.pageRoot.waitFor({ state: 'visible', timeout: 30_000 });
    }

    /**
     * Load the grid for a day — the step Amy performs at the end of the
     * recordings, and the only way rows ever appear (the screen analyses nothing
     * until a range is committed).
     *
     * The filter is a segmented date input, not a text field: two groups of
     * Month/Day/Year with `aria-label`s, plus Cancel/Apply. Two things learned the
     * hard way:
     *   - Apply does nothing while the segments are untouched, even though they
     *     already display today, so each group must be typed before committing.
     *   - Typing `MMDDYYYY` into a group's Month segment auto-advances through the
     *     rest; intermediate values can look garbled while the chip still resolves
     *     correctly, so assert the committed chip rather than the segments.
     */
    async applyDateRange(date = new Date()): Promise<void> {
        const pad = (n: number) => String(n).padStart(2, '0');
        const typed = `${pad(date.getMonth() + 1)}${pad(date.getDate())}${date.getFullYear()}`;

        await this.dateRangeFilter.click();
        const months = this.page.locator('input[aria-label="Month"]');
        await months.first().waitFor({ state: 'visible', timeout: 10_000 });
        for (let i = 0; i < (await months.count()); i += 1) {
            await months.nth(i).click();
            await this.page.keyboard.type(typed, { delay: 60 });
        }
        await this.page.getByRole('button', { name: /^apply$/i }).click();

        const expected = `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
        await expect(this.dateRangeFilter).toContainText(expected, { timeout: 20_000 });
    }

    /** Screenshot of the screen as the reviewer sees it, for the run's evidence. */
    async screenshot(): Promise<Buffer> {
        return this.page.screenshot();
    }

    /**
     * Wait for the grid to finish analysing, then report its candidate count.
     *
     * Must poll: the heading renders "Transfer Candidates (0)" immediately and is
     * only rewritten when the analyze response lands, so reading it once returns 0
     * from a grid that is merely still loading.
     */
    async waitForCandidates(atLeast = 1, timeout = 45_000): Promise<number> {
        const heading = this.page.getByRole('heading', { name: /Transfer Candidates/i }).first();
        await heading.waitFor({ state: 'visible', timeout });

        const count = async () =>
            Number(/\((\d+)\)/.exec((await heading.textContent()) ?? '')?.[1] ?? 0);
        await expect
            .poll(count, {
                timeout,
                message: `grid never loaded at least ${atLeast} transfer candidate(s)`,
            })
            .toBeGreaterThanOrEqual(atLeast);
        return count();
    }

    /**
     * The Reference cell of one time card's row. Its text is the card's
     * `reference`, which is what ties an office row back to the device record.
     */
    rowFor(timeCardCounter: number): Locator {
        return this.page.getByTestId(`v2-grid-row-${timeCardCounter}`);
    }

    /** A row located by its reference text, for when the counter is unknown. */
    rowByReference(reference: string): Locator {
        return this.page.getByRole('row', { name: reference });
    }

    /**
     * False when the server's analyze endpoint is disabled — the grid can then
     * never populate, so a missing row says nothing about the data.
     */
    async analyzeEnabled(): Promise<boolean> {
        return !(await this.analyzeError.isVisible().catch(() => false));
    }
}
