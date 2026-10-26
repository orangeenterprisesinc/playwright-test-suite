/**
 * @fileoverview Time In list — `/input/time-in` (WEBPET-666).
 *
 * The first converted page under `/input` rather than `/setup`, and the reason it
 * has its own regression spec is a real bug class the setup pages could not
 * expose:
 *
 * **Its dropdown columns key options by *counter*, not by name.** The column's
 * `onCommit` used to resolve the selected entity by name while the incoming
 * value was actually the counter string, so the lookup failed, `commitEdit` was
 * never called, and the edit silently reverted with no error. Field's combobox
 * propagation test does not cover this — Field keys options by name.
 *
 * The date filters narrow the grid to a populated day so the first data rows are
 * reliably in the DOM, below the 100-row virtualization threshold. Since the
 * screen started deferring loads behind an Apply button (measured 2026-09-24:
 * filling both inputs alone still loads zero rows — "Choose a date range and
 * click Apply to load records."), {@link filterToDay} must click it too.
 */
import { Locator, Page, expect } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class TimeInListPage extends WebpetListPage {
    /** Opens the From – To range picker (replaced the #filter-from / #filter-to inputs, run 40188410670). */
    readonly dateRangeTrigger: Locator;
    /** Commits the date window — the grid loads nothing until this is clicked. */
    readonly applyButton: Locator;

    constructor(page: Page) {
        super(page, '/input/time-in', /time in/i);

        this.dateRangeTrigger = page.getByRole('button', { name: 'From – To' });
        this.applyButton = page.getByTestId('list-date-range-apply');
    }

    /**
     * Column index of the Ranch cell.
     *
     * The row's cells are `[selection, delete, reference, dateTime, employeeName,
     * ranchName, …]`, so Ranch is index 5 — the per-row delete column landed at
     * index 1 with web-pet #871 (WEBPET-2685, 2026-09-08) and shifted everything
     * after it. Named rather than inlined because an off-by-one here silently
     * drives the wrong column's editor.
     */
    static readonly RANCH_CELL_INDEX = 5;

    /**
     * Narrow the grid to a single day and load it. The picker only commits through its own Apply (typed segments and
     * Escape are discarded), and the toolbar Apply then loads the rows. Measured live 2026-10-26.
     */
    async filterToDay(day: string): Promise<void> {
        const [year, month, date] = day.split('-');
        const target = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
        const monthName = target.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

        await this.dateRangeTrigger.click();
        const picker = this.page.getByRole('dialog').filter({ has: this.page.getByRole('grid') });
        // Two months show side by side; the first one's caption steers the paging.
        const caption = picker.getByRole('status').first();
        for (let step = 0; step < 36; step += 1) {
            const shown = new Date(`${(await caption.innerText()).trim()} 1 UTC`);
            if (shown.getTime() === target.getTime()) break;
            const direction = shown < target ? 'Next' : 'Previous';
            await picker.getByRole('button', { name: `Go to the ${direction} Month` }).click();
            await expect(caption).not.toHaveText(shown.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
        }
        const dayButton = picker.getByRole('button', { name: new RegExp(`, ${monthName} ${Number(date)}(st|nd|rd|th), ${year}`) }).first();
        // Start and end of a one-day range.
        await dayButton.click();
        await dayButton.click();
        await picker.getByRole('button', { name: 'Apply', exact: true }).click();
        await expect(picker).toBeHidden();
        const shown = `${month}/${date}/${year}`;
        await expect(this.dateRangeTrigger).toContainText(`${shown} – ${shown}`);
        await this.applyButton.click();
    }

    /** The Ranch cell's editable control for a given row. */
    ranchEditor(row: Locator): Locator {
        return this.grid.cellEditor(row, TimeInListPage.RANCH_CELL_INDEX);
    }
}

export default TimeInListPage;
