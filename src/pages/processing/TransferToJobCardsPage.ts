import { expect, test, Locator, Page, Response } from '@playwright/test';
import { BasePage } from '../BasePage';
import { WebpetMultiEditDialogComponent } from '../../components/webpet/WebpetMultiEditDialogComponent';

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
     * carrying both the heading and the Cancel button: any ancestor wrapping the
     * panel also satisfies the same `has` filters, so `.last()` picks the
     * tightest container rather than the whole page shell.
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

    /** `/transfer-to-job-cards/analyze` responses since the last {@link analyze} call. */
    private analyzeResponses: Array<{ status: number; code?: string }> = [];
    /** Sticky across retries (which clear analyzeResponses): did ANY analyze poll 404 not_found? */
    private analyzeSaw404 = false;
    private analyzeResponseHandler?: (response: Response) => void;
    /** How many times {@link tryWaitForCandidates} clicked "Try again" this call. */
    private analyzeRetries = 0;

    constructor(page: Page) {
        super(page);
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

        this.multiUpdateButton = page.getByRole('button', { name: /^Multi Update$/i });
        this.multiEdit = new WebpetMultiEditDialogComponent(page);

        this.timeInPanel = page
            .locator('div')
            .filter({ has: page.getByRole('heading', { name: /^Time In$/i }) })
            .filter({ has: page.getByRole('button', { name: /^Cancel$/i }) })
            .last();
        this.panelCancelButton = this.timeInPanel.getByRole('button', { name: /^Cancel$/i });
        this.panelRanchValue = this.comboboxByLabel('Ranch');
        this.panelFieldValue = this.comboboxByLabel('Field');
        this.panelPhaseValue = this.comboboxByLabel('Phase');
        this.panelEmployeeValue = this.comboboxByLabel('Employee');
        this.panelWorkCrewValue = this.comboboxByLabel('Work Crew');
        this.panelGpsValue = this.timeInPanel.getByRole('textbox', { name: /^GPS Reading\b/ });
    }

    async goto(): Promise<void> {
        await this.page.goto(this.pageUrl);
        await this.pageRoot.waitFor({ state: 'visible', timeout: 30_000 });
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
        // Wire the analyze responses BEFORE the click so a per-process job-store
        // 404 (GET …/analyze/{jobId} — WEBPET-1907 class, seen on multi-task dev)
        // is captured for tryWaitForCandidates to diagnose, instead of surfacing
        // as a bare locator timeout on the grid caption.
        this.analyzeResponses = [];
        this.analyzeRetries = 0;
        this.analyzeSaw404 = false;
        this.detachAnalyzeResponseListener();
        this.analyzeResponseHandler = (response) => {
            if (!/\/transfer-to-job-cards\/analyze(\/|$)/.test(new URL(response.url()).pathname)) return;
            void response
                .json()
                .catch(() => ({}))
                .then((body: { code?: string }) => {
                    if (response.status() === 404 && body.code === 'not_found') this.analyzeSaw404 = true;
                    this.analyzeResponses.push({ status: response.status(), code: body.code });
                });
        };
        this.page.on('response', this.analyzeResponseHandler);
        await this.analyzeButton.click();
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
     * WebpetDataGridComponent, hence the local helper. Column map:
     * 0 select · 1 add-record · 2 delete · 3 Crew · 4 Employee · 5 date · 6 time ·
     * 7 Field · 8 Job · 9 Pieces · 10 Traceability · 11 Ranch · 12 Reference ·
     * 13 Type · 14 Pay by Piece · 15 Transferred · 16 Export Identifier · 17 Run ·
     * 18 Employee Selection · 19 Status
     */
    cellAt(row: Locator, index: number): Locator {
        return row.getByRole('cell').nth(index);
    }

    async selectRowByReference(reference: string): Promise<void> {
        const row = this.rowByReference(reference);
        await row.getByRole('checkbox').first().check();
    }

    /** Selects an already-located row (e.g. from {@link rows}) — no reference text or index needed. */
    async selectRow(row: Locator): Promise<void> {
        await row.getByRole('checkbox').first().check();
    }

    /** Opens Multi-Edit on the currently selected rows via the "Multi Update" toolbar button. */
    async openMultiEdit(): Promise<void> {
        await this.multiUpdateButton.click();
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
    async openRow(timeCardCounter: number): Promise<void> {
        await this.rowFor(timeCardCounter).click();
        // 45s, not 15s: the panel shell opens instantly but its body sits on
        // "Loading…" until the Time In detail fetch returns, and that fetch has
        // been observed taking >15s on dev staging (2026-08-21). The locator
        // requires the panel's Cancel button, which only renders after the load.
        await this.timeInPanel.waitFor({ state: 'visible', timeout: 45_000 });
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
}
