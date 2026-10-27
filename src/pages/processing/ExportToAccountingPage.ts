import { statSync } from 'node:fs';
import { Download, Locator, Page, Response, Route, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';
import { TestFileSheet } from './TestFileSheet';
import { ordinal } from './ViewJobCardsPage';

export type ExportType = 'Payroll' | 'Cost Accounting';

export interface CandidateRow {
    employee: string;
    date: string;
    status: string;
    recordType: string;
    crew: string;
    flags: string;
}

/** A non-GET the browser sent under /export-to-accounting/ while the Export click was in flight. */
export interface ExportRequest {
    method: string;
    path: string;
    status: number;
}

export interface ExportOutcome {
    requests: ExportRequest[];
    nothingToExport: boolean;
    toasts: string[];
    confirmText: string;
    download: { path: string; bytes: number } | null;
    /** `POST …/run`'s body: `summary` and per-card `failures` (reason codes). */
    runBody: unknown;
}

const CONFIRM_TEXT = /^Export (\d+) JobCard(?:\(s\)|s)? to (.+) via (.+)\?$/;
const OWN_PATH = /\/export-to-accounting\/runs\/(\d+)/;

/**
 * File ▸ Export to Accounting (`/export-to-accounting`, v2). Locators come from the 2026-10-26 dev probe and are
 * unverified until the first run: the toggle shape, the Dates button, the toast texts and the dialog role (CALIBRATE).
 * Test File is read only as evidence (readTestFile). exportOwn refuses unless the grid holds only the caller's crew.
 */
export class ExportToAccountingPage extends BasePage {
    readonly pageUrl = '/export-to-accounting';
    readonly pageTitle: string | RegExp = /Export to Accounting/i;

    readonly datesButton: Locator;
    readonly refreshButton: Locator;
    readonly grid: Locator;
    readonly exportButton: Locator;
    readonly destinationText: Locator;
    readonly testFile: TestFileSheet;
    // CALIBRATE: the Recent Exports locators are unmeasured; the webpet ExportDispatchWorkspacePage testids are a reference only.
    readonly recentButton: Locator;
    readonly recentSheet: Locator;
    private readonly pickPrompt: Locator;
    private readonly leftNav: LeftNavigationPage;

    constructor(page: Page) {
        super(page);
        this.leftNav = new LeftNavigationPage(page);
        this.datesButton = page.getByRole('button', { name: 'Dates', exact: true });
        // Scoped: the Candidates grid's Date filter shows the same prompt.
        this.pickPrompt = this.datesButton.getByText('Pick a date range');
        this.refreshButton = page.getByRole('button', { name: 'Refresh', exact: true });
        this.grid = page.getByRole('grid', { name: 'Candidates' });
        this.exportButton = page.getByRole('button', { name: /^Export (\d+) JobCards?$/ });
        this.destinationText = page.getByText(/·\s*File output/).first();
        this.testFile = new TestFileSheet(page);
        this.recentButton = page.getByTestId('export-v2-history-button').or(page.getByRole('button', { name: /^Recent/ })).first();
        this.recentSheet = page.getByTestId('export-v2-history-sheet').or(page.getByRole('dialog', { name: /Recent Exports/i })).first();
    }

    async openFromMenu(): Promise<void> {
        await this.leftNav.openScreen(['File', 'Export to Accounting'], this.pageUrl);
        await this.typeToggle('Payroll').waitFor({ state: 'visible', timeout: 30_000 });
    }

    typeToggle(name: ExportType): Locator {
        return this.page.getByRole('tab', { name, exact: true });
    }

    /** The header toggle is a tablist (measured 2026-10-26); the active type carries aria-selected. */
    async activeType(): Promise<ExportType | undefined> {
        for (const name of ['Payroll', 'Cost Accounting'] as const) {
            if ((await this.typeToggle(name).getAttribute('aria-selected')) === 'true') return name;
        }
        return undefined;
    }

    async selectType(name: ExportType): Promise<void> {
        if ((await this.activeType()) !== name) await this.typeToggle(name).click();
        await expect
            .poll(() => this.activeType(), { message: `the ${name} tab must read selected`, timeout: 10_000 })
            .toBe(name);
    }

    /** Mirrors ViewJobCardsPage.scopeToDay: the day cell, a collapse guard, Apply. */
    async scopeToDay(day: string): Promise<void> {
        const [year, month, date] = day.split('-');
        const target = new Date(Number(year), Number(month) - 1, Number(date));
        await this.datesButton.click({ timeout: 15_000 });
        const popup = this.page.getByRole('dialog');
        await popup.waitFor({ state: 'visible', timeout: 10_000 });

        const monthName = target.toLocaleString('en-US', { month: 'long' });
        const dayCell = popup.getByRole('button', { name: new RegExp(`${monthName} ${target.getDate()}${ordinal(target.getDate())}, ${target.getFullYear()}`) });
        const previousMonth = popup.getByRole('button', { name: /go to the previous month/i });
        for (let i = 0; i < 12 && (await dayCell.count()) === 0; i += 1) await previousMonth.click();
        await dayCell.first().waitFor({ state: 'visible', timeout: 10_000 });
        await dayCell.first().click();

        const daySegments = popup.getByRole('textbox', { name: 'Day' });
        const collapsed = async () =>
            (await daySegments.nth(0).inputValue()) === String(target.getDate()) && (await daySegments.nth(1).inputValue()) === String(target.getDate());
        if (!(await collapsed())) await dayCell.first().click();
        await popup.getByRole('button', { name: /^apply$/i }).click();
        await expect(this.pickPrompt, `the Dates button must leave "Pick a date range" after scoping to ${day}`).toBeHidden({ timeout: 20_000 });
    }

    /**
     * Refresh POSTs `…/candidates` and `…/runs` (the draft). `onRun` receives the runs body before anything is
     * asserted, so the caller records the id for cleanup first.
     */
    async refresh(onRun: (body: Record<string, unknown>) => void): Promise<{ runStatus: number; candidatesStatus: number }> {
        const post = (suffix: RegExp) => (r: Response) => r.request().method() === 'POST' && suffix.test(new URL(r.url()).pathname);
        const runs = this.page.waitForResponse(post(/\/export-to-accounting\/runs$/), { timeout: 60_000 });
        const candidates = this.page.waitForResponse(post(/\/export-to-accounting\/candidates$/), { timeout: 60_000 });
        runs.catch(() => undefined);
        candidates.catch(() => undefined);
        await expect(this.refreshButton, 'Refresh stays disabled until a date range is picked').toBeEnabled({ timeout: 15_000 });
        await this.refreshButton.click();
        const runsResponse = await runs;
        onRun((await runsResponse.json()) as Record<string, unknown>);
        const candidatesResponse = await candidates;
        await this.grid.waitFor({ state: 'visible', timeout: 30_000 });
        return { runStatus: runsResponse.status(), candidatesStatus: candidatesResponse.status() };
    }

    async openRecentExports(): Promise<void> {
        await this.recentButton.click({ timeout: 15_000 });
        await this.recentSheet.waitFor({ state: 'visible', timeout: 15_000 });
    }

    async closeRecentExports(): Promise<void> {
        await this.page.keyboard.press('Escape');
        await expect(this.recentSheet).toBeHidden({ timeout: 15_000 });
    }

    /** The own run's row by id; never "the newest row", so a missing own row fails by name. */
    recentRow(runId: number): Locator {
        return this.page.getByTestId(`export-v2-history-row-${runId}`);
    }

    /**
     * Opens the own run's row (measured 2026-10-27): the sheet swaps to a detail view, "N succeeded · N failed · N skipped"
     * plus one "JobCard #id" line per card, then returns to the list. The file is not downloadable here; it exists only at Save.
     */
    async recentRunDetail(runId: number): Promise<{ succeeded: number; failed: number; skipped: number; jobCards: number[] }> {
        const row = this.recentRow(runId);
        await row.waitFor({ state: 'visible', timeout: 15_000 });
        const isToggle = (await row.evaluate((e) => e.tagName)) === 'BUTTON';
        await (isToggle ? row : row.getByRole('button', { name: /^(payroll|cost)/i })).click({ timeout: 15_000 });
        const summary = this.recentSheet.getByText(/\d+ succeeded · \d+ failed · \d+ skipped/);
        await summary.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
            throw new Error(`Recent Exports run ${runId}: the detail view shows no "N succeeded · N failed · N skipped" line.`);
        });
        const [succeeded, failed, skipped] = ((await summary.innerText()).match(/\d+/g) ?? []).map(Number);
        const jobCards = (await this.recentSheet.getByText(/^JobCard #\d+$/).allInnerTexts()).map((t) => Number(/\d+/.exec(t)?.[0]));
        await this.recentSheet.getByRole('button', { name: 'Back to list' }).click({ timeout: 15_000 });
        return { succeeded, failed, skipped, jobCards };
    }

    toastText(text: string | RegExp): Locator {
        return this.page.getByText(text).first();
    }

    /** `N Ready` pill; 0 when the pill is absent. */
    async readyCount(): Promise<number> {
        const pill = this.page.getByRole('button', { name: /^(\d+) Ready\b/ }).first();
        if (!(await pill.isVisible())) return 0;
        return Number(/^(\d+)/.exec(((await pill.textContent()) ?? '').trim())?.[1] ?? 0);
    }

    async exportCount(): Promise<number> {
        if (!(await this.exportButton.isVisible())) return 0;
        return Number(/Export (\d+)/.exec((await this.exportButton.textContent()) ?? '')?.[1] ?? 0);
    }

    async candidates(): Promise<CandidateRow[]> {
        await this.grid.waitFor({ state: 'visible', timeout: 30_000 });
        const headers = (await this.grid.getByRole('columnheader').allInnerTexts()).map((h) => h.replace(/^Reorder column /, '').trim());
        const index = (name: string): number => {
            const i = headers.findIndex((h) => h === name || h.startsWith(`${name}\n`));
            if (i < 0) throw new Error(`Candidates grid has no '${name}' column; headers are ${JSON.stringify(headers)}`);
            return i;
        };
        const at = { employee: index('Employee'), date: index('Date'), status: index('Status'), recordType: index('Record Type'), crew: index('Crew'), flags: index('Flags') };
        const rows = this.grid.getByRole('row').filter({ has: this.page.getByRole('cell') });
        const count = await rows.count();
        const out: CandidateRow[] = [];
        for (let i = 0; i < count; i += 1) {
            const cells = (await rows.nth(i).getByRole('cell').allInnerTexts()).map((c) => c.trim());
            out.push({
                employee: cells[at.employee] ?? '',
                date: cells[at.date] ?? '',
                status: cells[at.status] ?? '',
                recordType: cells[at.recordType] ?? '',
                crew: cells[at.crew] ?? '',
                // "—" is the grid's empty placeholder, not a flag.
                flags: (cells[at.flags] ?? '').replace(/^—$/, ''),
            });
        }
        return out;
    }

    /**
     * The footer's Test File, read and closed: the same analyze sheet as View ▸ Job Cards (`TestFileSheet`).
     * Evidence only — it never throws, so a sheet change cannot fail the export it describes.
     */
    async readTestFile(): Promise<{ ready: number; cannotExport: number; failures: string[] } | { error: string }> {
        const sheet = this.testFile;
        try {
            await sheet.open();
            const summary = await sheet.readSummary();
            const failures = await sheet.failureTexts();
            await sheet.dismissResults().catch(() => undefined);
            await sheet.close();
            return { ...summary, failures };
        } catch (e) {
            // Escape does not close this sheet; a sheet left open hides the grid from the export that follows.
            await sheet.close().catch(() => this.page.keyboard.press('Escape').catch(() => undefined));
            return { error: String(e).slice(0, 300) };
        }
    }

    /**
     * Refine ▸ Search by Job Card Crew, Contains, Is Value = the crew — the criteria builder D6's Recalculate wizard
     * uses (`JobCardsPage.scopeToCrew`). A past day holds other suites' cards (Journey B's A Kishore on E11's day,
     * 2026-10-26) and the grid's row checkboxes are read-only, so the scope is set before Refresh.
     */
    async scopeToCrew(crewName: string): Promise<void> {
        if (!crewName.trim()) throw new Error('Export to Accounting: refusing to scope with an empty crew name');
        const criteria = this.page.getByTestId('export-accounting-criteria');
        const line = criteria.getByTestId('view-job-cards-criteria-line-jobCardCrew-edit');
        // The second pass re-opens the page; a criterion that survived the reload is not added twice.
        if (((await line.textContent({ timeout: 2_000 }).catch(() => null)) ?? '').includes(crewName)) return;
        await criteria.getByTestId('view-job-cards-criteria-search-by').click();
        await this.page.getByRole('option', { name: 'Job Card Crew', exact: true }).click();
        await criteria.getByTestId('view-job-cards-criteria-match').click();
        await this.page.getByRole('option', { name: 'Contains', exact: true }).click();
        await criteria.getByTestId('view-job-cards-criteria-jobCardCrew-like-location').click();
        await this.page.getByRole('option', { name: 'Is Value', exact: true }).click();
        await criteria.getByTestId('view-job-cards-criteria-jobCardCrew-text').fill(crewName);
        await expect(line).toContainText(crewName, { timeout: 15_000 });
    }

    /**
     * Refuses to click unless the grid holds exactly `expectedCount` rows, all of `crew`, and the footer button says
     * the same number. A route guard aborts any non-GET for a run id outside `own`. Returns what the browser sent;
     * the caller decides what a missing request or "Nothing to export" means.
     */
    async exportOwn(opts: { expectedCount: number; crew: string; own: readonly number[]; saveDownloadTo?: string }): Promise<ExportOutcome> {
        const rows = await this.candidates();
        const outsiders = rows.filter((r) => r.crew !== opts.crew);
        const count = await this.exportCount();
        if (rows.length !== opts.expectedCount || outsiders.length || count !== opts.expectedCount) {
            throw new Error(
                `Refusing to export: the Candidates grid shows ${rows.length} row(s) (${JSON.stringify(rows.map((r) => r.crew))}), ` +
                    `the button says ${count}, this test owns ${opts.expectedCount} row(s) of '${opts.crew}'.`,
            );
        }

        const blocked: string[] = [];
        const guard = async (route: Route): Promise<void> => {
            const request = route.request();
            const id = OWN_PATH.exec(new URL(request.url()).pathname)?.[1];
            if (request.method() !== 'GET' && id !== undefined && !opts.own.includes(Number(id))) {
                blocked.push(request.url());
                await route.abort();
                return;
            }
            await route.continue();
        };
        const requests: ExportRequest[] = [];
        // The run's own answer: a 200 can still export nothing, and only its `failures` say why (missing_earning_code, 2026-10-26).
        let runBody: Promise<unknown> = Promise.resolve(undefined);
        const onResponse = (r: Response): void => {
            const { pathname } = new URL(r.url());
            if (r.request().method() !== 'GET' && pathname.includes('/export-to-accounting/')) {
                requests.push({ method: r.request().method(), path: pathname, status: r.status() });
                if (/\/export-to-accounting\/run$/.test(pathname)) runBody = r.json().catch(() => undefined);
            }
        };
        const isExportRequest = (r: ExportRequest): boolean => !/\/export-to-accounting\/(candidates|runs)$/.test(r.path);
        const nothing = this.page.getByText(/^Nothing to export/);
        const dialog = this.page.getByRole('alertdialog').or(this.page.getByRole('dialog'));
        let sawNothing = false;
        let confirmText = '';
        const saveDialog = this.page.getByRole('alertdialog', { name: /Save export file/i });
        const savedToast = this.page.getByText(/Export complete — the JobCards are now marked exported/);
        const saveFailed = this.page.getByText(/The file could not be saved/);

        await this.page.route('**/export-to-accounting/**', guard);
        this.page.on('response', onResponse);
        try {
            await this.exportButton.click();
            await dialog.waitFor({ state: 'visible', timeout: 15_000 });
            confirmText = ((await dialog.getByText(CONFIRM_TEXT).first().innerText()) ?? '').trim();
            const shown = Number(CONFIRM_TEXT.exec(confirmText)?.[1]);
            if (shown !== opts.expectedCount) throw new Error(`The confirm dialog reads "${confirmText}", expected ${opts.expectedCount} job card(s); not confirming.`);
            // The SPA reads showSaveFilePicker at Save time; undefined makes it fall back to an anchor download Playwright can capture.
            await this.page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
            await dialog.getByRole('button', { name: 'Export', exact: true }).click();

            await expect
                .poll(
                    async () => {
                        if (await nothing.first().isVisible().catch(() => false)) sawNothing = true;
                        return sawNothing || requests.some(isExportRequest);
                    },
                    { timeout: 30_000 },
                )
                .toBe(true)
                .catch(() => undefined);
            // Nothing is marked exported until Save: the "Save export file" dialog holds the file and blocks the page.
            let saved: ExportOutcome['download'] = null;
            if (!sawNothing && (await saveDialog.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false))) {
                const downloading = this.page.waitForEvent('download', { timeout: 30_000 });
                downloading.catch(() => undefined);
                await saveDialog.getByRole('button', { name: 'Save', exact: true }).click({ timeout: 10_000 });
                const file: Download | null = await downloading.catch(() => null);
                const outcomeToast = await Promise.race([
                    savedToast.first().waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'saved' as const),
                    saveFailed.first().waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'failed' as const),
                ]).catch(() => 'none' as const);
                if (outcomeToast === 'failed') throw new Error('The file could not be saved — the Save export file dialog answered failure; nothing is marked exported.');
                if (outcomeToast === 'none') throw new Error('Save was clicked but neither "Export complete — the JobCards are now marked exported." nor a save failure appeared within 30s.');
                if (!file) throw new Error('Save completed but the browser raised no download event for the export file.');
                if (opts.saveDownloadTo) {
                    await file.saveAs(opts.saveDownloadTo);
                    saved = { path: opts.saveDownloadTo, bytes: statSync(opts.saveDownloadTo).size };
                }
            }
            const toast = this.page.locator('[data-sonner-toast]').or(this.page.getByRole('status'));
            await toast.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
            const toasts = (await toast.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
            if (blocked.length) throw new Error(`Refused an export request for a run that is not ours: ${blocked.join(', ')}`);
            return {
                requests,
                nothingToExport: sawNothing || toasts.some((t) => /^Nothing to export/i.test(t)),
                toasts,
                confirmText,
                download: saved,
                runBody: await runBody,
            };
        } finally {
            this.page.off('response', onResponse);
            await this.page.unroute('**/export-to-accounting/**', guard);
        }
    }
}

export default ExportToAccountingPage;
