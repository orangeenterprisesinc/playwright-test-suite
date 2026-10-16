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
 */
import { Locator, Page, expect } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

/**
 * A PET Tiger list grid.
 *
 * @extends BaseComponent
 */
export class DataGridComponent extends BaseComponent {
    /**
     * The singular entity name used in the row's edit link — PET Tiger labels it
     * `Edit User: <name>`, `Edit Ranch: <name>`, and so on.
     */
    private readonly entity: string;

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

    /**
     * The edit link of one record: `editLink` matches by substring ("Crew 1" also matches "Crew 10") and two
     * records can share a name, so the id in the href is what makes the row unique.
     */
    editLinkTo(name: string, href: string): Locator {
        return this.editLink(name).and(this.page.locator(`a[href="${href}"], a[href^="${href}?"]`));
    }

    /**
     * Filter by name and open that record's Edit form. The unfiltered row is already visible when the
     * filter is typed, and clicking it races the re-render that replaces it (click swallowed, route never
     * changes — A1/A4/A9/D6/D10, 2026-10-16). Once the filter has applied the link carries it
     * (`/setup/employees/5?name=…`), so that link is the settled row to click.
     */
    async openRecord(name: string, editPath: string): Promise<void> {
        await this.nameFilter.fill(name);
        const settled = this.editLink(name).and(this.page.locator(`a[href^="${editPath}?"]`));
        await settled.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {
            throw new Error(`No filtered Edit ${this.entity} link to ${editPath} after filtering the list by '${name}'`);
        });
        await settled.click();
        await this.page.waitForURL((url) => url.pathname === editPath, { timeout: 15_000 }).catch(() => {
            throw new Error(`Clicking the ${this.entity} row '${name}' did not open ${editPath}`);
        });
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
     * Asserts no row matches `name` after filtering for it — used to confirm a
     * record was removed. Assumes the caller has already loaded the list.
     */
    async expectAbsent(name: string): Promise<void> {
        await this.nameFilter.fill(name);
        await expect(this.rowFor(name)).toHaveCount(0);
    }
}

export default DataGridComponent;
