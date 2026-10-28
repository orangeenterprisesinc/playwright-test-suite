/**
 * @fileoverview Reports hub — `/settings/reports` (File ▸ Administration ▸ Reports).
 *
 * A virtualized grid (about 27 of ~489 rows are rendered), so views are filtered before rows are read. Filters and
 * sort live in the URL; favorites and Last Run live in the browser's localStorage. Locators measured 2026-10-28.
 */
import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';
import { DataGridComponent } from '../../components/DataGridComponent';
import { PickerComponent } from '../../components/PickerComponent';
import { ReportRunDialog } from './ReportRunDialog';

export interface HubRowCells {
    name: string;
    module: string;
    lastRun: string;
}

export class ReportsHubPage extends BasePage {
    readonly pageUrl: string = '/settings/reports';
    readonly pageTitle: string | RegExp = /.*/;

    readonly heading: Locator;
    readonly loadError: Locator;
    readonly runDialog: ReportRunDialog;
    private readonly gridLocator: Locator;
    private readonly count: Locator;
    private readonly grid: DataGridComponent;
    private readonly picker: PickerComponent;
    private readonly leftNav: LeftNavigationPage;
    private readonly nameFilter: Locator;
    private readonly moduleFilter: Locator;
    private readonly bodyRows: Locator;

    constructor(page: Page) {
        super(page);
        this.heading = page.getByRole('heading', { level: 1, name: 'Reports' });
        this.loadError = page.getByText('Failed to load reports. Please try again.');
        this.gridLocator = page.getByRole('grid', { name: 'Reports' });
        this.count = page.getByTestId('data-grid-count');
        this.nameFilter = this.gridLocator.locator('[role="columnheader"][data-col="name"]').getByRole('textbox');
        this.moduleFilter = this.gridLocator.locator('[role="columnheader"][data-col="module"]').getByRole('combobox');
        this.bodyRows = this.gridLocator.getByRole('row').filter({ has: page.getByRole('cell') });
        this.grid = new DataGridComponent(page, 'Reports', 'Report');
        this.picker = new PickerComponent(page);
        this.leftNav = new LeftNavigationPage(page);
        this.runDialog = new ReportRunDialog(page);
    }

    /** A second call is the user's F5: the query string (filters, sort) survives. */
    async openFromMenu(): Promise<void> {
        await this.leftNav.openScreen(['File', 'Administration', 'Reports'], this.pageUrl);
        await this.gridLocator.waitFor({ state: 'visible', timeout: 30_000 });
        await this.count.waitFor({ state: 'visible', timeout: 30_000 });
        await this.settle();
    }

    async totalRows(): Promise<number> {
        return this.grid.totalRowCount();
    }

    /** Reads the footer until two consecutive reads agree (a filter re-queries asynchronously). */
    private async settle(): Promise<number> {
        let previous = -1;
        let agreeing = 0;
        await expect
            .poll(
                async () => {
                    const n = await this.totalRows().catch(() => -1);
                    agreeing = n >= 0 && n === previous ? agreeing + 1 : 0;
                    previous = n;
                    return agreeing;
                },
                { timeout: 20_000, intervals: [300], message: 'the Reports footer count never settled' },
            )
            .toBeGreaterThanOrEqual(2);
        return previous;
    }

    private async waitQueryParam(key: string, matches: (value: string | null) => boolean, what: string): Promise<void> {
        await this.page
            .waitForURL((url) => matches(new URL(url).searchParams.get(key)), { timeout: 15_000 })
            .catch(() => {
                throw new Error(`The Reports URL never reflected ${what} (app at ${this.page.url()})`);
            });
    }

    async filterByName(text: string): Promise<void> {
        await this.nameFilter.fill(text);
        await this.waitQueryParam('name', (v) => v === text, `the name filter '${text}'`);
        await this.settle();
    }

    async clearNameFilter(): Promise<void> {
        await this.nameFilter.fill('');
        await this.waitQueryParam('name', (v) => !v, 'the cleared name filter');
        await this.settle();
    }

    async filterByModule(module: string): Promise<void> {
        await this.picker.pickCombobox(this.moduleFilter, module);
        await this.waitQueryParam('module', (v) => !!v, `the module filter '${module}'`);
        await this.settle();
    }

    async clearModuleFilter(): Promise<void> {
        // Clear only exists while a module is chosen.
        if (!new URL(this.page.url()).searchParams.get('module')) return;
        await this.gridLocator.locator('[role="columnheader"][data-col="module"]').getByRole('button', { name: 'Clear' }).click();
        await this.waitQueryParam('module', (v) => !v, 'the cleared module filter');
        await this.settle();
    }

