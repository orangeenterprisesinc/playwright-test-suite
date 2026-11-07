/**
 * @fileoverview Export to Accounting — the page header and export-type tabs (`/export-to-accounting`).
 *
 * The v1 filter surface is gone; the route always serves the v2 workspace now
 * (see {@link ExportDispatchWorkspacePage} for the date scope, grid and legend).
 * This class keeps the header, the Payroll / Cost Accounting tabs and the
 * `module.not_licensed` banner, which v2 still renders.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';

/**
 * @extends BasePage
 */
export class ExportToAccountingPage extends BasePage {
    readonly pageUrl: string = '/export-to-accounting';
    readonly pageTitle: string | RegExp = /.*/;

    /** The page header. All text assertions run against the pinned `en` locale. */
    readonly heading: Locator;

    // ── Filter (retired v1 form — only the disabled WP-0191 still uses these) ──
    readonly filterFrom: Locator;
    readonly filterTo: Locator;
    readonly findCandidatesButton: Locator;
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

    /** The `module.not_licensed` inline banner — asserted *instead of* an error toast. */
    readonly moduleNotLicensedBanner: Locator;

    constructor(page: Page) {
        super(page);

        this.heading = page.getByRole('heading', { name: 'Export to Accounting' });

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

    /** Retired v1 helper (WEBPET-3342); only the disabled WP-0191 uses it. */
    async fillDateRange(from: string, to: string): Promise<void> {
        await this.filterFrom.fill(from);
        await this.filterTo.fill(to);
    }
}

export default ExportToAccountingPage;
