/**
 * @fileoverview Reconcile Job Cards (`/reconcile-job-cards`) — TTJC-aligned layout.
 *
 * Recomputes JobCard totals for a date scope. Two independent gates decide what
 * the page even renders, and both are *server state the suite cannot set*:
 *
 * 1. **The `IncludeReconcileJCs` PetData preference.** Off ⇒ the page renders only
 *    {@link disabledBanner} and no chrome at all. Every test that needs the
 *    working page reads {@link isDisabled} first and skips on `true`.
 * 2. **The `accounting.export` permission.** Absent ⇒ the sidebar entry is gone
 *    and a direct URL redirects to `/`.
 *
 * So the spec's `test.skip` calls are not defensive noise — they are the only
 * honest outcome when the seeded stack lands on the other side of a gate. They
 * stay in the spec: a page object must never call `test.skip`, or a skip becomes
 * invisible at the callsite.
 *
 * ## Reconcile is a real mutation
 *
 * `reconcile-confirm-submit` POSTs with `dryRun:false` and writes to JobCards.
 * The dry-run POST that backs the preview count uses the same URL, which is why
 * every mock in the spec inspects `postData()` for `"dryRun":true` and falls back
 * rather than fulfilling.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { DateRangeFilterComponent } from '../../../components/webpet/DateRangeFilterComponent';

/**
 * @extends BasePage
 */
export class ReconcileJobCardsPage extends BasePage {
    readonly pageUrl: string = '/reconcile-job-cards';
    readonly pageTitle: string | RegExp = /.*/;

    /** The date-range column filter that drives the preview fetch. */
    readonly dateRange: DateRangeFilterComponent;

    readonly heading: Locator;
    /** Rendered *instead of* the page when the `IncludeReconcileJCs` preference is off. */
    readonly disabledBanner: Locator;

    // ── Scope + submit ──────────────────────────────────────────────
    /** The Reconcile CTA. Present but disabled until a date scope is picked. */
    readonly submitButton: Locator;
    /** The grid's pre-analyze empty state, with a link that opens the picker. */
    readonly gridEmptyPickRange: Locator;
    /** The wave-arrow hint pointing from the status column at the date column. */
    readonly gridPickRangeArrow: Locator;
    readonly previewCount: Locator;
    /** The populated-grid branch is unreachable when this renders. */
    readonly noMatchMessage: Locator;

    // ── Confirmation ────────────────────────────────────────────────
    readonly confirmDialog: Locator;
    readonly confirmSubmitButton: Locator;
    /** Only rendered above a 500-record selection. */
    readonly largeSelectionWarning: Locator;

    // ── Summary ─────────────────────────────────────────────────────
    readonly summaryPanel: Locator;
    /** Present only when the run produced failures or warnings. */
    readonly summaryDownload: Locator;
    readonly summaryAllGood: Locator;
    /**
     * Every inline failure/warning row.
     *
     * A testid **prefix** match: the rows are keyed by JobCard counter, so there
     * is no single id to target and the count is the assertion.
     */
    readonly resultRows: Locator;

    constructor(page: Page) {
        super(page);

        this.dateRange = new DateRangeFilterComponent(page);

        this.heading = page.getByRole('heading', { name: 'Reconcile Job Cards' });
        this.disabledBanner = page.getByTestId('reconcile-disabled-banner');

        this.submitButton = page.getByTestId('reconcile-submit');
        this.gridEmptyPickRange = page.getByTestId('reconcile-grid-empty-pick-range');
        this.gridPickRangeArrow = page.getByTestId('reconcile-grid-pick-range-arrow');
        this.previewCount = page.getByTestId('reconcile-preview-count');
        this.noMatchMessage = page.getByText('No job cards match this filter.');

        this.confirmDialog = page.getByTestId('reconcile-confirm-dialog');
        this.confirmSubmitButton = page.getByTestId('reconcile-confirm-submit');
        this.largeSelectionWarning = page.getByTestId('reconcile-large-selection-warning');

        this.summaryPanel = page.getByTestId('reconcile-summary-panel');
        this.summaryDownload = page.getByTestId('reconcile-summary-download');
        this.summaryAllGood = page.getByTestId('reconcile-summary-all-good');
        this.resultRows = page.locator('[data-testid^="reconcile-row-"]');
    }

    /**
     * Open the page.
     *
     * A plain `goto`, not `BasePage.navigate()` — that pins
     * `waitUntil: 'domcontentloaded'` while the lifted specs use the default.
     */
    async gotoReconcile(): Promise<void> {
        await this.page.goto(this.pageUrl);
    }

    /** Whether the preference gate is off. An immediate read, not a wait. */
    async isDisabled(): Promise<boolean> {
        return this.disabledBanner.isVisible();
    }

    /**
     * Pick the broadest preset that still references recent data, unless the
     * preference gate is off.
     *
     * Returns `false` when the banner is up so the caller can `test.skip` — the
     * decision belongs at the callsite, not in here.
     */
    async applyLast30IfEnabled(): Promise<boolean> {
        if (await this.isDisabled()) return false;
        await this.dateRange.applyPreset('Last 30 days');
        return true;
    }

    /** The matched count as a number, parsed from the preview label. */
    async matchedCount(): Promise<number> {
        const text = (await this.previewCount.textContent()) ?? '';
        return Number.parseInt(text.replace(/[^\d]/g, ''), 10) || 0;
    }
}

export default ReconcileJobCardsPage;
