/**
 * @fileoverview The Bonus wizard — `/bonus` and `/bonus/:type` (WEBPET-857…861).
 *
 * A two-step wizard over 18 bonus types: Step 1 selects records through a
 * per-type filter panel, Step 2 reviews the computed rows and offers the commit
 * affordance.
 *
 * ## Why almost everything here is a testid
 *
 * The per-type panels and grids have no stable accessible names — their labels
 * are alias-driven and locale-dependent — so the app emits explicit testids and
 * those are the contract. The panel and grid ids live on
 * {@link BonusTypeCase} rather than being spelled out per test, because several
 * of them deliberately diverge from the catalog key (`crew` →
 * `bonus-crew-bonus-grid`) and hardcoding one per test is how those drift.
 *
 * ## Step 2 and the empty-filter state
 *
 * Each per-type review panel renders exactly one of `<prefix>-empty-filter`,
 * `<prefix>-loading` → `bonus-review-grid-panel`, or `<prefix>-error`. All of
 * them mount the per-type panel, so asserting a visible
 * `[data-testid^="<prefix>"]` proves the selection → results → review wiring
 * end-to-end **without** per-type DB seeding. The empty-results banner is a
 * sanctioned pass for the flow sweep (WEBPET-861); compute *maths* is covered by
 * Go tests.
 *
 * Relocated from `src/pages/webpet/bonus/` with its two specs. It still imports
 * the case table from `src/data/webpet/`, which is a type-only import of pure
 * data — that module moves with a later batch.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import type { BonusTypeCase } from '../../data/webpet/bonusTypes';

/**
 * @extends BasePage
 */
export class BonusWizardPage extends BasePage {
    readonly pageUrl: string = '/bonus';
    readonly pageTitle: string | RegExp = /.*/;

    // ── Landing page ────────────────────────────────────────────────
    /** The card grid listing every bonus type. */
    readonly typesGrid: Locator;

    // ── Wizard chrome ───────────────────────────────────────────────
    /** Advances from Step 1. Gated on filter validity. */
    readonly continueButton: Locator;
    /** Commits the reviewed rows on Step 2. Disabled with no included rows. */
    readonly executeButton: Locator;
    /** Returns from Step 2 to Step 1. */
    readonly backButton: Locator;
    /** Abandons the wizard and returns to the landing page. */
    readonly cancelButton: Locator;
    readonly saveFilterButton: Locator;
    readonly loadFilterButton: Locator;

    // ── Step 1 ──────────────────────────────────────────────────────
    /**
     * The universal date range. Absent on the two date-exempt types.
     *
     * Matched on the input's `id`, not its label text. The label is an i18n
     * string (`wizard.dateFilter.start.label`), so `getByLabel('Start
     * Date/Time In')` only resolves for an English user — and the date-exempt
     * tests assert `toHaveCount(0)`, which a non-matching locator satisfies
     * just as happily as an absent input. Under the webpet fixture that was
     * masked by a `pt.locale` pin this suite does not have. `#startDate` /
     * `#endDate` are the form-field registration names and are locale-neutral.
     */
    readonly startDateFilter: Locator;
    readonly endDateFilter: Locator;
    /** The column-picker panel, shown for the types configured for sub-selection. */
    readonly subSelectionPanel: Locator;
    /** Quality Incentive's deferred-measurement notice — a one-off marker. */
    readonly qualityMeasurementDeferred: Locator;

    constructor(page: Page) {
        super(page);

        this.typesGrid = page.getByTestId('bonus-types-grid');

        this.continueButton = page.getByTestId('bonus-wizard-continue');
        this.executeButton = page.getByTestId('bonus-wizard-execute');
        this.backButton = page.getByTestId('bonus-wizard-back');
        this.cancelButton = page.getByTestId('bonus-wizard-cancel');
        this.saveFilterButton = page.getByTestId('bonus-wizard-save-filter');
        this.loadFilterButton = page.getByTestId('bonus-wizard-load-filter');

        this.startDateFilter = page.locator('#startDate');
        this.endDateFilter = page.locator('#endDate');
        this.subSelectionPanel = page.getByTestId('bonus-sub-selection-panel');
        this.qualityMeasurementDeferred = page.getByTestId(
            'bonus-quality-incentive-measurement-deferred',
        );
    }

    // ── Navigation ──────────────────────────────────────────────────

    /** Open the landing page. */
    async gotoLanding(): Promise<void> {
        await this.page.goto(this.pageUrl);
    }

    /**
     * Open a type's wizard at Step 1.
     *
     * Takes a plain string rather than the narrowed key union, because one test
     * deliberately navigates to an unknown type to prove the redirect.
     */
    async gotoType(typeKey: string): Promise<void> {
        await this.page.goto(`${this.pageUrl}/${typeKey}`);
    }

    /** Open a type's wizard directly at Step 2. */
    async gotoTypeStep2(typeKey: string): Promise<void> {
        await this.page.goto(`${this.pageUrl}/${typeKey}?step=2`);
    }

    // ── Landing / per-type surfaces ─────────────────────────────────

    /** A bonus type's navigable card on the landing page. */
    typeCard(typeKey: string): Locator {
        return this.page.getByTestId(`bonus-type-card-${typeKey}`);
    }

    /** A type's Step-1 filter panel. */
    filterPanel(type: BonusTypeCase): Locator {
        return this.page.getByTestId(type.filterPanel);
    }

    /**
     * A type's Step-2 review-grid container, matched on the testid **prefix** so
     * any of its states counts — see the class note on why that is the right
     * assertion for the flow sweep.
     */
    reviewGrid(type: BonusTypeCase): Locator {
        return this.page.locator(`[data-testid^="${type.gridPrefix}"]`).first();
    }

    /** A type's explicit missing-filter banner — the deterministic direct-nav state. */
    reviewGridEmptyFilter(type: BonusTypeCase): Locator {
        return this.page.getByTestId(`${type.gridPrefix}-empty-filter`);
    }

    /** The Step-1 heading, which names the type and the step. */
    selectionHeading(pattern: RegExp): Locator {
        return this.page.getByRole('heading', { name: pattern });
    }

    /** A panel field by its associated label. */
    field(labelPattern: RegExp): Locator {
        return this.page.getByLabel(labelPattern);
    }

    /**
     * A panel field's label **text**.
     *
     * For the FK ParentPickers, whose labels are not `getByLabel`-associated the
     * way the plain inputs are — the label renders as a sibling, so the text is
     * the only handle.
     */
    fieldLabelText(pattern: RegExp): Locator {
        return this.page.getByText(pattern);
    }
}

export default BonusWizardPage;
