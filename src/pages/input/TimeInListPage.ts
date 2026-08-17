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
 * reliably in the DOM, below the 100-row virtualization threshold.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../webpet/WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class TimeInListPage extends WebpetListPage {
    /** Start of the date window. */
    readonly filterFrom: Locator;
    /** End of the date window. */
    readonly filterTo: Locator;

    constructor(page: Page) {
        super(page, '/input/time-in', /time in/i);

        this.filterFrom = page.locator('#filter-from');
        this.filterTo = page.locator('#filter-to');
    }

    /**
     * Column index of the Ranch cell.
     *
     * The row's cells are `[selection, reference, dateTime, employeeName,
     * ranchName, …]`, so Ranch is index 4. Named rather than inlined because an
     * off-by-one here silently drives the wrong column's editor.
     */
    static readonly RANCH_CELL_INDEX = 4;

    /** Narrow the grid to a single day, so the first data rows are present. */
    async filterToDay(day: string): Promise<void> {
        await this.filterFrom.fill(day);
        await this.filterTo.fill(day);
    }

    /** The Ranch cell's editable control for a given row. */
    ranchEditor(row: Locator): Locator {
        return this.grid.cellEditor(row, TimeInListPage.RANCH_CELL_INDEX);
    }
}

export default TimeInListPage;
