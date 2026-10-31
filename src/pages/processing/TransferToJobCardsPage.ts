import { expect, test, Frame, Locator, Page, Request, Response, TestInfo } from '@playwright/test';
import { acquireTransferScreenLock } from '../../utils/sync/preferencesLock';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';
import { WebpetMultiEditDialogComponent } from '../../components/webpet/WebpetMultiEditDialogComponent';
import { DataGridComponent } from '../../components/DataGridComponent';
import { pickRangeInPopup, usDate } from './dateRangePopup';
import { ReportDialog } from './ReportDialog';
import { PdfViewerDialog } from '../reports/PdfViewerDialog';

export type Box = { x: number; y: number; width: number; height: number };
export type StatusPill = 'ready' | 'blocking' | 'warnings' | 'deferred';
export type GridFilterKind = 'Work Crew' | 'Employee';

const GRID_FILTER_TESTID: Record<GridFilterKind, string> = { 'Work Crew': 'transfer-grid-filter-crews', Employee: 'transfer-grid-filter-employees' };
// The screen's default End; the value is localStorage-only, so a test that moves it puts it back.
const TRANSFER_END_OF_DAY = '23:59';

/**
 * Input ▸ Transfer to Job Card (catalog D2/D4) — the screen Amy's Journey B
 * recordings end on: after a device sync and import, the crew's punches show up
 * here for review before anything is committed.
 *
 * Locators come from the deployed V2 screen (`transfer/v2/TransferToJobCardsPageV2.tsx`
 * plus `DemotedTimecardsGrid`), confirmed by dumping the live DOM on dev staging —
 * not from the component names.
 *
 * Two things to know before asserting on rows:
 *
 * 1. **The grid is ARIA-role based, not a `<table>`.** The shared `DataGrid`
 *    renders virtualized divs with `role="grid"/"row"/"cell"`, so `getByRole('row')`
 *    works but `page.locator('tr')` finds nothing.
 * 2. **Rows only appear after a date range is applied**, and the grid is populated by
 *    `POST /transfer-to-job-cards/analyze`, which is gated by the server-side
 *    `PT_TRANSFER_ANALYZE_ENABLED` flag — when it is off the endpoint 404s and the
 *    grid stays empty regardless of the data. {@link analyzeEnabled} distinguishes
 *    that environment gap from a genuinely missing row.
 *
 * Journey B uses this screen read-only; running the transfer itself is D4.
 */
/** Why the grid never reached `atLeast` candidates. Only `analyze-lost` is infra noise. */
export type CandidateWaitReason = 'analyze-lost' | 'timeout' | 'short-count';
export type CandidateWaitResult =
    | { ok: true; count: number }
    | {
          ok: false;
          reason: CandidateWaitReason;
          count: number;
          /**
           * A GET .../analyze/{jobId} answered 404 not_found at some point. This, not
           * `reason`, is the proven WEBPET-1907 signature: the same 404 surfaces as
           * `analyze-lost` when the page offers "Try again" and as `short-count` when
           * it renders an empty caption instead, so callers key tolerance on this.
           */
          sawAnalyze404: boolean;
      };

/** One row of the Job Cards tab, as the cells read — D10's segment preview. */
export interface PreviewSegment {
    job: string;
    timeIn: string;
    timeOut: string;
    grossTime: string;
    netTime: string;
    /** NaN while the cell is empty, so a poll keeps waiting. */
    amount: number;
}

/** One row of the Job Cards tab's overtime columns (E2). Numbers are NaN while a cell is empty. */
export interface PreviewOvertimeRow {
    job: string;
    grossTime: number;
    meal: number;
    netTime: number;
    regularHours: number;
    overtime: number;
    doubleTime: number;
    amount: number;
}

/** One Time Cards row, every cell resolved by its header. Status holds the badge keyword only. */
export interface TransferRowView {
    crew: string;
    employee: string;
    date: string;
    time: string;
    field: string;
    job: string;
    pieces: string;
    traceability: string;
    ranch: string;
    reference: string;
    type: string;
    payByPiece: string;
    transferred: string;
    run: string;
    employeeSelection: string;
    status: string;
    manuallyEdited: boolean;
}

export class TransferToJobCardsPage extends BasePage {
    readonly pageUrl: string = '/transfer-to-job-cards';
    readonly pageTitle: string | RegExp = /Transfer to Job Cards/i;

    /** Page root — present as soon as the screen mounts. */
    readonly pageRoot: Locator;
    /** Counters strip (ready / blocking / warnings / deferred). */
    readonly topStrip: Locator;
    readonly timeCardsTab: Locator;
    readonly jobCardsTab: Locator;
    /** The time-cards grid. */
    readonly grid: Locator;
    readonly gridHeader: Locator;
    /** Every rendered row (ARIA role, not a table row). */
    readonly rows: Locator;
    /** Shown while no date range has been applied — i.e. nothing analyzed yet. */
    readonly pickRangePrompt: Locator;
    /** Banner the page shows when the analyze call fails. */
    readonly analyzeError: Locator;
    /** The date-range column filter — the grid stays empty until it is applied. */
    readonly dateRangeFilter: Locator;
    /** Enabled once a range is committed; runs the analyze that fills the grid. */
    readonly analyzeButton: Locator;
    /**
     * Shown inside the grid when the analyze job is lost between processes (a
     * per-process job store, WEBPET-1907 class — `GET …/analyze/{jobId}` 404s).
     * No testid exists for this state; the button's accessible role is the
     * repo-priority hook.
     */
    readonly analyzeRetryButton: Locator;
    /** "Includes N Time Cards of M initial selection" — the grid's own count. */
    readonly gridCaption: Locator;
    /** The "Warnings (n)" pill in {@link topStrip}. */
    readonly warningsCounter: Locator;
    /** The Issues breakdown panel below the grid. */
    readonly issuesRegion: Locator;

    /** Grid header "Columns" button and the "Show columns" picker it opens. */
    readonly columnsButton: Locator;
    readonly columnPicker: Locator;

    // Client feedback (WEBPET-3183/3431/3829/3830/3835)
    /** Toolbar Report; opens the report selection dialog since WEBPET-3829. */
    readonly report: ReportDialog;
    readonly displayReportButton: Locator;
    readonly pdfViewer: PdfViewerDialog;
    readonly beginTimeInput: Locator;
    /** type=time, HH:MM, browser-stored. */
    readonly endTimeInput: Locator;
    readonly searchByControl: Locator;
    readonly issuesPanel: Locator;
    readonly issuesGroupBy: Locator;

    // ── Multi-Edit (top-level "Multi Update" toolbar button) ──────────────────────
    /**
     * Role-based, not a testid. Relocated from a "More actions ▸ Multi-Edit" menu
     * item to its own top-level toolbar button (verified live 2026-09-24, mirroring
     * the same rework Time In's Multi Update bar already got) — the "More actions"
     * menu now holds only "Set crew" and "Delete Time Cards".
     */
    readonly multiUpdateButton: Locator;
    readonly multiEdit: WebpetMultiEditDialogComponent;

    /**
     * The Time In side panel opened from a row — title "Time In", fields
     * Reference / Date-Time / Ranch / Field / Phase / Employee / Work Crew /
     * GPS Reading, footer Delete / Cancel / Save. Scoped to the innermost `div`
     * carrying both the heading and the Save button: any ancestor wrapping the
     * panel also satisfies the same `has` filters, so `.last()` picks the
     * tightest container rather than the whole page shell. Save rather than
     * Cancel, because a dirty form relabels Cancel to "Discard changes".
     */
    readonly timeInPanel: Locator;
    readonly panelCancelButton: Locator;
    readonly panelRanchValue: Locator;
    readonly panelFieldValue: Locator;
    readonly panelPhaseValue: Locator;
    readonly panelEmployeeValue: Locator;
    readonly panelWorkCrewValue: Locator;
    /**
     * GPS Reading is a plain text box, NOT an Autocomplete combobox like the
     * lookup fields beside it (no dropdown chevron in the recording) — so the
     * textbox role, not combobox. Note the deployed dev build has the label in
     * its bundle but did not render the field on a card that carries a fix, so
     * the caller must treat absence as a renderable state, not an error.
     */
    readonly panelGpsValue: Locator;
    /** "New record" menu trigger — Add Time-In / Add Time-Out (D5). */
    readonly newRecordButton: Locator;
    /** The Time Out side panel; same shape as {@link timeInPanel}. Inferred from the shared form — verify on the first run. */
    readonly timeOutPanel: Locator;

    /** `/transfer-to-job-cards/analyze` responses since the last {@link analyze} call. */
    private analyzeResponses: Array<{ status: number; code?: string }> = [];
    /** Sticky across retries (which clear analyzeResponses): did ANY analyze poll 404 not_found? */
    private analyzeSaw404 = false;
    private analyzeResponseHandler?: (response: Response) => void;
    /** How many times {@link tryWaitForCandidates} clicked "Try again" this call. */
    private analyzeRetries = 0;
    private releaseScreenLock?: () => void;

    private readonly leftNav: LeftNavigationPage;

    constructor(page: Page) {
        super(page);
        this.leftNav = new LeftNavigationPage(page);
        this.pageRoot = page.getByTestId('transfer-v2-page');
        this.topStrip = page.getByTestId('transfer-v2-top-strip');
        this.timeCardsTab = page.getByTestId('ttjc-tab-timecards');
        this.jobCardsTab = page.getByTestId('ttjc-tab-jobcards');
        this.grid = page.getByTestId('v2-demoted-grid');
        this.gridHeader = page.getByTestId('v2-grid-header');
        this.rows = page.getByRole('row');
        this.pickRangePrompt = page.getByTestId('v2-grid-empty-pick-range');
        this.analyzeError = page.getByTestId('transfer-analyze-error-banner');
        this.analyzeButton = page.getByRole('button', { name: 'Analyze Transfer Candidates' });
        this.analyzeRetryButton = page.getByRole('button', { name: 'Try again' });
        this.gridCaption = page.getByText(/^Includes \d+ Time Cards? of \d+ initial selection$/);
        // The top-section date scope (`#transfer-date-scope`, aria-label "Dates"),
        // not a column filter. There used to be a "Date range" column header with its
        // own button; it is gone — the grid now carries separate "date" and "time"
        // columns and no header by that name exists even once rows are loaded. The
        // column-header button was also unreachable by construction: the page opens
        // with no range selected, so the grid is empty and renders no headers at all,
        // and the control needed to pick a range only appeared once a range had
        // already been picked. This one is always present. Matched by accessible name
        // and exact, to keep it off the empty-state prompt below the grid
        // (`v2-grid-empty-pick-range`), whose text is also "date range".
        this.dateRangeFilter = this.pageRoot.getByRole('button', { name: 'Dates', exact: true });
        this.warningsCounter = this.topStrip.getByText(/Warnings/i);
        this.issuesRegion = page.getByRole('region', { name: 'Issues' });
        this.columnsButton = this.gridHeader.getByRole('button', { name: 'Columns', exact: true });
        this.columnPicker = page.getByRole('dialog', { name: 'Show columns' });
        this.report = new ReportDialog(page, page.getByTestId('v2-toolbar-report'));
        this.displayReportButton = page.getByTestId('v2-toolbar-display-report');
        this.pdfViewer = new PdfViewerDialog(page);
        this.beginTimeInput = page.getByTestId('transfer-begin-time-input');
        this.endTimeInput = page.getByTestId('transfer-end-time-input');
        this.searchByControl = page.getByTestId('transfer-search-by-trigger');
        this.issuesPanel = page.getByTestId('v2-issues-panel');
        this.issuesGroupBy = page.getByTestId('v2-issues-group-by');

        this.multiUpdateButton = page.getByRole('button', { name: /^Multi Update$/i });
        this.multiEdit = new WebpetMultiEditDialogComponent(page);

        this.timeInPanel = page
            .locator('div')
            .filter({ has: page.getByRole('heading', { name: /^Time In$/i }) })
            .filter({ has: page.getByRole('button', { name: /^Save$/i }) })
            .last();
        this.panelCancelButton = this.timeInPanel.getByRole('button', { name: /^Cancel$/i });
        this.panelRanchValue = this.comboboxByLabel('Ranch');
        this.panelFieldValue = this.comboboxByLabel('Field');
        this.panelPhaseValue = this.comboboxByLabel('Phase');
        this.panelEmployeeValue = this.comboboxByLabel('Employee');
        this.panelWorkCrewValue = this.comboboxByLabel('Work Crew');
        this.panelGpsValue = this.timeInPanel.getByRole('textbox', { name: /^GPS Reading\b/ });
        this.newRecordButton = page.getByTestId('v2-add-record-trigger');
        this.timeOutPanel = page
            .locator('div')
            .filter({ has: page.getByRole('heading', { name: /^Time Out$/i }) })
            .filter({ has: page.getByRole('button', { name: /^Save$/i }) })
            .last();
    }

