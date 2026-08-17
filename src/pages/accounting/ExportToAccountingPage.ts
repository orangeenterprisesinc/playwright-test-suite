/**
 * @fileoverview Export to Accounting — the v1 filter surface (`/export-to-accounting`).
 *
 * A filter form over two export types (Payroll, Cost Accounting) that POSTs to
 * `/api/job-cards/export-to-accounting/candidates` and renders the matched rows
 * plus a payment-type colour legend.
 *
 * ## Why this is separate from {@link ExportDispatchWorkspacePage}
 *
 * Both surfaces answer on the same route, and they share three testids
 * (`export-filter-from`, `export-filter-to`, `export-page-description`). They are
 * still two page objects because everything else differs: v1 submits through
 * `export-find-candidates` and renders tabs, a legend and per-row testids, while
 * v2 submits through `export-analyze` and renders the dispatch spine, readiness
 * counters and review-queue buckets. Merging them would produce one class where
 * half the members are dead on any given page — the exact failure mode that makes
 * a relocated locator silently match nothing.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * @extends BasePage
 */
export class ExportToAccountingPage extends BasePage {
    readonly pageUrl: string = '/export-to-accounting';
    readonly pageTitle: string | RegExp = /.*/;

    /** The page header. All text assertions run against the pinned `en` locale. */
    readonly heading: Locator;
    readonly pageDescription: Locator;

    // ── Filter ──────────────────────────────────────────────────────
    /** Pre-populated with a 7-day lookback ending today. */
    readonly filterFrom: Locator;
    readonly filterTo: Locator;
    /** Submits the filter. Disabled while the range is inverted. */
    readonly findCandidatesButton: Locator;
    /** The inverted-range message, which also blocks submit. */
    readonly dateOrderError: Locator;

    // ── Export-type tabs ────────────────────────────────────────────
    /** Active by default. */
    readonly payrollTab: Locator;
    /** Disabled when the CostAccounting module is not licensed. */
    readonly costAccountingTab: Locator;
    /**
     * The focusable wrapper around the Cost Accounting tab.
     *
     * The component wraps the disabled `<button>` so the browser does not swallow
     * pointer events, and the tooltip is keyed off the **wrapper** — hovering the
     * button itself never surfaces the popover.
     */
    readonly costAccountingTooltipWrapper: Locator;
    readonly costAccountingTooltip: Locator;

    // ── Results ─────────────────────────────────────────────────────
    readonly candidatesCount: Locator;
    /** The payment-type colour legend, rendered below the table once rows exist. */
    readonly legend: Locator;
    /** The `module.not_licensed` inline banner — asserted *instead of* an error toast. */
    readonly moduleNotLicensedBanner: Locator;

    constructor(page: Page) {
        super(page);

        this.heading = page.getByRole('heading', { name: 'Export to Accounting' });
        this.pageDescription = page.getByTestId('export-page-description');

        this.filterFrom = page.getByTestId('export-filter-from');
        this.filterTo = page.getByTestId('export-filter-to');
        this.findCandidatesButton = page.getByTestId('export-find-candidates');
        this.dateOrderError = page.getByTestId('export-filter-date-order-error');

        this.payrollTab = page.getByTestId('export-tab-payroll');
        this.costAccountingTab = page.getByTestId('export-tab-cost-accounting');
        this.costAccountingTooltipWrapper = page.getByTestId(
            'export-tab-cost-accounting-tooltip-wrapper',
        );
        this.costAccountingTooltip = page.getByTestId('export-tab-cost-accounting-tooltip');

        this.candidatesCount = page.getByTestId('export-candidates-count');
        this.legend = page.getByTestId('export-legend');
        this.moduleNotLicensedBanner = page.getByTestId('export-module-not-licensed-banner');
    }

    // ── Navigation ──────────────────────────────────────────────────

    /**
     * Open the filter page.
     *
     * A plain `goto`, not `BasePage.navigate()` — that pins
     * `waitUntil: 'domcontentloaded'` while the lifted specs use the default.
     */
    async gotoFilter(): Promise<void> {
        await this.page.goto(this.pageUrl);
    }

    /** Open the filter page with a query string, e.g. `'?type=payroll'`. */
    async gotoFilterWithQuery(query: string): Promise<void> {
        await this.page.goto(`${this.pageUrl}${query}`);
    }

    // ── Parameterised surfaces ──────────────────────────────────────

    /** One legend swatch by payment-type key, e.g. `'time'` or `'bonus'`. */
    legendItem(key: string): Locator {
        return this.page.getByTestId(`export-legend-item-${key}`);
    }

    /** A result row by its JobCard counter — the rows are id-keyed, not positional. */
    candidateRow(jobCardCounter: number): Locator {
        return this.page.getByTestId(`export-candidate-row-${jobCardCounter}`);
    }

    /** Fill both ends of the range in one step. */
    async fillDateRange(from: string, to: string): Promise<void> {
        await this.filterFrom.fill(from);
        await this.filterTo.fill(to);
    }
}

export default ExportToAccountingPage;
