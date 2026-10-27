/**
 * File ▸ Administration ▸ Restore or Reverse ▸ Reverse Export to Accounting (Payroll) (`/export-to-accounting/reverse`).
 * Every row belongs to the tenant, not the run: reverseRun clicks Reverse only on the caller's row and a page.route
 * guard aborts a reverse POST for any other run id (BulkDeleteHistoryPage.undoBatch pattern). Locators unmeasured
 * beyond the 2026-10-26 probe (CALIBRATE: toast, prompt container).
 */
import { expect, Locator, Page, Route } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';

export interface ReverseRunRow {
    /** `dd/mm/yyyy, HH:mm:ss` as shown. */
    runDate: string;
    at: Date;
    type: string;
    performedBy: string;
    jobCards: number;
}

const MENU = ['File', 'Administration', 'Restore or Reverse', 'Reverse Export to Accounting (Payroll)'];
const MENU_WITHOUT_ADMINISTRATION = ['File', 'Restore or Reverse', 'Reverse Export to Accounting (Payroll)'];

export class ReverseExportPage extends BasePage {
    readonly pageUrl = '/export-to-accounting/reverse';
    readonly pageTitle: string | RegExp = /.*/;

    readonly intro: Locator;
    readonly table: Locator;
    readonly toast: Locator;
    private readonly leftNav: LeftNavigationPage;

    constructor(page: Page) {
        super(page);
        this.leftNav = new LeftNavigationPage(page);
        this.intro = page.getByText(/^Reverse a completed Export to Accounting run/);
        this.table = page.getByRole('main').getByRole('table');
        this.toast = page.locator('[data-sonner-toast]').or(page.getByRole('status')).first();
    }

    /** Returns the menu path that landed; the shorter one is a fallback only. */
    async openFromMenu(): Promise<string[]> {
        let used = MENU;
        try {
            await this.leftNav.openScreen(MENU, this.pageUrl);
        } catch {
            used = MENU_WITHOUT_ADMINISTRATION;
            await this.leftNav.openScreen(MENU_WITHOUT_ADMINISTRATION, this.pageUrl);
        }
        await this.intro.waitFor({ state: 'visible', timeout: 30_000 });
        return used;
    }

    /** `26/10/2026, 17:04:41`, local time. */
    static parseRunDate(text: string): Date {
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})/.exec(text.trim());
        if (!m) throw new Error(`Run date "${text}" is not dd/mm/yyyy, HH:mm:ss`);
        return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
    }

    private dataRows(): Locator {
        return this.table.getByRole('row').filter({ has: this.page.getByRole('cell') });
    }

    /** Newest first, as the page lists them. */
    async listRuns(): Promise<ReverseRunRow[]> {
        await this.table.waitFor({ state: 'visible', timeout: 30_000 });
        const headers = (await this.table.getByRole('columnheader').allInnerTexts()).map((h) => h.trim());
        const index = (name: string): number => {
            const i = headers.findIndex((h) => h.startsWith(name));
            if (i < 0) throw new Error(`Reverse export table has no '${name}' column; headers are ${JSON.stringify(headers)}`);
            return i;
        };
        const at = { date: index('Run date'), type: index('Type'), by: index('Performed by'), cards: index('Job Cards') };
        const rows = this.dataRows();
        const count = await rows.count();
        const out: ReverseRunRow[] = [];
        for (let i = 0; i < count; i += 1) {
            const cells = (await rows.nth(i).getByRole('cell').allInnerTexts()).map((c) => c.trim());
            out.push({
                runDate: cells[at.date] ?? '',
                at: ReverseExportPage.parseRunDate(cells[at.date] ?? ''),
                type: cells[at.type] ?? '',
                performedBy: cells[at.by] ?? '',
                jobCards: Number((cells[at.cards] ?? '').replace(/[^0-9]/g, '')),
            });
        }
        return out;
    }

    /** Rows matching an entry's date text, type and card count. */
    rowsOf(entry: ReverseRunRow): Locator {
        return this.dataRows()
            .filter({ has: this.page.getByRole('cell', { name: entry.runDate, exact: true }) })
            .filter({ has: this.page.getByRole('cell', { name: entry.type, exact: true }) })
            .filter({ has: this.page.getByRole('cell', { name: String(entry.jobCards), exact: true }) });
    }

    async reverseRun(own: { id: number; entry: ReverseRunRow }): Promise<{ prompt: string; status: number; jobCardsReversed: number | undefined }> {
        const row = this.rowsOf(own.entry);
        await expect(row, 'exactly one row matches the own export run').toHaveCount(1);

        const blocked: string[] = [];
        const pattern = '**/export-to-accounting/runs/*/reverse**';
        const onReverse = async (route: Route): Promise<void> => {
            const url = route.request().url();
            const sent = /\/runs\/(\d+)\/reverse/.exec(url);
            if (sent && Number(sent[1]) === own.id) {
                await route.continue();
                return;
            }
            blocked.push(url);
            await route.abort();
        };
        await this.page.route(pattern, onReverse);
        let outcome: { prompt: string; status: number; jobCardsReversed: number | undefined };
        try {
            await row.getByRole('button', { name: 'Reverse', exact: true }).click();
            const prompt = this.page.getByText(/This will flip (\d+) Job Card\(s\) back to not-exported/).first();
            await prompt.waitFor({ state: 'visible', timeout: 15_000 });
            const promptText = ((await prompt.innerText()) ?? '').trim();
            const done = this.page.waitForResponse(
                (r) => r.request().method() === 'POST' && new RegExp(`/export-to-accounting/runs/${own.id}/reverse`).test(new URL(r.url()).pathname),
                { timeout: 30_000 },
            );
            done.catch(() => undefined);
            await this.page.getByRole('button', { name: 'Reverse run', exact: true }).click();
            const response = await done;
            const body = (await response.json().catch(() => ({}))) as { jobCardsReversed?: number };
            outcome = { prompt: promptText, status: response.status(), jobCardsReversed: body.jobCardsReversed };
        } finally {
            await this.page.unroute(pattern, onReverse);
        }
        if (blocked.length) throw new Error(`Refused to reverse a run that is not ours (${own.id}): ${blocked.join(', ')}`);
        return outcome;
    }
}

export default ReverseExportPage;
