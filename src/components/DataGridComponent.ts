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
import { PickerComponent } from './PickerComponent';

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

    constructor(page: Page, gridName: string | RegExp, entity: string) {
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
        return this.editLinkById(name).and(this.page.locator(`a[href="${href}"], a[href^="${href}?"]`));
    }

    /** The Fields list labels its link bare "Edit Field" (2026-10-27); only safe where the href pins the id. */
    private editLinkById(name: string): Locator {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return this.page.getByRole('link', { name: new RegExp(`^Edit ${this.entity}(: .*${escaped}.*)?$`, 'i') });
    }

    /**
     * Filter by name and open that record's Edit form. The unfiltered row is already visible when the
     * filter is typed, and clicking it races the re-render that replaces it (click swallowed, route never
     * changes — A1/A4/A9/D6/D10, 2026-10-16). Once the filter has applied the link carries it
     * (`/setup/employees/5?name=…`), so that link is the settled row to click.
     */
    async openRecord(name: string, editPath: string): Promise<void> {
        await this.nameFilter.fill(name);
        const settled = this.editLinkById(name).and(this.page.locator(`a[href^="${editPath}?"]`));
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

    // The title row and the filter row are separate `role=row`s with equal columnheader counts (Time Cards
    // 22/22, Ranches 7/7, Reports 5/5, measured 2026-10-30), so a column's index in the title row is its index
    // in the filter row. The old count of 12 headers against 3 boxes mixed both rows.
    private get titleRow(): Locator {
        return this.getByRole('row').filter({ has: this.page.getByRole('columnheader', { name: /^Reorder column / }) }).first();
    }

    // Filter-row cells carry data-col (crew, employee, reference…); title-row cells never do.
    private get filterRow(): Locator {
        return this.getByRole('row').filter({ has: this.page.locator('[role="columnheader"][data-col]') }).first();
    }

    get bodyRows(): Locator {
        return this.getByRole('row').filter({ has: this.page.getByRole('cell') });
    }

    get selectAllCheckbox(): Locator {
        return this.getByRole('checkbox', { name: 'Select all rows', exact: true });
    }

    /** "Select <row aria-label>": the Reference on Time Cards, the Name on Setup lists. */
    rowCheckbox(rowLabel: string): Locator {
        return this.getByRole('checkbox', { name: `Select ${rowLabel}`, exact: true });
    }

    /** The title row's column labels, in order (blank for the checkbox and action columns). */
    async headerLabels(): Promise<string[]> {
        const headers = this.titleRow.getByRole('columnheader');
        await headers.first().waitFor({ state: 'visible', timeout: 15_000 });
        return (await headers.allInnerTexts()).map((t) => t.replace(/^Reorder column /, '').split('\n')[0].trim());
    }

    private async columnIndex(label: string): Promise<number> {
        const labels = await this.headerLabels();
        const index = labels.findIndex((l) => l.toLowerCase() === label.toLowerCase());
        if (index < 0) throw new Error(`${this.entity} grid has no '${label}' column; headers are ${JSON.stringify(labels)}`);
        return index;
    }

    async sortState(label: string): Promise<string> {
        const index = await this.columnIndex(label);
        return (await this.titleRow.getByRole('columnheader').nth(index).getAttribute('aria-sort')) ?? 'none';
    }

    /** Clicks the header text until aria-sort reads `dir` (the cycle's order depends on the starting state). */
    async sortBy(label: string, dir: 'ascending' | 'descending'): Promise<void> {
        const index = await this.columnIndex(label);
        const header = this.titleRow.getByRole('columnheader').nth(index);
        const seen: string[] = [];
        for (let click = 0; click <= 4; click += 1) {
            const current = await this.sortState(label);
            seen.push(current);
            if (current === dir) return;
            if (click === 4) break;
            await header.getByText(label, { exact: true }).click();
            await expect.poll(() => this.sortState(label), { timeout: 5_000 }).not.toBe(current);
        }
        throw new Error(`Sorting ${label} never reached ${dir}; states seen: ${seen.join(' → ')}`);
    }

    /**
     * One column's text for every rendered row. Rendered rows only: the grid virtualises past about 100 rows,
     * so narrow it first and compare with `totalRowCount()`.
     */
    async columnValues(label: string): Promise<string[]> {
        const index = await this.columnIndex(label);
        const headerCount = (await this.headerLabels()).length;
        // Cells are right-aligned against the headers, as ViewTimeCardsPage.cellByHeader reads them.
        return this.bodyRows.evaluateAll(
            (rows, [i, headers]) =>
                rows.map((row) => {
                    const cells = Array.from(row.querySelectorAll('[role="cell"]'));
                    return (cells[i + cells.length - headers]?.textContent ?? '').trim();
                }),
            [index, headerCount] as [number, number],
        );
    }

    /** Fills a column's text filter. Picker, date and number filters are not text boxes and fail by name. */
    async columnFilter(label: string, text: string): Promise<void> {
        const index = await this.columnIndex(label);
        const box = this.filterRow.getByRole('columnheader').nth(index).getByPlaceholder('Filter…');
        if ((await box.count()) === 0) {
            throw new Error(`'${label}' has no text filter (its filter is a picker/date/number control)`);
        }
        await box.fill(text);
    }

    /** Picks a value in a column's picker filter (Crew, Department, Ranch on Setup lists): the combobox in that filter cell. */
    async columnPickerFilter(label: string, value: string): Promise<void> {
        const index = await this.columnIndex(label);
        const box = this.filterRow.getByRole('columnheader').nth(index).getByRole('combobox');
        if ((await box.count()) === 0) throw new Error(`'${label}' has no picker filter (its filter is a text/date/number control)`);
        await new PickerComponent(this.page).pickCombobox(box.first(), value);
    }

    /** A Setup row's Active cell ("Active: <name>"). */
    activeCheckbox(name: string): Locator {
        return this.getByRole('checkbox', { name: `Active: ${name}`, exact: true });
    }

    /** Ticks rows by "Select <label>" or by body-row position; never a bare first checkbox (Setup rows also carry "Active: <name>"). */
    async selectRows(rows: Array<string | number>): Promise<void> {
        for (const row of rows) {
            const box =
                typeof row === 'string'
                    ? this.rowCheckbox(row)
                    : this.bodyRows.nth(row).getByRole('checkbox', { name: /^Select / });
            await expect(box, `no selection checkbox for row ${row} (selection/Multi Update mode off?)`).toBeVisible();
            await box.check();
            await expect(box).toBeChecked();
        }
    }

    async selectAll(): Promise<void> {
        await expect(this.selectAllCheckbox, 'no Select all rows checkbox (selection/Multi Update mode off?)').toBeVisible();
        await this.selectAllCheckbox.check();
        await expect(this.selectAllCheckbox).toBeChecked();
    }

    /** Opens the "Show columns" picker unless it is already open. */
    async openColumnsPicker(trigger: Locator = this.page.getByRole('button', { name: 'Columns', exact: true })): Promise<Locator> {
        const picker = this.page.getByRole('dialog', { name: 'Show columns' });
        if (!(await picker.isVisible())) await trigger.click();
        await expect(picker).toBeVisible();
        return picker;
    }

    /**
     * Shows or hides a column. The layout is per user and server-side (`/api/user/grid-layouts/<grid>…`), so any
     * test that hides a column shows it again in teardown. The app debounces that PUT by 500 ms, so the click waits
     * for it: a test that ended inside the window lost its restore and left the column hidden for the suite user.
     */
    async toggleColumn(label: string, visible: boolean, trigger?: Locator): Promise<void> {
        const picker = await this.openColumnsPicker(trigger);
        const box = picker.getByRole('checkbox', { name: label, exact: true });
        if ((await box.isChecked()) !== visible) {
            const saved = this.page.waitForResponse(
                (r) => r.request().method() === 'PUT' && r.url().includes('/api/user/grid-layouts/'),
            );
            await box.click();
            expect((await saved).ok(), 'the column layout save succeeds').toBe(true);
        }
        if (visible) await expect(box).toBeChecked();
        else await expect(box).not.toBeChecked();
        await this.page.keyboard.press('Escape');
        await expect(picker).toBeHidden();
        const labels = await this.headerLabels();
        const present = labels.some((l) => l.toLowerCase() === label.toLowerCase());
        expect(present, `'${label}' ${visible ? 'should be in' : 'should not be in'} the headers ${JSON.stringify(labels)}`).toBe(visible);
    }

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