    /** By address — the webpet suite's entry. Journeys use {@link openFromMenu}. */
    async goto(): Promise<void> {
        await this.holdScreenLock(async () => {
            await this.page.goto(this.pageUrl);
            await this.pageRoot.waitFor({ state: 'visible', timeout: 30_000 });
        });
    }

    async openFromMenu(): Promise<void> {
        await this.holdScreenLock(async () => {
            await this.leftNav.openScreen(['Transfer to Job Cards'], this.pageUrl);
            await this.pageRoot.waitFor({ state: 'visible', timeout: 30_000 });
        });
    }

    /**
     * Take the lock, run `arrive`, then hold until the page leaves the screen or closes; see
     * {@link acquireTransferScreenLock}. The leave-watch is armed only after arrival: openScreen's
     * openApp() passes through '/' first, which would otherwise release the lock on the way in.
     */
    private async holdScreenLock(arrive: () => Promise<void>): Promise<void> {
        if (this.releaseScreenLock) {
            await arrive();
            return;
        }
        const release = await acquireTransferScreenLock();
        const done = (): void => {
            this.page.off('framenavigated', onNavigate);
            this.page.off('close', done);
            this.releaseScreenLock = undefined;
            release();
        };
        const onNavigate = (frame: Frame): void => {
            if (frame === this.page.mainFrame() && !new URL(frame.url()).pathname.startsWith(this.pageUrl)) done();
        };
        this.page.on('close', done);
        this.releaseScreenLock = done;
        try {
            await arrive();
        } catch (error) {
            done();
            throw error;
        }
        this.page.on('framenavigated', onNavigate);
    }

    async openColumnPicker(): Promise<void> {
        await this.columnsButton.click();
        await this.columnPicker.waitFor({ state: 'visible', timeout: 10_000 });
    }

    /** Each entry also renders an unnamed hidden input checkbox; the name filter excludes it. */
    columnPickerEntry(label: string): Locator {
        return this.columnPicker.getByRole('checkbox', { name: label, exact: true });
    }

    /** Ticks the entry if it is not already; true when it had to. The layout is saved per user, so callers only tick. */
    async showColumn(label: string): Promise<boolean> {
        const entry = this.columnPickerEntry(label);
        if (await entry.isChecked()) return false;
        await entry.click();
        await expect(entry).toBeChecked();
        return true;
    }

    /** Ticks the entry when it is not; a tick is recorded as a `self-heal` annotation. */
    async ensureColumnShown(label: string, testInfo: TestInfo): Promise<void> {
        if (await this.showColumn(label)) testInfo.annotations.push({ type: 'self-heal', description: `'${label}' was unticked; ticked on screen` });
    }

    async closeColumnPicker(): Promise<void> {
        await this.columnPicker.getByRole('button', { name: 'Close', exact: true }).click();
        await this.columnPicker.waitFor({ state: 'hidden', timeout: 10_000 });
    }

    /** Exact, so "Pay by Piece" cannot match "Pieces". */
    gridColumnHeader(header: string): Locator {
        return this.grid.getByRole('columnheader', { name: `Reorder column ${header}`, exact: true });
    }

