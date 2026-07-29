/**
 * @fileoverview The PET Tiger data grid, as one reusable component.
 *
 * Nearly every list screen in PET Tiger is the same grid: a per-column "Filter"
 * box in the header, one row per record with an "Edit <Entity>: <name>" link, and
 * a "Total N rows" footer. That is true of File ▸ Administration ▸ Users and of
 * every Input ▸ Setup screen the catalog's journey A walks through — Ranch, Field,
 * Crop, Variety, Job, Job Group, Crew, Employee, Equipment — as well as the
 * job-card lists in journey D.
 *
 * Without this component each of those page objects re-implements filtering, row
 * lookup, row counting and absence-checking; `UsersPage` already had all four.
 * Page objects now hold one of these instead.
 *
 * @module components/DataGridComponent
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * class RanchPage extends SetupScreenPage {
 *   readonly grid = new DataGridComponent(this.page, 'Ranches', 'Ranch');
 *
 *   async findRanch(name: string) {
 *     await this.grid.filterByName(name);
 *     return this.grid.rowFor(name);
 *   }
 * }
 * ```
 */
import { Locator, Page, expect } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

/**
 * A PET Tiger list grid.
 *
 * @class DataGridComponent
 * @extends BaseComponent
 */
export class DataGridComponent extends BaseComponent {
    /**
     * The singular entity name used in the row's edit link — PET Tiger labels it
     * `Edit User: <name>`, `Edit Ranch: <name>`, and so on.
     */
    private readonly entity: string;

    /**
     * @param page Playwright page
     * @param gridName Accessible name of the grid (e.g. `'Users'`)
     * @param entity Singular entity name used by the row edit link (e.g. `'User'`)
     */
    constructor(page: Page, gridName: string, entity: string) {
        super(page, page.getByRole('grid', { name: gridName }));
        this.entity = entity;
    }

    /** The grid's "Total N rows" footer status. Rendered outside the grid element. */
    get totalRowsStatus(): Locator {
        return this.page.getByText(/Total \d+ rows/);
    }

    /** Every column filter box in the grid header, in column order. */
    get filters(): Locator {
        return this.getByPlaceholder('Filter');
    }

    /** The Name column's filter box — the first filter in the header. */
    get nameFilter(): Locator {
        return this.filters.first();
    }

    /** The "Edit <Entity>: <name>" link in a record's row. */
    editLink(name: string): Locator {
        return this.page.getByRole('link', { name: `Edit ${this.entity}: ${name}` });
    }

    /** A record's grid row, located via its edit link. */
    rowFor(name: string): Locator {
        return this.page.getByRole('row').filter({ has: this.editLink(name) });
    }

    /** A column header cell, by its visible label. */
    columnHeader(label: string): Locator {
        return this.getByRole('columnheader', { name: label });
    }

    /**
     * Types into the Name column filter and waits for the matching row.
     *
     * Filtering rather than scanning the whole list keeps an assertion independent
     * of how many other records exist, so it holds whatever state the database is
     * in — which matters on a shared dev database.
     */
    async filterByName(name: string): Promise<void> {
        await this.nameFilter.fill(name);
        await this.rowFor(name).waitFor({ state: 'visible' });
    }

    // NOTE — filtering by an arbitrary column is deliberately not implemented.
    //
    // The obvious version (find the column's header index, fill `filters.nth(index)`)
    // is wrong on this grid. Measured against the live Users screen: the grid renders
    // 12 `columnheader` cells but only 3 filter boxes, and the filter boxes live
    // inside *blank* header cells (indices 6, 7 and 9) rather than inside the
    // labelled ones (Name=0, Initials=1, Role=2, Email=3, Active=4). Header index and
    // filter index therefore do not correspond, and not every column is filterable.
    //
    // `filterByName` works because the Name filter happens to be the first filter box.
    // When a screen genuinely needs to filter a different column, inspect that grid's
    // filter row and implement it from the real structure — do not reintroduce an
    // index-based mapping here, because every screen inherits it.

    /**
     * The row count from the grid's "Total N rows" footer — what the grid is
     * currently showing, so with a filter applied this is the number of matches.
     */
    async totalRowCount(): Promise<number> {
        const status = await this.totalRowsStatus.innerText();
        const match = /Total (\d+) rows/.exec(status);
        if (!match) throw new Error(`Could not read the grid row total from "${status}"`);
        return Number(match[1]);
    }

    /**
     * Asserts the filtered grid shows exactly this one record — one matching row,
     * and the footer total agrees. Call after {@link filterByName}.
     */
    async expectOnlyMatch(name: string): Promise<void> {
        await expect(this.rowFor(name)).toHaveCount(1);
        await expect.poll(() => this.totalRowCount()).toBe(1);
    }

    /**
     * Asserts no row matches `name` after filtering for it — used to confirm a
     * record was removed. Assumes the caller has already loaded the list.
     */
    async expectAbsent(name: string): Promise<void> {
        await this.nameFilter.fill(name);
        await expect(this.rowFor(name)).toHaveCount(0);
    }

    /**
     * Drags one column header onto another to reorder the columns. Journey D's
     * exception review (D2) calls for this — "reorder columns to surface patterns".
     *
     * **Unverified against the live app.** The header locators are confirmed, but
     * whether this grid accepts an HTML5 drag from `dragTo` has not been exercised
     * yet. Confirm it when D2 is automated.
     */
    async moveColumn(from: string, to: string): Promise<void> {
        await this.columnHeader(from).dragTo(this.columnHeader(to));
    }

    /**
     * The grid's real column labels, in display order.
     *
     * Waits for the header row before reading: the grid renders it after the route
     * settles, and `allInnerTexts()` does not auto-retry the way `expect` does, so
     * reading straight after navigation returns an empty list. Blank cells are
     * dropped — this grid also renders its filter row as `columnheader` cells, and
     * those carry no label.
     */
    async columnLabels(): Promise<string[]> {
        const headers = this.getByRole('columnheader');
        await headers.first().waitFor({ state: 'attached' });
        const texts = await headers.allInnerTexts();
        return texts.map((text) => text.trim()).filter(Boolean);
    }
}

export default DataGridComponent;
