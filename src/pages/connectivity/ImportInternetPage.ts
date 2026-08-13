import { expect, Locator, Page, Response } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Connectivity ▸ Import ▸ Internet — the office's relay pull, and the closest
 * screen to how Amy's office actually ingests device data (automatically from
 * the relay; she never uploads a file). One button drains the mailbox; the
 * import itself then runs async and the page polls the run.
 *
 * Locators come from web-pet's InternetPage.tsx + the en locale — the screen
 * ships no data-testids, so everything is role/aria anchored.
 *
 * The screen shows exactly three outcomes and NEVER renders the server's
 * `message` field (which carries the real reason a pull is blocked). That is
 * why {@link triggerImport} also captures the POST response: assertions can
 * quote the actual gate, not just "The relay could not be reached."
 */

export const INTERNET_OUTCOME = {
    warning: 'The relay could not be reached.',
    noData: 'No new files were waiting on the relay.',
    /** Rendered literally, e.g. `Pulled and queued 3 file(s) from the relay.` */
    success: /^Pulled and queued \d+ file\(s\) from the relay\.$/,
} as const;

export interface InternetImportOutcome {
    /** What the user sees — one of the three INTERNET_OUTCOME texts. */
    headingText: string;
    /** What the server actually said — the UI drops `message` and `status`. */
    api: {
        runId: number;
        filesPulled: number;
        status: 'ok' | 'no-data' | 'warning' | string;
        message: string;
    };
}

export class ImportInternetPage extends BasePage {
    readonly pageUrl: string = '/connectivity/import/internet';
    readonly pageTitle: string | RegExp = /Internet/i;

    readonly heading: Locator;
    readonly triggerButton: Locator;
    /** Only rendered once a pull response has arrived. */
    readonly resultsSection: Locator;
    readonly summaryHeading: Locator;
    /** One `<li>` per pulled file, badge carries the import status. */
    readonly fileRows: Locator;

    constructor(page: Page) {
        super(page);
        this.heading = page.getByRole('heading', { level: 1, name: 'Internet' });
        this.triggerButton = page.getByRole('button', { name: /^Trigger Import$|^Triggering\.\.\.$/ });
        this.resultsSection = page.locator('section[aria-labelledby="internet-results-heading"]');
        this.summaryHeading = page.locator('#internet-results-heading');
        this.fileRows = this.resultsSection.locator('li');
    }

    /**
     * Click Trigger Import and wait for both the response and the on-screen
     * summary. The POST can legitimately take a while once the gates open — the
     * server drains the whole mailbox inside the request (up to 2 minutes).
     */
    async triggerImport(): Promise<InternetImportOutcome> {
        const responsePromise = this.page.waitForResponse(
            (r: Response) => r.url().includes('/connectivity/import/internet') && r.request().method() === 'POST',
            { timeout: 150_000 },
        );
        await this.triggerButton.click();
        const response = await responsePromise;
        const api = (await response.json().catch(() => ({}))) as InternetImportOutcome['api'];

        await this.summaryHeading.waitFor({ state: 'visible', timeout: 15_000 });
        const headingText = (await this.summaryHeading.textContent())?.trim() ?? '';

        return {
            headingText,
            api: {
                runId: Number(api.runId ?? 0),
                filesPulled: Number(api.filesPulled ?? 0),
                status: String(api.status ?? ''),
                message: String(api.message ?? ''),
            },
        };
    }

    /**
     * Wait until every pulled file's badge reaches a terminal import state.
     * The page polls the run every 3s; `Received`/`Processing...` are transient.
     */
    async waitForTerminalFiles(count: number, timeout = 90_000): Promise<void> {
        await expect(this.fileRows).toHaveCount(count, { timeout });
        const terminal = this.fileRows.locator('[data-slot="badge"]', {
            hasText: /^(Completed|Failed|Completed with errors)$/,
        });
        await expect(terminal).toHaveCount(count, { timeout });
    }

    async screenshot(): Promise<Buffer> {
        return this.page.screenshot();
    }
}