    /**
     * Load the grid for a day — the step Amy performs at the end of the
     * recordings, and the only way rows ever appear (the screen analyses nothing
     * until a range is committed).
     *
     * The filter is a segmented date input, not a text field: two groups of
     * Month/Day/Year with `aria-label`s, plus Cancel/Apply. Two things learned the
     * hard way:
     *   - Apply does nothing while the segments are untouched, even though they
     *     already display today, so each group must be typed before committing.
     *   - Typing `MMDDYYYY` into a group's Month segment auto-advances through the
     *     rest; intermediate values can look garbled while the chip still resolves
     *     correctly, so assert the committed chip rather than the segments.
     *
     * For any other day, typing into the segments never commits (the chip keeps
     * the previous range); clicking the calendar day cell ("Monday, August 24th,
     * 2026") does. One click collapses the range onto that day, a second click
     * on the same cell toggles it back to today — hence the read-back guard.
     */
    async applyDateRange(date = new Date()): Promise<void> {
        const pad = (n: number) => String(n).padStart(2, '0');
        const sameDay = (a: Date, b: Date) =>
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        await this.dateRangeFilter.click();
        const popup = this.page.getByRole('dialog');
        await popup.waitFor({ state: 'visible', timeout: 10_000 });

        // Prefer the popup's quick-select presets: typing into the segmented
        // Month/Day/Year inputs commits nothing for a non-today date (the chip
        // stays on today), which only ever *looked* like it worked because the
        // chip already displayed today.
        const preset = sameDay(date, new Date())
            ? 'Today'
            : sameDay(date, yesterday)
              ? 'Yesterday'
              : null;
        if (preset) {
            await popup.getByText(preset, { exact: true }).click();
        } else {
            const ordinal = (n: number) => {
                if (n % 10 === 1 && n % 100 !== 11) return 'st';
                if (n % 10 === 2 && n % 100 !== 12) return 'nd';
                if (n % 10 === 3 && n % 100 !== 13) return 'rd';
                return 'th';
            };
            const monthName = date.toLocaleString('en-US', { month: 'long' });
            const dayLabel = new RegExp(
                `${monthName} ${date.getDate()}${ordinal(date.getDate())}, ${date.getFullYear()}`,
            );
            // Only the past is ever requested (punchDate = today − N days), so
            // only "previous month" navigation is needed to bring an
            // out-of-view day into the two-month calendar.
            const prevMonthButton = popup.getByRole('button', { name: /go to the previous month/i });
            const dayCell = popup.getByRole('button', { name: dayLabel });
            for (let i = 0; i < 12 && (await dayCell.count()) === 0; i += 1) {
                await prevMonthButton.click();
            }
            await dayCell.first().waitFor({ state: 'visible', timeout: 10_000 });
            await dayCell.first().click();

            // Confirm both ends of the range collapsed onto the target day —
            // a stale range (e.g. a multi-day preset applied by an earlier
            // test) can need a second click to close onto a single day.
            // Clicking a third time would toggle it back off, so this reads
            // state rather than clicking blindly.
            const daySegments = popup.getByRole('textbox', { name: 'Day' });
            const collapsed = async () =>
                (await daySegments.nth(0).inputValue()) === String(date.getDate()) &&
                (await daySegments.nth(1).inputValue()) === String(date.getDate());
            if (!(await collapsed())) {
                await dayCell.first().click();
            }
        }
        await this.page.getByRole('button', { name: /^apply$/i }).click();

        const expected = `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
        await expect(this.dateRangeFilter).toContainText(expected, { timeout: 20_000 });
    }

    /** Screenshot of the screen as the reviewer sees it, for the run's evidence. */
    async screenshot(): Promise<Buffer> {
        return this.page.screenshot();
    }

    /**
     * Load the grid for the committed range. The screen no longer analyzes on
     * date commit — it parks on "Ready to analyze." until this is clicked.
     */
    async analyze(): Promise<void> {
        this.watchAnalyzeResponses();
        await this.analyzeButton.click();
    }

    /**
     * Wire the analyze responses BEFORE the click so a per-process job-store 404
     * (GET …/analyze/{jobId} — WEBPET-1907 class, seen on multi-task dev) is captured
     * for the caller to diagnose, instead of surfacing as a bare locator timeout.
     */
    private watchAnalyzeResponses(): void {
        this.analyzeResponses = [];
        this.analyzeRetries = 0;
        this.analyzeSaw404 = false;
        this.detachAnalyzeResponseListener();
        this.analyzeResponseHandler = (response) => {
            if (!/\/transfer-to-job-cards\/analyze(\/|$)/.test(new URL(response.url()).pathname)) return;
            // The result is read-once on the server. Never touch a 2xx body here: a GET the page did not
            // send consumed finished analyze results ~100 ms after the first poll in CI (run 41210291531,
            // job 9743f41d), and this body read is the prime suspect. Only a 404 is read, for its code.
            if (response.status() !== 404) {
                this.analyzeResponses.push({ status: response.status(), code: undefined });
                return;
            }
            void response
                .json()
                .catch(() => ({}))
                .then((body: { code?: string }) => {
                    if (body.code === 'not_found') this.analyzeSaw404 = true;
                    this.analyzeResponses.push({ status: 404, code: body.code });
                });
        };
        this.page.on('response', this.analyzeResponseHandler);
    }

    private detachAnalyzeResponseListener(): void {
        if (this.analyzeResponseHandler) {
            this.page.off('response', this.analyzeResponseHandler);
            this.analyzeResponseHandler = undefined;
        }
    }

    /**
     * Wait for the grid to finish analysing, then report its candidate count.
     * Throws when the grid never loads, naming the true reason — the old message
     * blamed a lost analyze job for all three exits, which sent a B6 triage down
     * the wrong path entirely.
     */
    async waitForCandidates(atLeast = 1, timeout = 90_000): Promise<number> {
        const result = await this.waitForCandidatesResult(atLeast, timeout);
        if (result.ok) return result.count;
        if (result.reason === 'analyze-lost') {
            throw new Error(`grid never loaded at least ${atLeast} transfer candidate(s) (analyze job lost)`);
        }
        if (result.reason === 'timeout') {
            throw new Error(
                `grid never loaded at least ${atLeast} transfer candidate(s) ` +
                    `(neither caption nor retry appeared within ${timeout}ms)`,
            );
        }
        throw new Error(
            `grid never loaded at least ${atLeast} transfer candidate(s) (saw only ${result.count})`,
        );
    }

    /**
     * Like {@link waitForCandidates} but returns `null` instead of throwing when
     * the grid never loads because the analyze job vanished — `GET
     * …/transfer-to-job-cards/analyze/{jobId}` 404 `not_found`, a per-process job
     * store (WEBPET-1907 class) on multi-task dev. Races the grid caption against
     * {@link analyzeRetryButton}; on that exact 404 signature it clicks Try again
     * (which restarts the job) up to 5 times inside a 60s cap. Any other failure
     * shape (5xx, network) throws immediately with the captured statuses — only
     * the proven infra signature is tolerated.
     *
     * Must poll the caption, not read it once: it reads "Includes 0 Time Cards of
     * 0 initial selection" before and during analysis and is only rewritten when
     * the response lands.
     */
    async tryWaitForCandidates(atLeast = 1, timeout = 90_000): Promise<number | null> {
        const result = await this.waitForCandidatesResult(atLeast, timeout);
        return result.ok ? result.count : null;
    }

    /**
     * As {@link tryWaitForCandidates}, but says WHY it gave up. `timeout` is 90s,
     * not 45s: B6 watched analyze return 15 candidates just past the old cut-off
     * on a loaded dev, and the miss was reported as a lost analyze job.
     */
    async waitForCandidatesResult(atLeast = 1, timeout = 90_000): Promise<CandidateWaitResult> {
        const heading = this.gridCaption;
        // Never block: on the timeout exit the caption does not exist at all, and a
        // bare textContent() waits the full test timeout before reporting the reason.
        const count = async () => {
            const text = await heading.textContent({ timeout: 1_000 }).catch(() => '');
            return Number(/^Includes (\d+) /.exec((text ?? '').trim())?.[1] ?? 0);
        };
        const overallDeadline = Date.now() + Math.max(timeout, 60_000);

        for (;;) {
            const outcome = await Promise.race([
                heading
                    .waitFor({ state: 'visible', timeout })
                    .then(() => 'ready' as const)
                    .catch(() => 'timeout' as const),
                this.analyzeRetryButton
                    .waitFor({ state: 'visible', timeout })
                    .then(() => 'retry' as const)
                    .catch(() => 'timeout' as const),
            ]);

            if (outcome === 'ready') {
                try {
                    await expect
                        .poll(count, {
                            timeout,
                            message: `grid never loaded at least ${atLeast} transfer candidate(s)`,
                        })
                        .toBeGreaterThanOrEqual(atLeast);
                } catch {
                    this.detachAnalyzeResponseListener();
                    return { ok: false, reason: 'short-count', count: await count(), sawAnalyze404: this.analyzeSaw404 };
                }
                this.detachAnalyzeResponseListener();
                return { ok: true, count: await count() };
            }
            if (outcome !== 'retry') {
                this.detachAnalyzeResponseListener();
                return { ok: false, reason: 'timeout', count: await count(), sawAnalyze404: this.analyzeSaw404 };
            }

            const knownSignature = this.analyzeResponses.some((r) => r.status === 404 && r.code === 'not_found');
            const otherFailure = this.analyzeResponses.find((r) => !(r.status === 404 && r.code === 'not_found'));
            if (otherFailure || !knownSignature) {
                this.detachAnalyzeResponseListener();
                throw new Error(
                    `Transfer analyze failed with an unrecognised signature: ${JSON.stringify(this.analyzeResponses)}`,
                );
            }
            if (this.analyzeRetries >= 5 || Date.now() > overallDeadline) {
                this.detachAnalyzeResponseListener();
                return { ok: false, reason: 'analyze-lost', count: await count(), sawAnalyze404: this.analyzeSaw404 };
            }

            this.analyzeRetries += 1;
            this.analyzeResponses = [];
            try {
                test.info().annotations.push({
                    type: 'analyze-job-not-found-retried',
                    description:
                        `Retry ${this.analyzeRetries}: GET .../transfer-to-job-cards/analyze/{jobId} → ` +
                        '404 not_found; clicked "Try again".',
                });
            } catch {
                // Outside a test context — nothing to annotate.
            }
            await this.analyzeRetryButton.click();
        }
    }

    /** How many times the last {@link tryWaitForCandidates} call clicked "Try again". */
    get analyzeRetryCount(): number {
        return this.analyzeRetries;
    }

    /**
     * The Reference cell of one time card's row. Its text is the card's
     * `reference`, which is what ties an office row back to the device record.
     */
    rowFor(timeCardCounter: number): Locator {
        return this.page.getByTestId(`v2-grid-row-${timeCardCounter}`);
    }

    /** A row located by its reference text, for when the counter is unknown. */
    rowByReference(reference: string): Locator {
        return this.page.getByRole('row', { name: reference });
    }

    /**
     * The whole row, for asserting cells other than Reference and Status —
     * Type ("Piece Out"), Employee Selection ("Barcode Badge"), Crew.
     *
     * Needed because {@link rowFor} is the *Reference cell*, not the row, so
     * matching any other column's text against it always fails.
     */
    rowCells(timeCardCounter: number): Locator {
        return this.page.getByRole('row').filter({ has: this.rowFor(timeCardCounter) });
    }

    /**
     * A cell by column index. This screen's grid is not the shared
     * WebpetDataGridComponent, hence the local helper. Prefer {@link cellByHeader}: the leading
     * select column exists only in Multi Update mode, so these indexes are mode-dependent. Column map
     * with the mode ON (subtract 1 when off):
     * 0 select · 1 add-record · 2 delete · 3 Crew · 4 Employee · 5 date · 6 time ·
     * 7 Field · 8 Job · 9 Pieces · 10 Traceability · 11 Ranch · 12 Reference ·
     * 13 Type · 14 Pay by Piece · 15 Transferred · 16 Export Identifier · 17 Run ·
     * 18 Employee Selection · 19 Status
     */
    cellAt(row: Locator, index: number): Locator {
        return row.getByRole('cell').nth(index);
    }

    private async gridHeaders(): Promise<string[]> {
        // Only the titled header row: the grid has a second row of per-column filter headers (19 more
        // columnheaders) that would otherwise shift every index.
        const titleRow = this.pageRoot.getByRole('row').filter({ has: this.page.getByRole('columnheader', { name: /^Reorder column / }) }).first();
        const headers = titleRow.getByRole('columnheader');
        await expect(headers.first()).toBeVisible({ timeout: 15_000 });
        return (await headers.allInnerTexts()).map((h) => h.replace(/^Reorder column /, '').split('\n')[0].trim());
    }

    private headerIndex(headers: string[], header: string): number {
        const index = headers.findIndex((h) => h.toLowerCase() === header.toLowerCase());
        if (index < 0) throw new Error(`Transfer grid has no '${header}' column; headers are ${JSON.stringify(headers)}`);
        return index;
    }

    /** A cell by header. Leading select/add/delete cells may have no header, so alignment is from the right. */
    async cellByHeader(row: Locator, header: string): Promise<Locator> {
        const headers = await this.gridHeaders();
        const index = this.headerIndex(headers, header);
        const cells = row.getByRole('cell');
        return cells.nth(index + (await cells.count()) - headers.length);
    }

    async readRow(reference: string): Promise<TransferRowView> {
        const row = this.rowByReference(reference).first();
        await row.waitFor({ state: 'visible', timeout: 30_000 });
        const headers = await this.gridHeaders();
        const texts = (await row.getByRole('cell').allInnerTexts()).map((t) => t.trim());
        const offset = texts.length - headers.length;
        const at = (header: string): string => texts[this.headerIndex(headers, header) + offset] ?? '';
        const status = at('Status');
        return {
            crew: at('Crew'),
            employee: at('Employee'),
            date: at('date'),
            time: at('time'),
            field: at('Field'),
            job: at('Job'),
            pieces: at('Pieces'),
            traceability: at('Traceability'),
            ranch: at('Ranch'),
            reference: at('Reference'),
            type: at('Type'),
            payByPiece: at('Pay by Piece'),
            transferred: at('Transferred'),
            run: at('Run'),
            employeeSelection: at('Employee Selection'),
            status: /\b(Ready|Blocking|Warning|Deferred)\b/.exec(status)?.[1] ?? status.split('\n')[0].trim(),
            manuallyEdited: /Manually edited/i.test(status),
        };
    }

    /** Every loaded candidate whose Type cell equals `typeText` ("Time In", "Piece Out" …). */
    async rowsOfType(typeText: string): Promise<TransferRowView[]> {
        const out: TransferRowView[] = [];
        for (const reference of await this.candidateReferences()) {
            const row = await this.readRow(reference);
            if (row.type.toLowerCase() === typeText.toLowerCase()) out.push(row);
        }
        return out;
    }

    /** The Transferred cell text of one row. */
    async rowTransferred(reference: string): Promise<string> {
        return ((await (await this.cellByHeader(this.rowByReference(reference).first(), 'Transferred')).innerText()) ?? '').trim();
    }

    async rowTime(timeCardCounter: number): Promise<Locator> {
        return this.cellByHeader(this.rowCells(timeCardCounter), 'time');
    }

    /** The open Time In panel, read field by field. `gps` is null when the module-gated field is not rendered. */
    async readTimeInPanel(): Promise<{ reference: string; dateTime: string; ranch: string; field: string; phase: string; employee: string; workCrew: string; gps: string | null }> {
        await this.timeInPanel.waitFor({ state: 'visible', timeout: 45_000 });
        // The comboboxes fetch their options after the panel renders: '' with placeholder "Loading..." is not a value.
        await expect(this.timeInPanel.locator('input[placeholder^="Loading"]'), 'the Time In panel must finish loading').toHaveCount(0, { timeout: 20_000 });
        const text = async (control: Locator) =>
            (await control.evaluate((el) => ('value' in el && el.tagName !== 'BUTTON' ? String((el as HTMLInputElement).value) : (el.textContent ?? '')).trim(), undefined, { timeout: 10_000 }));
        return {
            // The Reference input has no accessible name; its label is a sibling element, so resolve by the innermost wrapper holding that label.
            reference: await text(this.timeInPanel.locator('div').filter({ has: this.page.getByText(/^Reference$/) }).last().getByRole('textbox').first()),
            dateTime: await text(this.timeInPanel.getByRole('textbox', { name: /^Date \/ Time/ })),
            ranch: await text(this.panelRanchValue),
            field: await text(this.panelFieldValue),
            phase: await text(this.panelPhaseValue),
            employee: await text(this.panelEmployeeValue),
            workCrew: await text(this.panelWorkCrewValue),
            gps: (await this.panelGpsValue.count()) === 0 ? null : await text(this.panelGpsValue),
        };
    }

    /** Question / Response rows of the open Time Out panel. Throws by name when the panel has no Questions block. */
    async readTimeOutQuestions(): Promise<Array<{ question: string; response: string }>> {
        const panel = this.timeOutPanel;
        await panel.waitFor({ state: 'visible', timeout: 45_000 });
        const heading = panel.getByRole('heading', { name: /^Questions/ });
        if ((await heading.count()) === 0) {
            const seen = await panel.getByRole('heading').allInnerTexts();
            throw new Error(`The Time Out panel has no "Questions" heading; headings seen: ${JSON.stringify(seen)}`);
        }
        const none = panel.getByText('No questions recorded.');
        const rows = panel.getByRole('row');
        await expect(none.or(rows.first()), 'the Time Out Questions block shows neither "No questions recorded." nor an answer row').toBeVisible({ timeout: 15_000 });
        if (await none.isVisible()) return [];
        const out: Array<{ question: string; response: string }> = [];
        for (let i = 0; i < (await rows.count()); i += 1) {
            const cells = (await rows.nth(i).getByRole('cell').allInnerTexts()).map((c) => c.trim());
            if (cells.length >= 2) out.push({ question: cells[0], response: cells[1] });
        }
        return out;
    }

    async selectRowByReference(reference: string): Promise<void> {
        await this.enterMultiUpdateMode();
        const row = this.rowByReference(reference);
        await row.getByRole('checkbox').first().check();
    }

    /** Selects an already-located row (e.g. from {@link rows}) — no reference text or index needed. */
    async selectRow(row: Locator): Promise<void> {
        await this.enterMultiUpdateMode();
        await row.getByRole('checkbox').first().check();
    }

    /** Opens Multi-Edit on the currently selected rows via the "Multi Update" toolbar button. */
    async openMultiEdit(): Promise<void> {
        // Since web-pet #1522 the header "Multi Update" is the mode toggle (clicking it again clears the
        // selection); the dialog opens from the selection bar's "More actions" menu.
        await this.enterMultiUpdateMode();
        const bar = this.page.getByRole('region', { name: 'Selected rows actions' });
        await bar.getByRole('button', { name: 'More actions' }).click();
        await this.page.getByRole('menuitem', { name: /^Multi Update$/i }).click();
        await this.multiEdit.waitForOpen();
    }

    /**
     * The row's status badge — one of Ready / Blocking / Warning / Deferred.
     * The badge (`role="status"`, holding only the keyword — the cell around it
     * also says "Manually edited") lives in a different cell than the
     * `v2-grid-row-…` testid, which sits on the Reference cell. So climb from
     * that cell to its `role="row"` first, then find the badge.
     */
    rowStatus(timeCardCounter: number): Locator {
        return this.page
            .getByRole('row')
            .filter({ has: this.rowFor(timeCardCounter) })
            .getByRole('status');
    }

    /**
     * The badge's keyword alone — `Ready`, `Warning`, `Blocking` or `Deferred`.
     *
     * Reading the Status *cell* instead would return `"ReadyManually edited"` on a
     * flagged row, because the "Manually edited" flag is a sibling span in the same
     * cell. Assert that flag separately.
     */
    async rowStatusText(timeCardCounter: number): Promise<string> {
        const badge = this.rowStatus(timeCardCounter);
        await badge.waitFor({ state: 'visible', timeout: 15_000 });
        return (await badge.innerText()).trim();
    }

    /**
     * False when the server's analyze endpoint is disabled — the grid can then
     * never populate, so a missing row says nothing about the data.
     */
    async analyzeEnabled(): Promise<boolean> {
        return !(await this.analyzeError.isVisible().catch(() => false));
    }

    // ── Time In side panel ───────────────────────────────────────────

    /**
     * Open the Time In panel for one row. The panel is a click away from the
     * grid row, not a navigation, so it is asserted visible rather than waited
     * for via `goto`.
     */
    async openRow(timeCardCounter: number, panel: 'Time In' | 'Time Out' = 'Time In'): Promise<void> {
        // Click the date cell, not the Reference span: a truncated cell swaps
        // itself for a tooltip trigger on mouseenter, and the click that
        // follows the hover never reaches the row (dev build of 2026-10-14).
        await (await this.cellByHeader(this.rowCells(timeCardCounter), 'date')).click();
        // 45s, not 15s: the panel shell opens instantly but its body sits on
        // "Loading…" until the Time In detail fetch returns, and that fetch has
        // been observed taking >15s on dev staging (2026-08-21). The locator
        // requires the panel's Cancel button, which only renders after the load.
        await (panel === 'Time Out' ? this.timeOutPanel : this.timeInPanel).waitFor({ state: 'visible', timeout: 45_000 });
    }

    /** Close the panel without saving or deleting — the only exit this suite uses. */
    async cancelPanel(): Promise<void> {
        await this.panelCancelButton.click();
        await this.timeInPanel.waitFor({ state: 'hidden', timeout: 15_000 });
    }

    /**
     * A field's combobox control inside the panel, located by accessible name.
     * Dumping the live DOM showed the label text is NOT a sibling of the value —
     * `xpath=following::*[1]` landed on an empty `div.relative` wrapper instead,
     * because Ranch/Field/Phase/Employee/Work Crew are all rendered as
     * `role="combobox"` elements whose ARIA name already equals the label
     * (required fields get a trailing " *", hence the prefix match). Ranch's
     * displayed text is a real child node so `toContainText` reads it; the rest
     * are input-backed and must be asserted with `toHaveValue` at the call site.
     */
    private comboboxByLabel(label: string): Locator {
        return this.timeInPanel.getByRole('combobox', { name: new RegExp(`^${label}\\b`) });
    }

    /** Parses a "<Label> (<n>)" counter's count, e.g. {@link warningsCounter}. */
    private async counterCount(counter: Locator): Promise<number> {
        const text = (await counter.textContent()) ?? '';
        return Number(/\((\d+)\)/.exec(text)?.[1] ?? 0);
    }

    /** How many rows the top strip currently reports as Warning. */
    async warningsCount(): Promise<number> {
        return this.counterCount(this.warningsCounter);
    }

    /**
     * An issue group in the warnings/blocking breakdown, by its leading text.
     * Scoped to the `listbox` (the issues panel) and matched against the whole
     * `listitem`: the description and its "<n> affected" count are separate
     * sibling nodes, so `getByText` alone would resolve to the description-only
     * leaf and lose the count.
     */
    issueGroupByText(leadingText: string): Locator {
        return this.issuesRegion
            .getByRole('listitem')
            .filter({ hasText: new RegExp(`^${leadingText}`) });
    }

    /**
     * The panel only auto-expands when a blocking issue exists; a warnings-only
     * day leaves it collapsed, and role queries don't see collapsed content.
     */
    private async expandIssuesPanel(): Promise<void> {
        // One toggle whose name flips between "Expand…" and "Collapse…".
        const toggle = this.issuesRegion.getByRole('button', { name: /(expand|collapse) issues panel/i });
        if ((await toggle.getAttribute('aria-expanded').catch(() => null)) === 'false') {
            // At the default viewport the collapsed header sits under the grid's
            // totals strip, which intercepts the pointer — a click retried until
            // the test timed out (2026-09-07). Activate it as a keyboard user
            // would, then wait on the state the group assertions depend on.
            await toggle.focus();
            await this.page.keyboard.press('Enter');
            await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 10_000 });
        }
    }

    /** The "affected" row count shown next to an issue group. */
    async issueGroupAffectedCount(leadingText: string): Promise<number> {
        await this.expandIssuesPanel();
        const group = this.issueGroupByText(leadingText);
        await group.waitFor({ state: 'visible', timeout: 15_000 });
        const text = (await group.textContent()) ?? '';
        const match = /affected\D*(\d+)|(\d+)\D*affected/i.exec(text);
        return Number(match?.[1] ?? match?.[2] ?? 0);
    }

    /**
     * Every issue group's text. {@link issueGroupByText} can only find a group
     * whose name you already know, so proving a whole class of issue is ABSENT
     * (B10: no meal/lunch/break group) needs the full list instead.
     */
    async issueGroupTexts(): Promise<string[]> {
        await this.expandIssuesPanel();
        return this.issuesRegion.getByRole('listitem').allTextContents();
    }

    // ── Running the transfer (D4/D6) ────────────────────────────────
    //
    // Everything below commits real job cards. The screen's own selection model is the danger: the
    // header checkbox is "Select all rows" ACROSS the filter, not the visible rows, which is the
    // shape of the September 2026 incident that wiped ~9.5k dev job cards with no restore route.
    // Nothing here ever touches it, and this page object exposes no delete of any kind.

    /** The header "Select all rows" checkbox — located only so a caller can assert it is untouched. */
    get selectAllRowsCheckbox(): Locator {
        return this.page.getByRole('checkbox', { name: 'Select all rows' });
    }

    get analyzeCandidatesButton(): Locator {
        return this.page.getByRole('button', { name: /Analyze Transfer Candidates/i }).first();
    }

    /**
     * The commit button, scoped to the page — the left navigation carries an item of the same name,
     * and an unscoped match lands on that instead of the toolbar. Its label also tracks the screen:
     * "Transfer to Job Cards" with nothing ticked (disabled by design), gaining the ready count once
     * rows are checked, e.g. "Transfer to Job Cards 4".
     */
    get transferButton(): Locator {
        return this.pageRoot.getByRole('button', { name: /^Transfer to Job Cards(\s|$)/i }).last();
    }


    /**
     * Scope the screen to a single day through the calendar's day cell. The segment inputs commit
     * nothing for a non-today date, so the chip is asserted at both ends — a one-ended match would
     * also pass on a stale multi-day range that merely contains the day.
     */
    async scopeToDay(day: string): Promise<void> {
        const [year, month, date] = day.split('-');
        await this.applyDateRange(new Date(Number(year), Number(month) - 1, Number(date)));
        const end = `${month}/${date}/${year}`;
        await expect(this.dateRangeFilter, `the date scope must read ${end} – ${end}`).toContainText(
            new RegExp(`${end}\\s*[–-]\\s*${end}`),
            { timeout: 20_000 },
        );
    }

    /** A multi-day scope: two day-cell clicks, read back before Apply, the chip asserted at both ends. */
    async scopeToRange(from: string, to: string): Promise<void> {
        await this.dateRangeFilter.click();
        const popup = this.page.getByRole('dialog');
        await popup.waitFor({ state: 'visible', timeout: 10_000 });
        await pickRangeInPopup(popup, from, to);
        await popup.getByRole('button', { name: /^apply$/i }).click();
        await expect(this.dateRangeFilter, `the date scope must read ${usDate(from)} – ${usDate(to)}`).toContainText(
            new RegExp(`${usDate(from)}\\s*[–-]\\s*${usDate(to)}`),
            { timeout: 20_000 },
        );
    }

    /**
     * Run the analyze and wait for the grid to settle. The click returns immediately while the
     * candidates load, so reading the rows straight afterwards reports an empty screen rather than
     * an unfinished one — and an empty screen is indistinguishable from "nothing to transfer".
     */
    async analyzeCandidates(opts: { expected?: number } = {}): Promise<{ posted: boolean; crewIds: unknown[] }> {
        await expect(this.analyzeCandidatesButton).toBeEnabled({ timeout: 20_000 });
        // The app answers an analyze of the scope it analyzed under 30 s ago from its query cache (web-pet
        // staleTime 30_000) and sends nothing, so "no POST" is a normal outcome, not something to wait out.
        let sent: Request | null = null;
        const onRequest = (r: Request): void => {
            if (r.method() === 'POST' && /\/transfer-to-job-cards\/analyze$/.test(new URL(r.url()).pathname)) sent = r;
        };
        this.page.on('request', onRequest);
        this.watchAnalyzeResponses();
        try {
            await this.analyzeCandidatesButton.click();
            const wanted = opts.expected ?? 1;
            const retryUntil = Date.now() + 90_000;
            const seen: { state: 'loaded' | 'retry' | 'loading' } = { state: 'loading' };
            const state = async (): Promise<'loaded' | 'retry' | 'loading'> => {
                if ((await this.candidateReferences()).length >= wanted) seen.state = 'loaded';
                else seen.state = (await this.analyzeRetryButton.isVisible().catch(() => false)) ? 'retry' : 'loading';
                return seen.state;
            };
            for (;;) {
                const settled = await expect
                    .poll(state, { timeout: 90_000 })
                    .not.toBe('loading')
                    .then(() => true, () => false);
                const outcome = settled ? seen.state : 'timeout';
                if (outcome === 'loaded') break;
                if (outcome === 'retry' && Date.now() < retryUntil && (await this.retryLostAnalyze())) continue;
                const loaded = (await this.candidateReferences()).length;
                const lost = this.analyzeSaw404 || outcome === 'retry';
                throw new Error(
                    `analyze loaded ${loaded} of ${wanted} transfer candidate(s) — ` +
                        (lost
                            ? `analyze job lost (GET …/analyze/{jobId} 404 not_found or "Try again" shown; ${this.analyzeRetries} retry click(s))`
                            : 'the expected time cards are not on the Transfer screen (already transferred by another run, or not created)'),
                );
            }
            const request = sent as Request | null;
            const body = (request?.postDataJSON() ?? {}) as { crewIds?: unknown[] };
            return { posted: request !== null, crewIds: body.crewIds ?? [] };
        } finally {
            this.page.off('request', onRequest);
            this.detachAnalyzeResponseListener();
        }
    }

    /**
     * The app restarts a lost analyze job three times on its own, then parks on "Try again". Run 41399650394
     * (D5): every job in a ~2 min window 404'd 1.6 s after its POST, and the retry 2 min later loaded first time.
     * As in waitForCandidatesResult, Try again is clicked on that exact 404 signature only, at most 5 times.
     */
    private async retryLostAnalyze(): Promise<boolean> {
        if (!this.analyzeSaw404 || this.analyzeRetries >= 5) return false;
        this.analyzeRetries += 1;
        this.analyzeSaw404 = false;
        this.analyzeResponses = [];
        test.info().annotations.push({
            type: 'analyze-job-not-found-retried',
            description: `Retry ${this.analyzeRetries}: GET .../transfer-to-job-cards/analyze/{jobId} → 404 not_found; clicked "Try again".`,
        });
        await this.analyzeRetryButton.click();
        return true;
    }

    /**
     * Analyze again without expecting candidates. analyzeCandidates polls for at least N rows, which a fully
     * transferred crew can never satisfy; this waits for the screen's own analyze job to settle instead.
     */
    async reanalyze(): Promise<void> {
        await expect(this.analyzeCandidatesButton).toBeEnabled({ timeout: 20_000 });
        const posted = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /\/transfer-to-job-cards\/analyze$/.test(new URL(r.url()).pathname),
            { timeout: 30_000 },
        );
        posted.catch(() => undefined);
        // A 202 hands back a job the screen then polls; a 200 is already settled, so this may never fire.
        const settled = this.page.waitForResponse(
            async (r) => {
                if (r.request().method() !== 'GET' || !/\/transfer-to-job-cards\/analyze\/[^/]+$/.test(new URL(r.url()).pathname)) return false;
                const state = String(((await r.json().catch(() => ({}))) as { status?: string }).status ?? '');
                return !['pending', 'running', 'queued'].includes(state);
            },
            { timeout: 60_000 },
        );
        settled.catch(() => undefined);
        await this.analyzeCandidatesButton.click();
        // Returning to the screen after a transfer (same session, same scope) has served the pre-transfer grid
        // and sent no analyze at all (2026-10-22). That is a product finding, so it fails by name, not by timeout.
        const response = await posted.catch(() => null);
        expect(response, 'Analyze Transfer Candidates sent no POST transfer-to-job-cards/analyze (stale candidate grid)').not.toBeNull();
        expect(response!.ok(), `POST transfer-to-job-cards/analyze answered ${response!.status()}`).toBe(true);
        if (response!.status() === 202) await settled;
        // Absent when nothing is left to list, so a miss is not an error.
        await this.gridCaption.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
    }

    /** Tick one candidate row by its Reference — never the header select-all. */
    async selectCandidate(reference: string): Promise<void> {
        await this.enterMultiUpdateMode();
        const checkbox = this.page.getByRole('checkbox', { name: `Select ${reference}` });
        await checkbox.waitFor({ state: 'visible', timeout: 30_000 });
        await checkbox.check();
    }

    /** Every candidate Reference the analyze loaded, so a caller can prove the scope is its own. */
    async candidateReferences(): Promise<string[]> {
        // Read the Reference cells, not the row checkboxes: those exist only while Multi Update mode is on.
        const names = await this.page.locator('[data-testid^="v2-grid-row-"]').evaluateAll((nodes) =>
            nodes
                .filter((n) => /^v2-grid-row-\d+$/.test(n.getAttribute('data-testid') ?? ''))
                .map((n) => (n.textContent ?? '').trim())
                .filter((n) => n !== ''),
        );
        return [...new Set(names)];
    }

    /**
     * Row checkboxes (and select-all) render only while the page-level Multi Update toggle is on;
     * toggling it off clears the selection, so only ever click when it is not already pressed.
     */
    async enterMultiUpdateMode(): Promise<void> {
        const toggle = this.page.getByTestId('v2-toolbar-multi-update');
        await toggle.waitFor({ state: 'visible', timeout: 30_000 });
        await this.clearGridObstructions();
        if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    }

    /**
     * Another worker's transfer on the same tenant raises "The underlying records changed elsewhere" with a
     * Re-analyze button; the banner plus the filter panel can squeeze the grid body to 0 px so every tick is
     * intercepted by the header (D10, 2026-10-29). Do what a user does: re-analyze, then fold the top section.
     */
    private async clearGridObstructions(): Promise<void> {
        const banner = this.page.getByText(/The underlying records changed elsewhere/);
        if (await banner.isVisible()) {
            const reanalyze = this.page.getByRole('button', { name: 'Re-analyze', exact: true });
            await reanalyze.click();
            await expect(banner).toBeHidden({ timeout: 60_000 });
            await this.gridCaption.waitFor({ state: 'visible', timeout: 90_000 });
        }
        const body = this.page.locator('[role="rowgroup"].overflow-auto').first();
        const height = await body.evaluate((el) => el.clientHeight).catch(() => -1);
        if (height === 0) {
            const hide = this.page.getByRole('button', { name: 'Hide top section' });
            if (await hide.isVisible()) await hide.click();
            await expect
                .poll(() => body.evaluate((el) => el.clientHeight).catch(() => 0), {
                    message: 'the candidate grid body still has no height after hiding the top section',
                })
                .toBeGreaterThan(0);
        }
    }

    /** "We never used select-all": holds when the header checkbox is absent (mode off) or unticked. */
    async expectSelectAllUntouched(message: string): Promise<void> {
        const box = this.selectAllRowsCheckbox;
        if ((await box.count()) > 0) await expect(box, message).not.toBeChecked();
    }

    /**
     * Commit the transfer for the ticked rows. The confirm step reports any warning issues before
     * it proceeds; warnings are expected on a piece day (`warn.zero_rate`) and do not block.
     */
    async runTransfer(): Promise<{ jobId: string | null; crewIds: unknown[] }> {
        const commit = this.transferButton;
        try {
            await expect(commit).toBeEnabled({ timeout: 30_000 });
        } catch {
            // A day can be fully "eligible" and still have nothing to plan — a time-in with no
            // Phase (job) analyses as eligible but plannable 0, and the button then sits disabled
            // with nothing on screen saying why. Report the pills, which is where the app says it.
            const ready = (await this.page.getByTestId('v2-progress-pill-ready').innerText().catch(() => '?')).replace(/\s+/g, ' ');
            const blocking = (await this.page.getByTestId('v2-progress-pill-blocking').innerText().catch(() => '?')).replace(/\s+/g, ' ');
            const warnings = (await this.page.getByTestId('v2-progress-pill-warnings').innerText().catch(() => '?')).replace(/\s+/g, ' ');
            throw new Error(
                `Transfer never enabled for the ticked rows — ${ready}, ${blocking}, ${warnings}. ` +
                    'A "0 Ready" here usually means the time-ins carry no Phase (job), which analyses as eligible but plannable 0.',
            );
        }
        const executed = this.page
            .waitForResponse((r) => r.request().method() === 'POST' && /\/transfer-to-job-cards\/execute$/.test(new URL(r.url()).pathname), { timeout: 30_000 })
            .catch(() => null);
        await commit.click();
        const confirm = this.page.getByRole('alertdialog').or(this.page.getByRole('dialog')).first();
        if (await confirm.isVisible({ timeout: 5_000 }).catch(() => false)) {
            await confirm.getByRole('button', { name: /^Transfer$/i }).first().click();
        }
        const response = await executed;
        const body = (await response?.json().catch(() => null)) as { jobId?: string } | null;
        const sent = (response?.request().postDataJSON() ?? {}) as { crewIds?: unknown[] };
        return { jobId: body?.jobId ?? null, crewIds: sent.crewIds ?? [] };
    }

    // ── Blocking-exception correction (D3) — pills, banner, Time In panel edit ──

    /** Leading integer of a progress pill ("6\nBlocking"). NaN until it renders, so a poll keeps waiting. */
    private async pillCount(testId: string): Promise<number> {
        const text = await this.page.getByTestId(testId).innerText({ timeout: 1_000 }).catch(() => '');
        return Number((/^\s*([\d,]+)/.exec(text)?.[1] ?? 'NaN').replace(/,/g, ''));
    }

    async blockingCount(): Promise<number> {
        return this.pillCount('v2-progress-pill-blocking');
    }

    async readyCount(): Promise<number> {
        return this.pillCount('v2-progress-pill-ready');
    }

    get blockingBanner(): Locator {
        return this.pageRoot.getByText(/^\d+ blocking issues? to resolve before transfer$/);
    }

    blockingBannerFor(count: number): Locator {
        return this.pageRoot.getByText(new RegExp(`^${count} blocking issues? to resolve before transfer$`));
    }

    async rowManuallyEdited(timeCardCounter: number): Promise<Locator> {
        return (await this.cellByHeader(this.rowCells(timeCardCounter), 'Status')).getByText('Manually edited', { exact: true });
    }

    async rowField(timeCardCounter: number): Promise<Locator> {
        return this.cellByHeader(this.rowCells(timeCardCounter), 'Field');
    }

    async rowJob(timeCardCounter: number): Promise<Locator> {
        return this.cellByHeader(this.rowCells(timeCardCounter), 'Job');
    }

    async rowRanch(timeCardCounter: number): Promise<Locator> {
        return this.cellByHeader(this.rowCells(timeCardCounter), 'Ranch');
    }

    get panelSaveButton(): Locator {
        return this.timeInPanel.getByRole('button', { name: /^Save$/ });
    }

    get panelErrorChip(): Locator {
        return this.timeInPanel.getByText(/^\d+ errors?$/);
    }

    // A pristine panel with no Ranch shows this hint under a disabled Field; "This field is required" only appears once touched.
    get panelFieldNeedsRanch(): Locator {
        return this.timeInPanel.getByText('Select a Ranch first', { exact: true });
    }

    get savedToast(): Locator {
        return this.page.getByText('Time In record saved', { exact: true });
    }

    /**
     * Ranch is a button combobox; Field and Phase are input autocompletes. Their options render in a
     * portal outside the panel, and Field stays disabled until a Ranch is set.
     */
    async pickOption(scope: Locator, label: 'Ranch' | 'Field' | 'Phase', name: string): Promise<void> {
        const option = this.page.getByRole('option', { name, exact: true });
        const control = scope.getByRole('combobox', { name: new RegExp(`^${label}\\b`) });
        if (label === 'Ranch') {
            await control.click({ timeout: 15_000 });
            await option.click({ timeout: 15_000 });
            await expect(control).toContainText(name);
            return;
        }
        await expect(control).toBeEnabled({ timeout: 15_000 });
        await control.click({ timeout: 15_000 });
        // The input stops resolving by its label while the list is open, so narrow by keyboard, not fill().
        const listed = await option.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
        if (!listed) await this.page.keyboard.type(name);
        await option.click({ timeout: 15_000 });
        await expect(control).toHaveValue(name);
    }

    async pickPanelOption(label: 'Ranch' | 'Field' | 'Phase', name: string): Promise<void> {
        await this.pickOption(this.timeInPanel, label, name);
    }

    async correctTimeIn(values: { ranch: string; field: string; phase: string }): Promise<void> {
        await this.pickPanelOption('Ranch', values.ranch);
        await this.pickPanelOption('Field', values.field);
        await this.pickPanelOption('Phase', values.phase);
    }

    // Click only: the toast is short-lived, so the caller asserts it straight away.
    async savePanel(): Promise<void> {
        await this.panelSaveButton.click();
    }

    async waitForReanalyze(panel: Locator = this.timeInPanel): Promise<void> {
        // The button re-enables on a failed analyze too, leaving the pre-save rows on screen (D5 locally, 2026-11-02).
        this.watchAnalyzeResponses();
        try {
            await panel.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined);
            const retryUntil = Date.now() + 90_000;
            for (;;) {
                await this.page.getByRole('button', { name: /Analyzing/i }).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
                await expect(this.analyzeCandidatesButton).toBeEnabled({ timeout: 90_000 });
                if (!(await this.analyzeRetryButton.isVisible().catch(() => false))) return;
                if (Date.now() >= retryUntil || !(await this.retryLostAnalyze())) return;
            }
        } finally {
            this.detachAnalyzeResponseListener();
        }
    }

    // ── Reverse and redo (D5) — Add Time-In / Add Time-Out dialogs, Time Out panel, toasts ──

    addRecordDialog(kind: 'timeIn' | 'timeOut'): Locator {
        return this.page.getByRole('dialog', { name: kind === 'timeIn' ? 'Add Time-In' : 'Add Time-Out' });
    }

    async openAddRecord(kind: 'timeIn' | 'timeOut'): Promise<void> {
        // The previous Save closes its dialog asynchronously; a second trigger click under the overlay is lost.
        await expect(this.page.getByRole('dialog', { name: /^Add Time-(In|Out)$/ })).toBeHidden({ timeout: 30_000 });
        await this.newRecordButton.click({ timeout: 15_000 });
        await this.page.getByTestId(`v2-add-record-item-${kind}`).click({ timeout: 15_000 });
        await this.addRecordDialog(kind).waitFor({ state: 'visible', timeout: 15_000 });
    }

    /** Options are labelled "<exportIdentifier> : NAME", so the match is on the tail. */
    private async pickEmployee(dialog: Locator, employee: string): Promise<void> {
        await dialog.getByRole('combobox', { name: 'Employee *' }).click({ timeout: 15_000 });
        await this.page.keyboard.type(employee);
        const tail = employee.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        await this.page.getByRole('option', { name: new RegExp(`: ${tail}$`) }).click({ timeout: 15_000 });
    }

    private async saveAddRecord(dialog: Locator): Promise<void> {
        const save = dialog.getByRole('button', { name: 'Save', exact: true });
        await expect(save).toBeEnabled({ timeout: 15_000 });
        await save.click();
    }

    /** Work Crew auto-fills from the employee's home crew when it has one; pick it only on a mismatch. */
    private async pickWorkCrew(dialog: Locator, crew: string): Promise<void> {
        const crewInput = dialog.getByRole('combobox', { name: /^Work Crew\b/ });
        const prefilled = await expect(crewInput).toHaveValue(crew, { timeout: 10_000 }).then(() => true, () => false);
        if (!prefilled) {
            await crewInput.click({ timeout: 15_000 });
            // A home crew that differs from `crew` is already in the box; typing after it garbles the search.
            await crewInput.fill('');
            await this.page.keyboard.type(crew);
            await this.page.getByRole('option', { name: crew }).first().click({ timeout: 15_000 });
            await expect(crewInput).toHaveValue(crew);
        }
    }

    /** Fill and Save the open Add Time-In dialog. */
    async addTimeIn(values: { day: string; time: string; employee: string; crew: string; ranch: string; field: string; phase: string }): Promise<void> {
        const dialog = this.addRecordDialog('timeIn');
        await dialog.getByRole('textbox', { name: 'Date / Time *' }).fill(`${values.day}T${values.time}`);
        await this.pickEmployee(dialog, values.employee);
        await this.pickWorkCrew(dialog, values.crew);
        await this.pickOption(dialog, 'Ranch', values.ranch);
        await this.pickOption(dialog, 'Field', values.field);
        await this.pickOption(dialog, 'Phase', values.phase);
        await this.saveAddRecord(dialog);
    }

    /** Fill and Save the open Add Time-Out dialog. Date / Time and Employee are required; the Work Crew is set so a crew-scoped Transfer sees the card. */
    async addTimeOut(values: { day: string; time: string; employee: string; crew: string }): Promise<void> {
        const dialog = this.addRecordDialog('timeOut');
        await dialog.getByRole('textbox', { name: 'Date / Time *' }).fill(`${values.day}T${values.time}`);
        await this.pickEmployee(dialog, values.employee);
        await this.pickWorkCrew(dialog, values.crew);
        await this.saveAddRecord(dialog);
    }

    async setPanelDateTime(panel: Locator, day: string, hhmm: string): Promise<void> {
        await panel.getByRole('textbox', { name: /^Date \/ Time/ }).fill(`${day}T${hhmm}`);
    }

    async saveTimeOutPanel(): Promise<void> {
        await this.timeOutPanel.getByRole('button', { name: /^Save$/ }).click();
    }

    recordToast(text: string): Locator {
        return this.page.getByText(text, { exact: true });
    }

    transferCompleteToast(jobCards: number, timeCards: number): Locator {
        return this.page.getByText(`Transfer complete — ${jobCards} job card${jobCards === 1 ? '' : 's'} written, ${timeCards} time cards transferred.`);
    }

    get reversedToast(): Locator {
        return this.page.getByText('Transfer run reversed', { exact: true });
    }

    // ── Crew piece-out distribution (D9) — readers, the Work Crew filter and the Job Cards tab ──

    /** The pieces total in the Time Cards totals strip. NaN until the strip renders, so a poll keeps waiting. */
    async piecesTotal(): Promise<number> {
        const text = (await this.page.getByTestId('timecards-totals-strip-issues').textContent()) ?? '';
        return Number((/Pieces([\d.,]+)/.exec(text)?.[1] ?? 'NaN').replace(/,/g, ''));
    }

    /** Totals line under the Time Cards grid. Loading: aria-busy="true"; failed: data-degraded="true". */
    get totalsStrip(): Locator {
        return this.page.getByTestId('timecards-totals-strip-issues');
    }

    get totalsCaption(): Locator {
        return this.totalsStrip.getByText(/^Includes \d+ Time Cards? of \d+ initial selection$/);
    }

    /** "Totals couldn't be loaded." — rendered only when the totals query failed (WEBPET-3064). */
    get totalsUnavailable(): Locator {
        return this.page.getByTestId('timecards-totals-unavailable');
    }

    /** The value span after a label span (Gross/Net/Meals/Pieces/Employees). */
    totalsValue(label: string): Locator {
        return this.totalsStrip.getByText(label, { exact: true }).locator('xpath=following-sibling::span[1]');
    }

    /** NaN until rendered, so a poll keeps waiting. */
    async totalsNumber(label: string): Promise<number> {
        return Number(((await this.totalsValue(label).textContent()) ?? '').replace(/,/g, ''));
    }

    async rowPieces(reference: string): Promise<Locator> {
        return this.cellByHeader(this.rowByReference(reference), 'Pieces');
    }

    async rowEmployee(reference: string): Promise<Locator> {
        return this.cellByHeader(this.rowByReference(reference), 'Employee');
    }

    async rowType(reference: string): Promise<Locator> {
        return this.cellByHeader(this.rowByReference(reference), 'Type');
    }

    async rowPayByPiece(reference: string): Promise<Locator> {
        return this.cellByHeader(this.rowByReference(reference), 'Pay by Piece');
    }

    /** References whose Employee cell is `—` — a crew piece-out carries no employee by design. */
    async crewPieceOutRows(): Promise<string[]> {
        const out: string[] = [];
        for (const reference of await this.candidateReferences()) {
            const text = ((await (await this.rowEmployee(reference)).textContent()) ?? '').trim();
            if (text === '—') out.push(reference);
        }
        return out;
    }

    private get crewFilter(): Locator {
        return this.page.getByTestId('transfer-grid-filter-crews');
    }

    private get crewSearch(): Locator {
        return this.page.getByRole('searchbox', { name: /Search work crew/i });
    }

    /**
     * Work Crew column filter. Its options come from the loaded rows, so it is empty until the
     * analyze has finished. Re-filters the rows, the checkboxes and the totals strip.
     */
    async filterByCrew(crewName: string): Promise<void> {
        await this.crewFilter.click();
        await this.crewSearch.fill(crewName);
        await this.page.getByRole('button', { name: crewName, exact: true }).click();
        await expect(this.page.getByRole('button', { name: /^Clear \(\d+\)$/ })).toBeVisible({ timeout: 10_000 });
        await this.page.keyboard.press('Escape');
        await expect(this.crewSearch).toBeHidden({ timeout: 10_000 });
    }

    /**
     * Server-side scope: "Search by ▸ Time Card Crew" fills crewIds on analyze and execute. The Work Crew
     * grid filter is display-only, so a transfer commits every analyzed candidate, other runs' included.
     */
    /** The "Search by ▸ Time Card Crew" chip that proves the analyze scope on screen. */
    timeCardCrewChip(name: string): Locator {
        return this.page.getByTestId('transfer-search-criterion').getByRole('button', { name: `Remove ${name}`, exact: true });
    }

    async scopeToTimeCardCrew(name: string): Promise<void> {
        const picker = this.page.getByTestId('transfer-filter-crews');
        const chip = (): Locator => this.timeCardCrewChip(name);

        if (await chip().isVisible()) return;
        await this.page.getByTestId('transfer-search-by-trigger').click();
        await this.page.getByTestId('transfer-search-by-crew').click();
        await expect(picker).toBeVisible({ timeout: 10_000 });
        await picker.click();
        const dialog = this.page.getByRole('dialog');
        await dialog.getByRole('button', { name: name, exact: true }).click();
        await this.page.keyboard.press('Escape');
        await expect(dialog).toBeHidden({ timeout: 10_000 });
        await expect(chip(), `Time Card Crew scope shows "${name}"`).toBeVisible({ timeout: 10_000 });
    }

    async clearCrewFilter(): Promise<void> {
        await this.crewFilter.click();
        await this.page.getByRole('button', { name: /^Clear \(\d+\)$/ }).click();
        await this.page.keyboard.press('Escape');
        await expect(this.crewSearch).toBeHidden({ timeout: 10_000 });
    }

    /** The Job Cards tab's grid — the pre-commit preview of the cards this transfer would write. */
    get previewGrid(): Locator {
        return this.pageRoot.getByTestId('data-grid');
    }

    async openJobCardsTab(): Promise<void> {
        await this.jobCardsTab.click();
        await expect(this.previewGrid).toBeVisible({ timeout: 30_000 });
        // The grid shows its header and a loading status before the data rows render.
        await expect(this.previewGrid.getByRole('row', { name: /^Row \d+$/ }).first()).toBeVisible({ timeout: 30_000 });
    }

    async openTimeCardsTab(): Promise<void> {
        await this.timeCardsTab.click();
        await expect(this.grid).toBeVisible({ timeout: 30_000 });
    }

    /** Preview rows are labelled only `Row N`, so a participant's row is found by employee text. Cols: 1 Employee, 12 Number of Pieces. */
    async previewRows(): Promise<Array<{ employee: string; pieces: number }>> {
        const rows = this.previewGrid.getByRole('row', { name: /^Row \d+$/ });
        const count = await rows.count();
        const out: Array<{ employee: string; pieces: number }> = [];
        for (let i = 0; i < count; i += 1) {
            const cells = rows.nth(i).getByRole('cell');
            const employee = ((await cells.nth(1).textContent()) ?? '').trim();
            const pieces = Number(((await cells.nth(12).textContent()) ?? '').replace(/,/g, ''));
            out.push({ employee, pieces });
        }
        return out;
    }

    /** Column positions resolved from the header row by name. Shared so the readers cannot drift. */
    private async previewColumnIndexes(names: readonly string[]): Promise<Record<string, number>> {
        const headers = (await this.previewGrid.getByRole('columnheader').allInnerTexts()).map((h) => h.trim());
        const column = (name: string): number => {
            const index = headers.findIndex((h) => new RegExp(`^${name}\\b`).test(h));
            if (index < 0) throw new Error(`Job Cards preview has no '${name}' column; headers are ${JSON.stringify(headers)}`);
            return index;
        };
        return Object.fromEntries(names.map((name) => [name, column(name)]));
    }

    /**
     * The Job Cards tab's overtime columns (E2). An `HH:MM` cell throws by name: the number-stripping
     * parse would otherwise turn "11:30" into 1130 and assert against a plausible wrong number.
     */
    async previewOvertimeBuckets(): Promise<PreviewOvertimeRow[]> {
        const at = await this.previewColumnIndexes(['Job', 'Gross Time', 'Meal', 'Net Time', 'Regular Hours', 'Overtime', 'Double Time', 'Amount']);
        const rows = this.previewGrid.getByRole('row', { name: /^Row \d+$/ });
        const count = await rows.count();
        const out: PreviewOvertimeRow[] = [];
        for (let i = 0; i < count; i += 1) {
            const cells = rows.nth(i).getByRole('cell');
            const text = async (name: string) => ((await cells.nth(at[name]).textContent()) ?? '').trim();
            const num = async (name: string): Promise<number> => {
                const raw = await text(name);
                if (/^\d+:\d{2}$/.test(raw)) {
                    throw new Error(`Job Cards preview renders '${name}' as HH:MM ("${raw}"), not a decimal; the E2 plan assumes decimal hours`);
                }
                const digits = raw.replace(/[^0-9.-]/g, '');
                return digits === '' ? NaN : Number(digits);
            };
            out.push({
                job: await text('Job'),
                grossTime: await num('Gross Time'),
                meal: await num('Meal'),
                netTime: await num('Net Time'),
                regularHours: await num('Regular Hours'),
                overtime: await num('Overtime'),
                doubleTime: await num('Double Time'),
                amount: await num('Amount'),
            });
        }
        return out;
    }

    /**
     * The Job Cards tab's rows in chronological order (D10). Column positions are resolved from the
     * header row by name rather than hard-coded: a silent shift would read the wrong cell and turn
     * into a wrong green.
     */
    async previewSegments(): Promise<PreviewSegment[]> {
        const idx = await this.previewColumnIndexes(['Job', 'Date Time In', 'Date Time Out', 'Gross Time', 'Net Time', 'Amount']);
        const at = { job: idx['Job'], timeIn: idx['Date Time In'], timeOut: idx['Date Time Out'], gross: idx['Gross Time'], net: idx['Net Time'], amount: idx['Amount'] };

        const rows = this.previewGrid.getByRole('row', { name: /^Row \d+$/ });
        const count = await rows.count();
        const out: PreviewSegment[] = [];
        for (let i = 0; i < count; i += 1) {
            const cells = rows.nth(i).getByRole('cell');
            const text = async (index: number) => ((await cells.nth(index).textContent()) ?? '').trim();
            const amount = (await text(at.amount)).replace(/[^0-9.-]/g, '');
            out.push({
                job: await text(at.job),
                timeIn: await text(at.timeIn),
                timeOut: await text(at.timeOut),
                grossTime: await text(at.gross),
                netTime: await text(at.net),
                amount: amount === '' ? NaN : Number(amount),
            });
        }
        return out;
    }

    /** Totals bar of the preview — six-decimal pieces, so parsed with `Number()`. NaN until it renders. */
    async previewTotals(): Promise<{ pieces: number; jobCards: number; employees: number }> {
        const text = (await this.page.getByTestId('jobcards-totals-bar').textContent()) ?? '';
        const read = (pattern: RegExp) => Number((pattern.exec(text)?.[1] ?? 'NaN').replace(/,/g, ''));
        return {
            pieces: read(/Pieces\s*([\d.,]+)/),
            jobCards: read(/Job Cards\s*(\d+)/),
            employees: read(/Employees\s*(\d+)/),
        };
    }

    // ── Client feedback: time window, report, layout (WEBPET-3183/3431/3829/3830/3835) ──

    /** The user's F5. */
    async reload(): Promise<void> {
        await this.page.reload();
        await this.pageRoot.waitFor({ state: 'visible', timeout: 30_000 });
    }

    async setEndTime(hhmm: string): Promise<void> {
        await this.endTimeInput.fill(hhmm);
        await expect(this.endTimeInput).toHaveValue(hhmm);
    }

    /** The value dies with the test's context; putting the default back keeps a reused browser clean. */
    async withEndTime<T>(hhmm: string, body: () => Promise<T>): Promise<T> {
        await this.setEndTime(hhmm);
        try {
            return await body();
        } finally {
            await this.setEndTime(TRANSFER_END_OF_DAY).catch(() => undefined);
        }
    }

    /** The filter-row controls of one column; empty when the column has no filter. Needs the grid headers, so analyze first. */
    async gridFilterControls(header: string): Promise<Locator> {
        const headers = await this.gridHeaders();
        const filterRow = this.grid.getByRole('row').filter({ has: this.page.getByRole('textbox', { name: 'Filter…' }) }).first();
        return filterRow.getByRole('columnheader').nth(this.headerIndex(headers, header)).locator('input, button, [role="combobox"]');
    }

    private async boxOf(locator: Locator, name: string): Promise<Box> {
        const box = await locator.boundingBox();
        if (!box) throw new Error(`Transfer to Job Cards: ${name} is not rendered`);
        return box;
    }

    async dateControlBoxes(): Promise<{ dates: Box; searchBy: Box }> {
        return { dates: await this.boxOf(this.dateRangeFilter, 'the Dates control'), searchBy: await this.boxOf(this.searchByControl, 'the Search by control') };
    }

    async layoutBoxes(): Promise<{ grid: Box; issues: Box; totals: Box }> {
        return {
            grid: await this.boxOf(this.grid, 'the grid'),
            issues: await this.boxOf(this.issuesPanel, 'the Issues panel'),
            totals: await this.boxOf(this.totalsStrip, 'the totals line'),
        };
    }

    async reportCornerBoxes(): Promise<{ dialog: Box; close: Box }> {
        return { dialog: await this.boxOf(this.report.dialog, 'the Report dialog'), close: await this.boxOf(this.report.closeX, 'the Report close X') };
    }

    /** The Date cell of every loaded candidate, in grid order. */
    async candidateDates(): Promise<string[]> {
        const out: string[] = [];
        for (const reference of await this.candidateReferences()) out.push((await this.readRow(reference)).date);
        return out;
    }

    usDay(day: string): string {
        return usDate(day);
    }

    // ── Client feedback: grid filters, status pills, Single select, issue click (WEBPET-3433/3834/2986/3831) ──

    /** The Time Cards grid by its analyzed caption ("Includes N Time Cards of N initial selection"); display filters do not change that name. */
    get cardGrid(): DataGridComponent {
        return new DataGridComponent(this.page, /^Includes \d+ Time Cards? of \d+ initial selection$/, 'Time Card');
    }

    analyzedGrid(caption: string): Locator {
        return this.page.getByRole('grid', { name: caption, exact: true });
    }

    statusPill(status: StatusPill): Locator {
        return this.page.getByTestId(`v2-top-strip-${status}-button`);
    }

    async clickStatusPill(status: StatusPill): Promise<void> {
        await this.statusPill(status).click();
    }

    /** Status badge keyword of every rendered grid row; scoped to rows because the issue detail has its own badge. */
    async visibleStatuses(): Promise<string[]> {
        const texts = await this.page.getByRole('row').locator('[data-testid^="v2-status-pill-"]').allInnerTexts();
        return texts.map((t) => t.trim());
    }

    get singleSelectSwitch(): Locator {
        return this.page.getByTestId('transfer-grid-filter-single');
    }

    async setSingleSelect(on: boolean): Promise<void> {
        const toggle = this.singleSelectSwitch;
        await toggle.waitFor({ state: 'visible', timeout: 30_000 });
        if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click();
        await expect(toggle).toHaveAttribute('aria-checked', String(on));
    }

    gridFilterTrigger(kind: GridFilterKind): Locator {
        return this.page.getByTestId(GRID_FILTER_TESTID[kind]);
    }

    /** Chips text: "All work crews" / "All employees" / the picked label. */
    gridFilterValue(kind: GridFilterKind): Locator {
        return this.page.getByTestId(`${GRID_FILTER_TESTID[kind]}-chips`);
    }

    private gridFilterPopover(kind: GridFilterKind): Locator {
        const search = kind === 'Work Crew' ? /Search work crew/i : /Search employee/i;
        return this.page.getByRole('dialog').filter({ has: this.page.getByRole('searchbox', { name: search }) });
    }

    async gridFilterOptions(kind: GridFilterKind): Promise<string[]> {
        await this.gridFilterTrigger(kind).click();
        const popover = this.gridFilterPopover(kind);
        await popover.waitFor({ state: 'visible', timeout: 10_000 });
        const texts = (await popover.getByRole('button').allInnerTexts()).map((t) => t.trim());
        await this.page.keyboard.press('Escape');
        await expect(popover).toBeHidden({ timeout: 10_000 });
        return texts.filter((t) => t !== '' && !/^Clear \(\d+\)$/.test(t));
    }

    /** Single mode closes the popover after a pick and leaves focus on the trigger. */
    async pickGridFilter(kind: GridFilterKind, label: string): Promise<void> {
        await this.gridFilterTrigger(kind).click();
        await this.gridFilterPopover(kind).getByRole('button', { name: label, exact: true }).click();
        await expect(this.gridFilterValue(kind)).toContainText(label);
    }

    async stepGridFilter(kind: GridFilterKind, key: 'ArrowDown' | 'ArrowUp'): Promise<void> {
        const trigger = this.gridFilterTrigger(kind);
        await trigger.focus();
        await this.page.keyboard.press(key);
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }

    async clearGridFilter(kind: GridFilterKind): Promise<void> {
        await this.gridFilterTrigger(kind).getByRole('button', { name: /^Remove / }).click();
    }

    async filterControlBoxes(): Promise<{ single: Box; crew: Box; employee: Box }> {
        return {
            single: await this.boxOf(this.singleSelectSwitch, 'the Single select switch'),
            crew: await this.boxOf(this.gridFilterTrigger('Work Crew'), 'the Work Crew filter'),
            employee: await this.boxOf(this.gridFilterTrigger('Employee'), 'the Employee filter'),
        };
    }

    /** Several Time Card Crew chips in one picker visit; scopeToTimeCardCrew stays single-crew for its callers. */
    async scopeToTimeCardCrews(names: string[]): Promise<void> {
        const criterion = this.page.getByTestId('transfer-search-criterion');
        const picker = this.page.getByTestId('transfer-filter-crews');
        const chip = (name: string): Locator => criterion.getByRole('button', { name: `Remove ${name}`, exact: true });

        await this.page.getByTestId('transfer-search-by-trigger').click();
        await this.page.getByTestId('transfer-search-by-crew').click();
        await expect(picker).toBeVisible({ timeout: 10_000 });
        await picker.click();
        const dialog = this.page.getByRole('dialog');
        for (const name of names) {
            if (!(await chip(name).isVisible())) await dialog.getByRole('button', { name, exact: true }).click();
        }
        await this.page.keyboard.press('Escape');
        await expect(dialog).toBeHidden({ timeout: 10_000 });
        for (const name of names) await expect(chip(name), `Time Card Crew scope shows "${name}"`).toBeVisible({ timeout: 10_000 });
    }

    issueGroup(code: string): Locator {
        return this.page.getByTestId(`v2-issue-group-${code}`);
    }

    get issueDetail(): Locator {
        return this.page.getByTestId('v2-issue-detail');
    }

    /** Read only: a mouse click is intercepted by the panel header and a keyboard activation opens the Fix sheet. */
    issueDetailRow(timeCardCounter: number): Locator {
        return this.page.getByTestId(`v2-issue-detail-row-${timeCardCounter}`);
    }

    /** Clicks the issue group (a mouse click works there) and waits for its detail. */
    async clickIssue(code: string): Promise<void> {
        await this.expandIssuesPanel();
        await this.issueGroup(code).click();
        await expect(this.issueDetail).toBeVisible({ timeout: 15_000 });
    }

    gridRow(reference: string): Locator {
        return this.page.getByRole('row', { name: reference, exact: true });
    }

    /** Labels of the rows drawn underlined — the selected-row cue has no aria state. */
    async highlightedReferences(): Promise<string[]> {
        return this.page
            .locator('[role="row"][aria-label]')
            .evaluateAll((rows) => rows.filter((r) => getComputedStyle(r).textDecorationLine.includes('underline')).map((r) => r.getAttribute('aria-label') ?? ''));
    }

    /** Counts POST …/analyze the browser sends; observes traffic, makes no API call. */
    countAnalyzeRequests(): { count(): number; stop(): void } {
        let seen = 0;
        const onRequest = (r: Request): void => {
            if (r.method() === 'POST' && /\/transfer-to-job-cards\/analyze$/.test(new URL(r.url()).pathname)) seen += 1;
        };
        this.page.on('request', onRequest);
        return { count: () => seen, stop: () => void this.page.off('request', onRequest) };
    }

    // ── Client feedback cluster 2, part A (WEBPET-2982/3426/2906) ──

    /** Records ▸ Hide piece-outs: a display lens since WEBPET-2982 rev 2, so a toggle sends no analyze. */
    get hidePieceOutsCheckbox(): Locator {
        return this.page.getByTestId('transfer-hide-piece-outs');
    }

    async setHidePieceOuts(on: boolean): Promise<void> {
        const box = this.hidePieceOutsCheckbox;
        if ((await box.getAttribute('aria-checked')) !== String(on)) await box.click();
        await expect(box).toHaveAttribute('aria-checked', String(on));
    }

    get jobCardsWarning(): Locator {
        return this.page.getByTestId('jobcards-grid-warning');
    }

    get jobCardsWarningToggle(): Locator {
        return this.page.getByTestId('jobcards-grid-warning-toggle');
    }

    get jobCardsWarningList(): Locator {
        return this.page.getByTestId('jobcards-grid-warning-list');
    }

    get jobCardsTable(): Locator {
        return this.page.getByTestId('jobcards-grid-table');
    }

    /** Inline min-height (the 10-row floor), rendered height, and the scroll body's clientHeight. */
    async jobCardsTableMetrics(): Promise<{ minHeight: string; height: number; bodyHeight: number }> {
        return this.jobCardsTable.evaluate((t) => {
            const body = Array.from(t.querySelectorAll<HTMLElement>('*')).find((e) => /\boverflow-auto\b/.test(e.className) && /\bflex-1\b/.test(e.className));
            return { minHeight: (t as HTMLElement).style.minHeight, height: t.getBoundingClientRect().height, bodyHeight: body?.clientHeight ?? 0 };
        });
    }

    async warningListStyle(): Promise<{ overflowY: string; maxHeight: string; items: number }> {
        return this.jobCardsWarningList.evaluate((l) => ({ overflowY: getComputedStyle(l).overflowY, maxHeight: getComputedStyle(l).maxHeight, items: l.children.length }));
    }

    /** New record ▸ Add Piece-out: an individual piece-out. Work Crew auto-fills from the employee's home crew. The app toasts "Time Out record created". */
    async addPieceOut(v: { day: string; time: string; employee: string; crew: string; job: string; ranch: string; field: string; pieces: number }): Promise<void> {
        await this.newRecordButton.click({ timeout: 15_000 });
        await this.page.getByTestId('v2-add-record-item-pieceOut').click({ timeout: 15_000 });
        const dialog = this.page.getByRole('dialog', { name: 'Add Piece-out' });
        await dialog.waitFor({ state: 'visible', timeout: 15_000 });
        await dialog.getByRole('textbox', { name: 'Date / Time *' }).fill(`${v.day}T${v.time}`);
        await this.pickEmployee(dialog, v.employee);
        await dialog.getByRole('spinbutton', { name: 'Pieces' }).fill(String(v.pieces));
        await this.pickWorkCrew(dialog, v.crew);
        const job = dialog.getByRole('combobox', { name: /^Job\b/ });
        await job.click({ timeout: 15_000 });
        await this.page.keyboard.type(v.job);
        await this.page.getByRole('option', { name: v.job, exact: true }).click({ timeout: 15_000 });
        await expect(job).toHaveValue(v.job);
        await this.pickOption(dialog, 'Ranch', v.ranch);
        await this.pickOption(dialog, 'Field', v.field);
        await this.saveAddRecord(dialog);
        await expect(dialog).toBeHidden({ timeout: 20_000 });
    }

    // ── Client feedback cluster 2, part B (WEBPET-3301/3283/3575, PET-12942): New record ▸ Crew In ──

    get crewInSheet(): Locator {
        return this.page.getByRole('dialog', { name: 'Crew In', exact: true });
    }

    /** "Created N Time-In records." + OK; when 0 are created it asks "Do you want to see the Error log?" (No/Yes). */
    get crewInStatus(): Locator {
        return this.page.getByRole('dialog', { name: 'Crew-In status' });
    }

    get crewInRosterCount(): Locator {
        return this.crewInSheet.getByText(/^\d+ of \d+ selected$/);
    }

    get crewInNoEmployees(): Locator {
        return this.crewInSheet.getByText('No employees found for this crew.', { exact: true });
    }

    /** Roster rows are named "<Export ID> : <Name>", trimmed — ": CF B ONE" when the export id is empty. */
    crewInEmployee(label: string): Locator {
        return this.crewInSheet.getByRole('checkbox', { name: label, exact: true });
    }

    pageText(text: string): Locator {
        return this.page.getByText(text);
    }

    async openCrewIn(): Promise<void> {
        await expect(this.page.getByTestId('v2-add-record-sheet')).toBeHidden({ timeout: 30_000 });
        await this.newRecordButton.click({ timeout: 15_000 });
        await this.page.getByTestId('v2-add-record-item-crewIn').click({ timeout: 15_000 });
        await expect(this.crewInSheet.locator('#crewCounter')).toBeVisible({ timeout: 15_000 });
    }

    async setCrewInCheckbox(name: 'Use Employee Crew' | 'Based on Later Time-Cards', on: boolean): Promise<void> {
        const box = this.crewInSheet.getByRole('checkbox', { name, exact: true });
        if ((await box.isChecked()) !== on) await box.click();
        if (on) await expect(box).toBeChecked();
        else await expect(box).not.toBeChecked();
    }

    /** #ranchCounter is a button; crew/field/job are inputs narrowed by typing. Options render in a portal. */
    async pickCrewInLookup(id: 'crewCounter' | 'ranchCounter' | 'fieldCounter' | 'jobCounter', name: string): Promise<void> {
        const control = this.crewInSheet.locator(`#${id}`);
        await expect(control).toBeEnabled({ timeout: 15_000 });
        await control.click();
        if (id !== 'ranchCounter') await this.page.keyboard.type(name);
        await this.page.getByRole('option', { name, exact: true }).click({ timeout: 15_000 });
        if (id === 'ranchCounter') await expect(control).toContainText(name);
        else await expect(control).toHaveValue(name);
    }

