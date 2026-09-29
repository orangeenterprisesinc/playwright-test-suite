import { expect, Locator, Page, Response } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Connectivity ▸ Import ▸ Internet — the office's relay pull, and the closest
 * screen to how Amy's office actually ingests device data (automatically from
 * the relay; she never uploads a file). One button drains the mailbox; the
 * import itself then runs async and the page polls the run.
 *
 * Since WEBPET-2996 (deployed to dev 2026-09-29) Trigger Import answers 202
 * `running` and the relay drain continues in the background: the page polls
 * GET /connectivity/import/runs/{runId} every 3 s and the run's `drain` block
 * carries the outcome the synchronous POST used to return. {@link triggerImport}
 * follows the page's own poll to that settled outcome, so callers keep seeing
 * `ok` / `no-data` / `warning` with the real filesPulled.
 *
 * Locators come from web-pet's InternetPage.tsx + the en locale — the screen
 * ships no data-testids, so everything is role/aria anchored.
 *
 * The screen NEVER renders the server's `message` field (which carries the real
 * reason a pull is blocked). That is why {@link triggerImport} also captures the
 * responses: assertions can quote the actual gate, not just "The relay could
 * not be reached."
 */

export const INTERNET_OUTCOME = {
    warning: 'The relay could not be reached.',
    noData: 'No new files were waiting on the relay.',
    /** Rendered literally, e.g. `Pulled and queued 3 file(s) from the relay.` */
    success: /^Pulled and queued \d+ file\(s\) from the relay\.$/,
    /** The 202 state — a background drain that has not settled yet. */
    running: 'Pulling files from the relay in the background.',
    /** A peer's drain holds this client's lease (`reason: already-running`). */
    alreadyRunning: 'An import is already running; its files will appear in the Internet Import Log when it finishes.',
    couldNotStart: 'The import could not be started. No files were pulled; try again later.',
    drainWarning: 'The import stopped before the relay was empty; the remaining files stay on the relay for a later import.',
    pollFailed: "Couldn't check the import's progress. Its files will still appear in the Internet Import Log.",
} as const;

export interface InternetImportOutcome {
    /** What the user sees — one of the INTERNET_OUTCOME texts. */
    headingText: string;
    /** What the server actually said — the UI drops `message`, `status` and `reason`. */
    api: {
        runId: number;
        filesPulled: number;
        /** Settled: `running` escapes only when the drain out-waited INTERNET_DRAIN_SETTLE_MS. */
        status: 'ok' | 'no-data' | 'warning' | 'running' | string;
        message: string;
        /** `already-running` — a peer's drain holds the lease; `could-not-start` — ours could not begin. */
        reason: string;
    };
}

/** A `running` drain must leave that state within this budget — the old synchronous POST had the same 150 s. */
const DRAIN_SETTLE_MS = Number(process.env.INTERNET_DRAIN_SETTLE_MS ?? 150_000);

interface DrainBlock {
    status?: string;
    filesPulled?: number;
    message?: string;
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
     * Click Trigger Import and wait for the settled outcome: the POST's own answer
     * for `no-data` / `warning`, or — on a 202 `running` — the page's run poll
     * reaching a `drain` block that has left `running`.
     */
    async triggerImport(): Promise<InternetImportOutcome> {
        const responsePromise = this.page.waitForResponse(
            (r: Response) => r.url().includes('/connectivity/import/internet') && r.request().method() === 'POST',
            { timeout: 150_000 },
        );
        await this.triggerButton.click();
        const response = await responsePromise;
        const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        let api: InternetImportOutcome['api'] = {
            runId: Number(raw.runId ?? 0),
            filesPulled: Number(raw.filesPulled ?? 0),
            status: String(raw.status ?? ''),
            message: String(raw.message ?? ''),
            reason: String(raw.reason ?? ''),
        };

        await this.summaryHeading.waitFor({ state: 'visible', timeout: 15_000 });

        if (api.status === 'running' && api.runId > 0) {
            const drain = await this.settledDrain(api.runId);
            if (drain) {
                api = {
                    ...api,
                    status: String(drain.status ?? 'warning'),
                    filesPulled: Number(drain.filesPulled ?? 0),
                    message: String(drain.message ?? ''),
                };
            }
        }

        const headingText = (await this.summaryHeading.textContent())?.trim() ?? '';
        return { headingText, api };
    }

    /**
     * Follow the page's own run poll until the `drain` block leaves `running`.
     * Null when it never did within the budget — the caller's status then stays
     * `running` and its own expect names it, with the heading (poll failed, or
     * still running) on the screenshot.
     */
    private async settledDrain(runId: number): Promise<DrainBlock | null> {
        const settled: { drain: DrainBlock | null } = { drain: null };
        try {
            await this.page.waitForResponse(async (r: Response) => {
                if (r.request().method() !== 'GET') return false;
                if (!new URL(r.url()).pathname.endsWith(`/connectivity/import/runs/${runId}`)) return false;
                const body = (await r.json().catch(() => null)) as { drain?: DrainBlock } | null;
                if (!body?.drain || body.drain.status === 'running') return false;
                settled.drain = body.drain;
                return true;
            }, { timeout: DRAIN_SETTLE_MS });
            // The heading re-renders from that same response; wait for it so the
            // screenshot agrees with `api`. Best effort — the poll body is the verdict.
            await expect(this.summaryHeading)
                .not.toHaveText(INTERNET_OUTCOME.running, { timeout: 10_000 })
                .catch(() => undefined);
        } catch {
            /* out-waited — reported through the unchanged `running` status */
        }
        return settled.drain;
    }

    /**
     * Wait until the results list shows one row per pulled file. Terminal state is
     * NOT awaited here: a drain can include other runs' envelopes whose badges may
     * lag or never settle, so callers wait on their own file through the run API
     * (`waitForImportFiles`) instead of on every badge.
     */
    async waitForFileRows(count: number, timeout = 30_000): Promise<void> {
        await expect(this.fileRows).toHaveCount(count, { timeout });
    }

    async screenshot(): Promise<Buffer> {
        return this.page.screenshot();
    }
}
