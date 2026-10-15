import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

const REVERSE_REQUEST = /\/transfer-to-job-cards\/runs\/(\d+)\/reverse$/;

/**
 * View ▸ Job Cards (`/view/job-cards`) — where a transfer lands when `viewJobCardsAfterTransfer` is
 * true, with `transferRun=N` in the URL. A different screen from `/input/job-cards` (JobCardsPage):
 * its testids are `view-job-cards-*`. Locators measured live 2026-10-15.
 *
 * Exposes Reverse only. No delete, Delete ▾ menu, recalculate, multi-edit or export member exists on
 * purpose — Delete ▾ carries `view-job-cards-delete-all`, and a "delete all loaded" once wiped ~9.5k
 * dev job cards.
 */
export class ViewJobCardsPage extends BasePage {
    readonly pageUrl = '/view/job-cards';
    readonly pageTitle: string | RegExp = /Job Cards/i;

    readonly heading: Locator;
    readonly grid: Locator;
    readonly reverseButton: Locator;
    readonly reverseDialog: Locator;
    readonly confirmReverseButton: Locator;
    readonly cancelReverseButton: Locator;
    /** The second "Confirm Reverse" dialog of the edited-cards path. Only ever waited for, never clicked. */
    readonly editedConfirmDialog: Locator;

    constructor(page: Page) {
        super(page);
        this.heading = page.getByRole('heading', { name: 'Job Cards', level: 1 });
        this.grid = page.getByRole('grid', { name: 'Job Cards' });
        this.reverseButton = page.getByTestId('view-job-cards-reverse-transfer');
        this.reverseDialog = page.getByTestId('view-job-cards-reverse-transfer-confirm');
        this.confirmReverseButton = page.getByTestId('view-job-cards-reverse-transfer-confirm-action');
        this.cancelReverseButton = this.reverseDialog.getByRole('button', { name: 'Cancel' });
        this.editedConfirmDialog = page.getByTestId('reverse-transfer-edited-confirm');
    }

    /** The `transferRun` the app navigated with; NaN when the URL carries none. */
    transferRunParam(): number {
        return Number(new URL(this.page.url()).searchParams.get('transferRun'));
    }

    async waitForTransferLanding(): Promise<void> {
        await this.page.waitForURL(/\/view\/job-cards\?.*transferRun=\d+/, { timeout: 60_000 });
        await this.heading.waitFor({ state: 'visible', timeout: 30_000 });
    }

    async openReverse(): Promise<void> {
        await this.reverseButton.click({ timeout: 15_000 });
        await this.reverseDialog.waitFor({ state: 'visible', timeout: 15_000 });
    }

    /**
     * Confirm the reverse and return the run id the browser's own POST carried. Throws, without
     * clicking anything, if the edited-cards dialog appears instead of the app returning to Transfer.
     */
    async confirmReverse(): Promise<number> {
        const posted = this.page.waitForRequest(
            (r) => r.method() === 'POST' && REVERSE_REQUEST.test(new URL(r.url()).pathname),
            { timeout: 30_000 },
        );
        await this.confirmReverseButton.click();
        const request = await posted;
        const runId = Number(REVERSE_REQUEST.exec(new URL(request.url()).pathname)?.[1]);

        const outcome = await Promise.race([
            this.page.waitForURL(/\/transfer-to-job-cards/, { timeout: 60_000 }).then(() => 'landed' as const, () => 'timeout' as const),
            this.editedConfirmDialog.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'edited' as const, () => 'timeout' as const),
        ]);
        if (outcome === 'edited') {
            throw new Error('The reverse asked for a second "Confirm Reverse": a job card of this run was edited. Refusing to confirm it.');
        }
        if (outcome === 'timeout') throw new Error(`POST …/runs/${runId}/reverse was sent but the app never returned to Transfer to Job Cards.`);
        return runId;
    }

    /** Data rows whose Work Crew cell is exactly `name`. */
    rowsForCrew(name: string): Locator {
        return this.grid.getByRole('row').filter({ has: this.page.getByRole('cell', { name, exact: true }) });
    }

    /** One row's cell by column header. The layout is user-reorderable, so the index is read, never hard-coded. */
    async cellByHeader(row: Locator, header: string): Promise<Locator> {
        await expect(this.grid.getByRole('columnheader').first()).toBeVisible({ timeout: 15_000 });
        const headers = (await this.grid.getByRole('columnheader').allInnerTexts()).map((h) => h.trim());
        const index = headers.findIndex((h) => h === header || h.startsWith(`${header}\n`));
        if (index < 0) throw new Error(`Job Cards grid has no '${header}' column; headers are ${JSON.stringify(headers)}`);
        return row.getByRole('cell').nth(index);
    }
}