    /** Checkboxes before the crew (ticking Use Employee Crew hides Based on Later); the roster loads after the crew. */
    async fillCrewIn(v: { day: string; time: string; crew: string; useEmployeeCrew?: boolean; basedOnLater?: boolean; ranch?: string; field?: string; phase?: string }): Promise<void> {
        const when = this.crewInSheet.getByRole('textbox', { name: 'Date / Time *' });
        await when.fill(`${v.day}T${v.time}`);
        if (v.useEmployeeCrew !== undefined) await this.setCrewInCheckbox('Use Employee Crew', v.useEmployeeCrew);
        if (v.basedOnLater !== undefined && !v.useEmployeeCrew) await this.setCrewInCheckbox('Based on Later Time-Cards', v.basedOnLater);
        await this.pickCrewInLookup('crewCounter', v.crew);
        if (v.ranch) await this.pickCrewInLookup('ranchCounter', v.ranch);
        if (v.field) await this.pickCrewInLookup('fieldCounter', v.field);
        if (v.phase) await this.pickCrewInLookup('jobCounter', v.phase);
        await expect(when).toHaveValue(`${v.day}T${v.time}`);
        await expect(this.crewInRosterCount.or(this.crewInNoEmployees)).toBeVisible({ timeout: 25_000 });
    }

