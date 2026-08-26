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
    /** The "Warnings (n)" pill in {@link topStrip}. */
    readonly warningsCounter: Locator;
    /** The Issues breakdown panel below the grid. */
    readonly issuesRegion: Locator;

    /**
     * The Time In side panel opened from a row — title "Time In", fields
     * Reference / Date-Time / Ranch / Field / Phase / Employee / Work Crew /
     * GPS Reading, footer Delete / Cancel / Save. Scoped to the innermost `div`
     * carrying both the heading and the Cancel button: any ancestor wrapping the
     * panel also satisfies the same `has` filters, so `.last()` picks the
     * tightest container rather than the whole page shell.
     */
    readonly timeInPanel: Locator;
    readonly panelCancelButton: Locator;
    readonly panelRanchValue: Locator;
    readonly panelFieldValue: Locator;
    readonly panelPhaseValue: Locator;
    readonly panelEmployeeValue: Locator;
    readonly panelWorkCrewValue: Locator;
    /**
     * GPS Reading is a plain text box, NOT an Autocomplete combobox like the
     * lookup fields beside it (no dropdown chevron in the recording) — so the
     * textbox role, not combobox. Note the deployed dev build has the label in
     * its bundle but did not render the field on a card that carries a fix, so
     * the caller must treat absence as a renderable state, not an error.
     */
    readonly panelGpsValue: Locator;

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
        this.warningsCounter = this.topStrip.getByText(/Warnings/i);
        this.issuesRegion = page.getByRole('region', { name: 'Issues' });

        this.timeInPanel = page
            .locator('div')
            .filter({ has: page.getByRole('heading', { name: /^Time In$/i }) })
            .filter({ has: page.getByRole('button', { name: /^Cancel$/i }) })
            .last();
        this.panelCancelButton = this.timeInPanel.getByRole('button', { name: /^Cancel$/i });
        this.panelRanchValue = this.comboboxByLabel('Ranch');
        this.panelFieldValue = this.comboboxByLabel('Field');
        this.panelPhaseValue = this.comboboxByLabel('Phase');
        this.panelEmployeeValue = this.comboboxByLabel('Employee');
        this.panelWorkCrewValue = this.comboboxByLabel('Work Crew');
        this.panelGpsValue = this.timeInPanel.getByRole('textbox', { name: /^GPS Reading\b/ });
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
     *
     * For any other day, typing into the segments never commits (the chip keeps
     * the previous range); clicking the calendar day cell ("Monday, August 24th,
     * 2026") does. One click collapses the range onto that day, a second click
     * on the same cell toggles it back to today — hence the read-back guard.
     */
    async applyDateRange(date = new Date()): Promise<void> {
        const pad = (n: number) => String(n).padStart(2, '0');
        const sameDay = (a: Date, b: Date) =>
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        await this.dateRangeFilter.click();
        const popup = this.page.getByRole('dialog');
        await popup.waitFor({ state: 'visible', timeout: 10_000 });

        // Prefer the popup's quick-select presets: typing into the segmented
        // Month/Day/Year inputs commits nothing for a non-today date (the chip
        // stays on today), which only ever *looked* like it worked because the
        // chip already displayed today.
        const preset = sameDay(date, new Date())
            ? 'Today'
            : sameDay(date, yesterday)
              ? 'Yesterday'
              : null;
        if (preset) {
            await popup.getByText(preset, { exact: true }).click();
        } else {
            const ordinal = (n: number) => {
                if (n % 10 === 1 && n % 100 !== 11) return 'st';
                if (n % 10 === 2 && n % 100 !== 12) return 'nd';
                if (n % 10 === 3 && n % 100 !== 13) return 'rd';
                return 'th';
            };
            const monthName = date.toLocaleString('en-US', { month: 'long' });
            const dayLabel = new RegExp(
                `${monthName} ${date.getDate()}${ordinal(date.getDate())}, ${date.getFullYear()}`,
            );
            // Only the past is ever requested (punchDate = today − N days), so
            // only "previous month" navigation is needed to bring an
            // out-of-view day into the two-month calendar.
            const prevMonthButton = popup.getByRole('button', { name: /go to the previous month/i });
            const dayCell = popup.getByRole('button', { name: dayLabel });
            for (let i = 0; i < 12 && (await dayCell.count()) === 0; i += 1) {
                await prevMonthButton.click();
            }
            await dayCell.first().waitFor({ state: 'visible', timeout: 10_000 });
            await dayCell.first().click();

            // Confirm both ends of the range collapsed onto the target day —
            // a stale range (e.g. a multi-day preset applied by an earlier
            // test) can need a second click to close onto a single day.
            // Clicking a third time would toggle it back off, so this reads
            // state rather than clicking blindly.
            const daySegments = popup.getByRole('textbox', { name: 'Day' });
            const collapsed = async () =>
                (await daySegments.nth(0).inputValue()) === String(date.getDate()) &&
                (await daySegments.nth(1).inputValue()) === String(date.getDate());
            if (!(await collapsed())) {
                await dayCell.first().click();
            }
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
     * The whole row, for asserting cells other than Reference and Status —
     * Type ("Piece Out"), Employee Selection ("Barcode Badge"), Crew.
     *
     * Needed because {@link rowFor} is the *Reference cell*, not the row, so
     * matching any other column's text against it always fails.
     */
    rowCells(timeCardCounter: number): Locator {
        return this.page.getByRole('row').filter({ has: this.rowFor(timeCardCounter) });
    }

    /**
     * The row's status badge — one of Ready / Blocking / Warning / Deferred.
     * The badge (`role="status"`, holding only the keyword — the cell around it
     * also says "Manually edited") lives in a different cell than the
     * `v2-grid-row-…` testid, which sits on the Reference cell. So climb from
     * that cell to its `role="row"` first, then find the badge.
     */
    rowStatus(timeCardCounter: number): Locator {
        return this.page
            .getByRole('row')
            .filter({ has: this.rowFor(timeCardCounter) })
            .getByRole('status');
    }

    /**
     * False when the server's analyze endpoint is disabled — the grid can then
     * never populate, so a missing row says nothing about the data.
     */
    async analyzeEnabled(): Promise<boolean> {
        return !(await this.analyzeError.isVisible().catch(() => false));
    }

    // ── Time In side panel ───────────────────────────────────────────

    /**
     * Open the Time In panel for one row. The panel is a click away from the
     * grid row, not a navigation, so it is asserted visible rather than waited
     * for via `goto`.
     */
    async openRow(timeCardCounter: number): Promise<void> {
        await this.rowFor(timeCardCounter).click();
        // 45s, not 15s: the panel shell opens instantly but its body sits on
        // "Loading…" until the Time In detail fetch returns, and that fetch has
        // been observed taking >15s on dev staging (2026-08-21). The locator
        // requires the panel's Cancel button, which only renders after the load.
        await this.timeInPanel.waitFor({ state: 'visible', timeout: 45_000 });
    }

    /** Close the panel without saving or deleting — the only exit this suite uses. */
    async cancelPanel(): Promise<void> {
        await this.panelCancelButton.click();
        await this.timeInPanel.waitFor({ state: 'hidden', timeout: 15_000 });
    }

    /**
     * A field's combobox control inside the panel, located by accessible name.
     * Dumping the live DOM showed the label text is NOT a sibling of the value —
     * `xpath=following::*[1]` landed on an empty `div.relative` wrapper instead,
     * because Ranch/Field/Phase/Employee/Work Crew are all rendered as
     * `role="combobox"` elements whose ARIA name already equals the label
     * (required fields get a trailing " *", hence the prefix match). Ranch's
     * displayed text is a real child node so `toContainText` reads it; the rest
     * are input-backed and must be asserted with `toHaveValue` at the call site.
     */
    private comboboxByLabel(label: string): Locator {
        return this.timeInPanel.getByRole('combobox', { name: new RegExp(`^${label}\\b`) });
    }

    /** Parses a "<Label> (<n>)" counter's count, e.g. {@link warningsCounter}. */
    private async counterCount(counter: Locator): Promise<number> {
        const text = (await counter.textContent()) ?? '';
        return Number(/\((\d+)\)/.exec(text)?.[1] ?? 0);
    }

    /** How many rows the top strip currently reports as Warning. */
    async warningsCount(): Promise<number> {
        return this.counterCount(this.warningsCounter);
    }

    /**
     * An issue group in the warnings/blocking breakdown, by its leading text.
     * Scoped to the `listbox` (the issues panel) and matched against the whole
     * `listitem`: the description and its "<n> affected" count are separate
     * sibling nodes, so `getByText` alone would resolve to the description-only
     * leaf and lose the count.
     */
    issueGroupByText(leadingText: string): Locator {
        return this.issuesRegion
            .getByRole('listitem')
            .filter({ hasText: new RegExp(`^${leadingText}`) });
    }

    /**
     * The panel only auto-expands when a blocking issue exists; a warnings-only
     * day leaves it collapsed, and role queries don't see collapsed content.
     */
    private async expandIssuesPanel(): Promise<void> {
        const expand = this.issuesRegion.getByRole('button', { name: /expand issues panel/i });
        if (await expand.isVisible().catch(() => false)) {
            await expand.click();
        }
    }

    /** The "affected" row count shown next to an issue group. */
    async issueGroupAffectedCount(leadingText: string): Promise<number> {
        await this.expandIssuesPanel();
        const group = this.issueGroupByText(leadingText);
        await group.waitFor({ state: 'visible', timeout: 15_000 });
        const text = (await group.textContent()) ?? '';
        const match = /affected\D*(\d+)|(\d+)\D*affected/i.exec(text);
        return Number(match?.[1] ?? match?.[2] ?? 0);
    }
}
