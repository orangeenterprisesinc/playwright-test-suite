import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

const COLUMNS = {
    file: 'File',
    source: 'Source',
    status: 'Status',
    recordsImported: 'Records imported',
    recordsFailed: 'Records failed',
    run: 'Run',
} as const;

export type ImportLogRow = Record<keyof typeof COLUMNS, string>;

const CELL = '[role="gridcell"], [role="cell"], td';

/** Connectivity ▸ Import ▸ Import Log — one row per import run; Source defaults to "Webmail". */
export class ImportLogPage extends BasePage {
    readonly pageUrl: string = '/connectivity/import/log';
    readonly pageTitle: string | RegExp = /.*/;

    readonly heading: Locator;
    readonly grid: Locator;
    readonly sourceSelect: Locator;
    private readonly headerCells: Locator;

    constructor(page: Page) {
        super(page);
        this.heading = page.getByRole('heading', { level: 1, name: 'Internet Import Log' });
        this.grid = page.getByRole('grid', { name: 'Internet Import Log' });
        this.sourceSelect = page.getByRole('combobox', { name: 'Source' });
        this.headerCells = this.grid.getByRole('row').first().getByRole('columnheader');
    }

    async goto(): Promise<void> {
        await this.navigate();
        await this.heading.waitFor({ state: 'visible' });
    }

    row(name: string): Locator {
        return this.grid.getByRole('row').filter({ hasText: name });
    }

    async filterBySource(label: string): Promise<void> {
        await this.sourceSelect.click();
        await this.page.getByRole('option', { name: label, exact: true }).click();
        await expect(this.sourceSelect).toContainText(label);
    }

    async filterByFile(name: string): Promise<void> {
        const index = await this.columnIndex(COLUMNS.file);
        await this.grid.getByRole('row').nth(1).getByRole('columnheader').nth(index).getByRole('textbox').fill(name);
    }

    async readRow(name: string): Promise<ImportLogRow> {
        const row = this.row(name).first();
        await expect(row).toBeVisible({ timeout: 30_000 });
        const headers = await this.headerTexts();
        const cells = (await row.locator(CELL).allInnerTexts()).map((c) => c.trim());
        // A leading selection cell would shift every column, so align from the right.
        const offset = cells.length - headers.length;
        const at = (header: string): string => cells[this.indexOf(headers, header) + offset] ?? '';
        return Object.fromEntries(Object.entries(COLUMNS).map(([key, header]) => [key, at(header)])) as ImportLogRow;
    }

    private async headerTexts(): Promise<string[]> {
        return (await this.headerCells.allInnerTexts()).map((h) => h.trim());
    }

    private indexOf(headers: string[], header: string): number {
        const index = headers.indexOf(header);
        if (index < 0) throw new Error(`Internet Import Log has no '${header}' column (headers: ${headers.join(' | ')})`);
        return index;
    }

    private async columnIndex(header: string): Promise<number> {
        return this.indexOf(await this.headerTexts(), header);
    }
}

export default ImportLogPage;