    /** Opens Phase, reports which names are listed, closes it unchanged (Escape keeps the sheet open). */
    async crewInPhaseListed(names: string[]): Promise<boolean[]> {
        const control = this.crewInSheet.locator('#jobCounter');
        await control.click();
        const list = this.page.getByRole('listbox');
        await expect(list).toBeVisible({ timeout: 15_000 });
        const out: boolean[] = [];
        for (const n of names) out.push((await list.getByRole('option', { name: n, exact: true }).count()) > 0);
        await this.page.keyboard.press('Escape');
        await expect(list).toBeHidden({ timeout: 10_000 });
        await expect(control).toHaveValue('');
        return out;
    }

    /** A 0-created save still answers POST 201, so the status dialog is the outcome; returns its text. */
    async saveCrewIn(): Promise<string> {
        const save = this.crewInSheet.getByRole('button', { name: 'Save', exact: true });
        await expect(save).toBeEnabled({ timeout: 15_000 });
        await save.click();
        await expect(this.crewInStatus).toBeVisible({ timeout: 30_000 });
        return (await this.crewInStatus.innerText()).replace(/\s+/g, ' ').trim();
    }

    async confirmCrewInStatus(): Promise<void> {
        await this.crewInStatus.getByRole('button', { name: 'OK', exact: true }).click();
        await expect(this.crewInStatus).toBeHidden({ timeout: 10_000 });
        await expect(this.crewInSheet).toBeHidden({ timeout: 15_000 });
    }

    async closeCrewIn(): Promise<void> {
        await this.crewInSheet.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(this.crewInSheet).toBeHidden({ timeout: 15_000 });
    }
}
