/**
 * File ▸ Restore or Reverse ▸ Reverse Multi Delete (`/restore-or-reverse/bulk-delete-history`).
 *
 * Every row here belongs to the tenant, not the run. `undoBatch` clicks Undo only on the
 * caller's own batch and a `page.route` guard aborts any undo request for a different id.
 */
import { expect, Locator, Page, Route } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';

export interface BatchRef {
    id: number;
    /** The Performed cell text, formatted from `createdOn`. */
    performedText: string;
    recordCount: number;
}

/** Cell index per column (measured 2026-10-14). */
const COLUMN = { performed: 0, performedBy: 1, recordType: 2, field: 3, newValue: 4, records: 5, status: 6, undo: 7 } as const;
export type HistoryColumn = keyof typeof COLUMN;

export class BulkDeleteHistoryPage extends BasePage {
    readonly pageUrl = '/restore-or-reverse/bulk-delete-history';
    readonly pageTitle: string | RegExp = /.*/;

    readonly heading: Locator;
    /** A plain table, not a grid. */
    readonly table: Locator;
    readonly undoDialog: Locator;
    readonly confirmUndo: Locator;
    private readonly leftNav: LeftNavigationPage;

    constructor(page: Page) {
        super(page);
        this.heading = page.getByRole('heading', { name: 'Reverse Multi Delete — Bulk Delete History', level: 1 });
        this.table = page.getByRole('main').getByRole('table');
        this.undoDialog = page.getByRole('alertdialog', { name: 'Undo this bulk update?' });
        this.confirmUndo = this.undoDialog.getByRole('button', { name: 'Undo update', exact: true });
        this.leftNav = new LeftNavigationPage(page);
    }

    async goto(): Promise<void> {
        await this.leftNav.openViaMenu(['File', 'Restore or Reverse', 'Reverse Multi Delete'], this.pageUrl);
        await this.heading.waitFor({ state: 'visible' });
    }

    batchRow(batch: BatchRef, recordType: string): Locator {
        return this.table
            .getByRole('row')
            .filter({ has: this.page.getByRole('cell', { name: batch.performedText, exact: true }) })
            .filter({ has: this.page.getByRole('cell', { name: recordType, exact: true }) })
            .filter({ has: this.page.getByRole('cell', { name: String(batch.recordCount), exact: true }) });
    }

    cell(row: Locator, column: HistoryColumn): Locator {
        return row.getByRole('cell').nth(COLUMN[column]);
    }

    undoButton(row: Locator): Locator {
        return row.getByRole('button', { name: 'Undo', exact: true });
    }

    /** Returns the confirmation dialog's text, read before the confirm click. */
    async undoBatch(batch: BatchRef, recordType: string): Promise<string> {
        const row = this.batchRow(batch, recordType);
        await expect(row, 'exactly one history row matches the own batch').toHaveCount(1);

        const guard = { blocked: null as string | null };
        const pattern = '**/bulk-update-history/*/undo';
        const onUndo = async (route: Route): Promise<void> => {
            const url = route.request().url();
            const sent = /bulk-update-history\/(\d+)\/undo/.exec(url);
            if (sent && Number(sent[1]) === batch.id) {
                await route.continue();
                return;
            }
            guard.blocked = url;
            await route.abort();
        };
        await this.page.route(pattern, onUndo);
        let dialogText = '';
        try {
            await this.undoButton(row).click();
            await expect(this.undoDialog).toBeVisible();
            dialogText = (await this.undoDialog.textContent()) ?? '';
            const done = this.page.waitForResponse(
                (res) => res.request().method() === 'POST' && new RegExp(`/bulk-update-history/${String(batch.id)}/undo(\\?|$)`).test(res.url()),
                { timeout: 30_000 },
            );
            done.catch(() => undefined);
            await this.confirmUndo.click();
            await done;
        } finally {
            await this.page.unroute(pattern, onUndo);
        }
        if (guard.blocked) throw new Error(`Refused to undo a batch that is not ours (${String(batch.id)}): ${guard.blocked}`);
        return dialogText;
    }
}

export default BulkDeleteHistoryPage;
