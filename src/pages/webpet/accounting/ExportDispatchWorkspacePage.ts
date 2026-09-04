/**
 * @fileoverview Export to Accounting v2 — the dispatch workspace (PET-487…492).
 *
 * Answers on `/export-to-accounting` behind `?pt-export-new-ia=true`. Lifecycle:
 * Prepare upserts an ExportRun draft (`POST /runs`) while Analyze fetches
 * candidates (`POST /candidates`); toggles and per-row include/exclude PATCH the
 * draft; Clear filters DELETEs it; Recent Exports drills into finalized runs and
 * can retry their failed outcomes.
 *
 * ## The two chrome generations
 *
 * The workspace was redesigned after these specs were written — the old
 * run-header / readiness-strip / build-batch / destination-panel became a top
 * strip, a scope→review→export "spine", readiness counters and the candidates
 * grid. Both vocabularies are still asserted by the suite (`export-v2-counter-*`
 * on the redesigned page, `export-v2-readiness-*` on the mobile layout), so both
 * are exposed here rather than one being "corrected" away.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { DateRangeFilterComponent } from '../../../components/webpet/DateRangeFilterComponent';

/**
 * @extends BasePage
 */
export class ExportDispatchWorkspacePage extends BasePage {
    readonly pageUrl: string = '/export-to-accounting';
    readonly pageTitle: string | RegExp = /.*/;

    /** The grid's date-range column filter — what actually fires the analyze. */
    readonly dateRange: DateRangeFilterComponent;

    // ── Chrome ──────────────────────────────────────────────────────
    /** The v2 root. Its presence is what distinguishes v2 from the legacy page. */
    readonly pageRoot: Locator;
    readonly topStrip: Locator;
    /** The scope → review → export progression. */
    readonly spine: Locator;
    readonly grid: Locator;
    /** The grid's pre-analyze empty state. */
    readonly gridEmptyPickRange: Locator;
    /** Sticky bottom action region — mobile asserts its positioning classes. */
    readonly ctaRegion: Locator;

    // ── Prepare / filter ────────────────────────────────────────────
    readonly filterFrom: Locator;
    readonly filterTo: Locator;
    /** Prepare: upserts the draft and fetches candidates. v1's button is `export-find-candidates`. */
    readonly analyzeButton: Locator;
    /** Drops the draft (DELETE /runs/{id}). */
    readonly clearFiltersButton: Locator;

    // ── Batch toggles ───────────────────────────────────────────────
    readonly batchToggles: Locator;

    // ── Destination (mobile bottom sheet) ───────────────────────────
    /** The chip that replaces the inline destination panel below `lg:`. */
    readonly destinationSheetTrigger: Locator;
    readonly destinationSheetContent: Locator;
    /** Slice-1 baseline empty state; destination wiring lands in PET-488. */
    readonly destinationNotConfigured: Locator;

    // ── Recent Exports ──────────────────────────────────────────────
    readonly historyButton: Locator;
    readonly historySheet: Locator;
    readonly historyDetail: Locator;
    readonly historyDetailBack: Locator;
    readonly historyDetailRetryAll: Locator;

    constructor(page: Page) {
        super(page);

        this.dateRange = new DateRangeFilterComponent(page);

        this.pageRoot = page.getByTestId('export-v2-page');
        this.topStrip = page.getByTestId('export-v2-top-strip');
        this.spine = page.getByTestId('export-v2-spine');
        this.grid = page.getByTestId('export-v2-grid');
        this.gridEmptyPickRange = page.getByTestId('export-v2-grid-empty-pick-range');
        this.ctaRegion = page.getByTestId('export-v2-cta-region');

        this.filterFrom = page.getByTestId('export-filter-from');
        this.filterTo = page.getByTestId('export-filter-to');
        this.analyzeButton = page.getByTestId('export-analyze');
        this.clearFiltersButton = page.getByTestId('export-v2-clear-filters');

        this.batchToggles = page.getByTestId('export-v2-batch-toggles');

        this.destinationSheetTrigger = page.getByTestId('export-v2-destination-sheet-trigger');
        this.destinationSheetContent = page.getByTestId('export-v2-destination-sheet-content');
        this.destinationNotConfigured = page.getByTestId('export-v2-destination-not-configured');

        this.historyButton = page.getByTestId('export-v2-history-button');
        this.historySheet = page.getByTestId('export-v2-history-sheet');
        this.historyDetail = page.getByTestId('export-v2-history-detail');
        this.historyDetailBack = page.getByTestId('export-v2-history-detail-back');
        this.historyDetailRetryAll = page.getByTestId('export-v2-history-detail-retry-all');
    }