    async renderedRowNames(): Promise<string[]> {
        if ((await this.totalRows()) > 0) await expect(this.bodyRows.first()).toBeVisible({ timeout: 15_000 });
        return this.bodyRows.evaluateAll((rows) => rows.map((row) => (row.getAttribute('aria-label') ?? '').trim()));
    }

    async rowsForCells(): Promise<HubRowCells[]> {
        if ((await this.totalRows()) > 0) await expect(this.bodyRows.first()).toBeVisible({ timeout: 15_000 });
        return this.bodyRows.evaluateAll((rows) =>
            rows.map((row) => {
                const cells = Array.from(row.querySelectorAll('[role="cell"]')).map((c) => (c.textContent ?? '').trim());
                return { name: (row.getAttribute('aria-label') ?? '').trim(), module: cells[1] ?? '', lastRun: cells[3] ?? '' };
            }),
        );
    }

    /** Fails with "grid is virtualizing" when the footer total exceeds the rows in the DOM. */
    async expectFullyRendered(): Promise<number> {
        const total = await this.totalRows();
        await expect
            .poll(() => this.bodyRows.count(), {
                timeout: 15_000,
                message: `grid is virtualizing rows (footer says ${total}) — narrow the filter`,
            })
            .toBe(total);
        return total;
    }

    /** Names repeat across modules, so address rows under a For filter. */
    row(name: string): Locator {
        return this.gridLocator.getByRole('row', { name, exact: true });
    }

    starButton(name: string): Locator {
        return this.row(name).getByRole('button', { name: /^(Add .+ to favorites|Remove .+ from favorites)$/ });
    }

    runButton(name: string): Locator {
        return this.row(name).getByRole('button', { name: `Run ${name}`, exact: true });
    }

    configureButton(name: string): Locator {
        return this.row(name).getByRole('button', { name: `Configure ${name}`, exact: true });
    }

    notAvailableBadge(name: string): Locator {
        return this.row(name).locator('[data-slot="badge"]', { hasText: 'Not available' });
    }

    async lastRun(name: string): Promise<string> {
        return (await this.row(name).getByRole('cell').nth(3).innerText()).trim();
    }

    async isFavorite(name: string): Promise<boolean> {
        return (await this.starButton(name).getAttribute('aria-pressed')) === 'true';
    }

    async setFavorite(name: string, on: boolean): Promise<void> {
        await expect(this.starButton(name), `no star on '${name}' (is the For filter set?)`).toBeVisible({ timeout: 15_000 });
        if ((await this.isFavorite(name)) !== on) await this.starButton(name).click();
        await expect(this.starButton(name)).toHaveAttribute('aria-pressed', String(on));
    }

    private sortHeader(column: 'Report' | 'Last Run'): Locator {
        return this.gridLocator.getByRole('columnheader', { name: column === 'Report' ? /Report$/ : /Last Run$/ });
    }

    async sortState(column: 'Report' | 'Last Run'): Promise<string> {
        return (await this.sortHeader(column).getAttribute('aria-sort')) ?? 'none';
    }

    /** Clicks the header text until aria-sort reads `dir` (the cycle's order depends on the starting state). */
    async sortBy(column: 'Report' | 'Last Run', dir: 'ascending' | 'descending'): Promise<void> {
        const seen: string[] = [];
        for (let click = 0; click <= 4; click += 1) {
            const current = await this.sortState(column);
            seen.push(current);
            if (current === dir) return;
            if (click === 4) break;
            await this.sortHeader(column).getByText(column, { exact: true }).click();
            await expect.poll(() => this.sortState(column), { timeout: 5_000 }).not.toBe(current);
        }
        throw new Error(`Sorting ${column} never reached ${dir}; states seen: ${seen.join(' → ')}`);
    }

    async moduleOptions(): Promise<string[]> {
        await this.moduleFilter.click();
        const listbox = this.page.getByRole('listbox');
        await listbox.waitFor({ state: 'visible', timeout: 15_000 });
        const options = (await listbox.getByRole('option').allInnerTexts()).map((t) => t.trim());
        await this.page.keyboard.press('Escape');
        await expect(listbox).toBeHidden({ timeout: 15_000 });
        return options;
    }

    async openRun(name: string): Promise<ReportRunDialog> {
        const run = this.runButton(name);
        await expect(run, `'${name}' has no Run button (is the For filter set, or is the report Not available?)`).toBeVisible({ timeout: 15_000 });
        await run.click();
        await this.runDialog.waitOpen();
        return this.runDialog;
    }
}

export default ReportsHubPage;
