import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

// The import worker can leave an uploaded file at `received` for minutes on dev.
export const IMPORT_RESULT_TIMEOUT_MS = Number(process.env.IMPORT_RESULT_TIMEOUT_MS ?? 180_000);

/** Connectivity ▸ Import ▸ Single Folder — the office uploads a device export by hand. */
export class ImportSingleFolderPage extends BasePage {
    readonly pageUrl: string = '/connectivity/import/single-folder';
    readonly pageTitle: string | RegExp = /.*/;

    readonly heading: Locator;
    readonly browseButton: Locator;
    readonly importButton: Locator;
    readonly selectedFiles: Locator;
    readonly results: Locator;

    constructor(page: Page) {
        super(page);
        // The sidebar carries an "Import" group button too, so everything is scoped to main.
        const main = page.getByRole('main');
        this.heading = page.getByRole('heading', { level: 1, name: 'Single Folder' });
        this.browseButton = main.getByRole('button', { name: 'Browse Files' });
        this.importButton = main.getByRole('button', { name: /^Import$|^Importing/ });
        this.selectedFiles = main.getByRole('region', { name: 'Selected files' });
        this.results = main.getByRole('region', { name: 'Import Results' });
    }

    async goto(): Promise<void> {
        await this.navigate();
        await this.heading.waitFor({ state: 'visible' });
    }

    selectedFile(name: string): Locator {
        return this.selectedFiles.getByText(name, { exact: true });
    }

    resultRow(name: string): Locator {
        return this.results.getByRole('listitem').filter({ hasText: name });
    }

    async selectFiles(paths: string[]): Promise<void> {
        const chooser = this.page.waitForEvent('filechooser');
        await this.browseButton.click();
        await (await chooser).setFiles(paths);
        for (const path of paths) {
            await expect(this.selectedFile(path.split(/[\\/]/).pop() ?? path)).toBeVisible();
        }
    }

    /** The run id comes from the UI's own POST, registered before the click. */
    async importSelected(): Promise<{ runId: number }> {
        const [response] = await Promise.all([
            this.page.waitForResponse(
                (res) =>
                    res.request().method() === 'POST' &&
                    /\/connectivity\/import\/single-folder\/?$/.test(new URL(res.url()).pathname),
                { timeout: 60_000 },
            ),
            this.importButton.click(),
        ]);
        const body = await response.text();
        if (!response.ok()) {
            throw new Error(`POST single-folder import returned ${String(response.status())}: ${body.slice(0, 300)}`);
        }
        const parsed = JSON.parse(body) as { runId?: number; id?: number };
        const runId = Number(parsed.runId ?? parsed.id ?? 0);
        if (!runId) throw new Error(`single-folder import response carried no run id: ${body.slice(0, 300)}`);
        return { runId };
    }

    /** Resolves with the row's text once it shows a terminal chip. */
    async waitForResult(name: string, timeout: number = IMPORT_RESULT_TIMEOUT_MS): Promise<string> {
        const row = this.resultRow(name);
        await expect(row).toContainText(/Completed|Failed/, { timeout });
        return (await row.innerText()).trim();
    }
}

export default ImportSingleFolderPage;