    // ── Navigation ──────────────────────────────────────────────────

    /** Open the workspace with the new-IA flag on. */
    async gotoWorkspace(): Promise<void> {
        await this.page.goto(`${this.pageUrl}?pt-export-new-ia=true`);
    }

    /**
     * Open the route with an explicit flag value.
     *
     * Kept separate from {@link gotoWorkspace} for the one test that proves
     * `pt-export-new-ia=false` no longer falls back to the legacy page.
     */
    async gotoWithFlag(value: string): Promise<void> {
        await this.page.goto(`${this.pageUrl}?pt-export-new-ia=${value}`);
    }

    // ── Readiness ───────────────────────────────────────────────────

    /**
     * A readiness counter on the **redesigned** chrome, keyed
     * `pending | needsReexport | warnings` — three, not four. `alreadyExported`
     * is not a counter: the exported state shows as a per-row grid flag plus the
     * include-reexport scope toggle.
     *
     * Driven by the run-draft (`POST /runs`), not the `/candidates` response — so
     * mocking fixed candidate rows does not move these numbers.
     */
    counter(key: string): Locator {
        return this.page.getByTestId(`export-v2-counter-${key}`);
    }

    /**
     * A readiness card on the **strip** chrome, keyed
     * `ready | needs-reexport | already-exported | warnings`.
     *
     * Not interchangeable with {@link counter}: different testid family, different
     * keys, different data source. Do not consolidate them.
     */
    readiness(key: string): Locator {
        return this.page.getByTestId(`export-v2-readiness-${key}`);
    }

    // ── Review queue ────────────────────────────────────────────────

    /** A review-queue bucket, e.g. `'pending'` or `'already-exported'`. */
    bucket(key: string): Locator {
        return this.page.getByTestId(`export-v2-bucket-${key}`);
    }

    /** A bucket's expand/collapse control — checkboxes only render once expanded. */
    bucketToggle(key: string): Locator {
        return this.page.getByTestId(`export-v2-bucket-${key}-toggle`);
    }

    /** One row's include/exclude checkbox inside an expanded bucket. */
    bucketCheckbox(key: string, jobCardCounter: number): Locator {
        return this.page.getByTestId(`export-v2-bucket-${key}-checkbox-${jobCardCounter}`);
    }

    /** A bucket's bulk-exclude control, which PATCHes every id at once. */
    bucketBulk(key: string): Locator {
        return this.page.getByTestId(`export-v2-bucket-${key}-bulk`);
    }

    // ── Batch toggles ───────────────────────────────────────────────

    /** A batch toggle row, e.g. `'include-reexport'`. */
    toggle(key: string): Locator {
        return this.page.getByTestId(`export-v2-toggle-${key}`);
    }

    /**
     * The switch inside a batch toggle row.
     *
     * The row carries the testid and the switch carries the role — clicking the
     * row is not the same interaction, so the two stay distinct members.
     */
    toggleSwitch(key: string): Locator {
        return this.toggle(key).getByRole('switch');
    }

    // ── Recent Exports ──────────────────────────────────────────────

    /** A finalized run's row in the history sheet, keyed by ExportRun counter. */
    historyRow(exportRunCounter: number): Locator {
        return this.page.getByTestId(`export-v2-history-row-${exportRunCounter}`);
    }

    /** One per-JobCard outcome row in the drill-down. */
    historyOutcome(jobCardCounter: number): Locator {
        return this.page.getByTestId(`export-v2-history-outcome-${jobCardCounter}`);
    }

    /** A drill-down status filter pill, e.g. `'failed'`. */
    historyDetailFilter(status: string): Locator {
        return this.page.getByTestId(`export-v2-history-detail-filter-${status}`);
    }

    // ── Actions ─────────────────────────────────────────────────────

    /** Fill both ends of the range in one step. */
    async fillDateRange(from: string, to: string): Promise<void> {
        await this.filterFrom.fill(from);
        await this.filterTo.fill(to);
    }

    /** Fill the range and fire Prepare. */
    async prepare(from: string, to: string): Promise<void> {
        await this.fillDateRange(from, to);
        await this.analyzeButton.click();
    }
}

export default ExportDispatchWorkspacePage;
