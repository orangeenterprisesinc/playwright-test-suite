/**
 * @fileoverview The 18 bonus types, as one shared case table.
 *
 * Lifted out of `bonus-flow.spec.ts` so `bonus-shell.spec.ts` can stop carrying
 * its own duplicate list of the same 18 keys in the same order — the app has one
 * set of bonus types, and two copies could drift apart silently.
 *
 * `as const` is load-bearing, not stylistic: it narrows `key` to a literal union,
 * which makes the generated id maps in `src/data/webpet/ids/` **index-checked at
 * compile time**. A renamed or removed type then becomes a `tsc` error rather
 * than a runtime `undefined` that lands in the spec as an empty annotation — and
 * an empty annotation means the runner gate silently skips the test while the run
 * still reports green.
 *
 * Order matches `apps/api/internal/bonus/types.go` (`BonusTypeOptions` 0–17).
 * Do not reorder to tidy it: the ids are keyed by `key`, not position, so
 * reordering is safe for the ids — but the order is the API's, and matching it
 * keeps the two readable side by side.
 *
 * @module data/webpet/bonusTypes
 */

/** One bonus type's routing and test-id surface. */
export interface BonusTypeCase {
    /** Catalog key = the `/bonus/:type` route segment. */
    readonly key: string;
    /** Step-1 filter panel testid. */
    readonly filterPanel: string;
    /**
     * Step-2 review-grid testid **prefix**.
     *
     * The per-type grid panel emits `<prefix>-empty-filter` / `-loading` /
     * `-error`, and on data the shared `bonus-review-grid-panel`. Several
     * prefixes deliberately differ from the catalog key — `crew` →
     * `bonus-crew-bonus-grid`, `quality-incentive-bonus` →
     * `bonus-quality-incentive-pay-grid` — which is confirmed-reconciled, not a
     * defect.
     */
    readonly gridPrefix: string;
    /** HolidayPay (id 8) and PieceWeeklyIncentive (id 14) take no date filter. */
    readonly dateExempt?: boolean;
}

export const BONUS_TYPES = [
    {
        key: 'employee',
        filterPanel: 'bonus-employee-filter-panel',
        gridPrefix: 'bonus-employee-bonus-grid',
    },
    { key: 'crew', filterPanel: 'bonus-crew-filter-panel', gridPrefix: 'bonus-crew-bonus-grid' },
    {
        key: 'supervisor',
        filterPanel: 'bonus-supervisor-filter-panel',
        gridPrefix: 'bonus-supervisor-grid',
    },
    {
        key: 'supervisor-piece-incentive',
        filterPanel: 'bonus-supervisor-piece-incentive-filter-panel',
        gridPrefix: 'bonus-supervisor-piece-incentive-grid',
    },
    {
        key: 'supervisor-bonus-extra-pieces',
        filterPanel: 'bonus-supervisor-bonus-extra-pieces-filter-panel',
        gridPrefix: 'bonus-supervisor-extra-pieces-grid',
    },
    {
        key: 'fair-food-premium',
        filterPanel: 'bonus-fair-food-premium-filter-panel',
        gridPrefix: 'bonus-fair-food-premium-grid',
    },
    {
        key: 'daily-by-employee',
        filterPanel: 'bonus-daily-by-employee-filter-panel',
        gridPrefix: 'bonus-daily-by-employee-grid',
    },
    {
        key: 'daily-by-job',
        filterPanel: 'bonus-daily-by-job-filter-panel',
        gridPrefix: 'bonus-daily-by-job-grid',
    },
    {
        key: 'holiday-pay',
        filterPanel: 'bonus-holiday-pay-filter-panel',
        gridPrefix: 'bonus-holiday-pay-grid',
        dateExempt: true,
    },
    {
        key: 'support-crew-bonus',
        filterPanel: 'bonus-support-crew-filter-panel',
        gridPrefix: 'bonus-support-crew-grid',
    },
    {
        key: 'supervisor-average-crew-hourly',
        filterPanel: 'bonus-supervisor-average-crew-hourly-filter-panel',
        gridPrefix: 'bonus-supervisor-average-crew-hourly-grid',
    },
    {
        key: 'piece-incentive-bonus',
        filterPanel: 'bonus-piece-incentive-filter-panel',
        gridPrefix: 'bonus-piece-incentive-grid',
    },
    {
        key: 'tier-piece-incentive',
        filterPanel: 'bonus-tier-piece-incentive-filter-panel',
        gridPrefix: 'bonus-tier-piece-incentive-pay-grid',
    },
    {
        key: 'supervisor-crew-size',
        filterPanel: 'bonus-supervisor-crew-size-filter-panel',
        gridPrefix: 'bonus-supervisor-crew-size-grid',
    },
    {
        key: 'piece-weekly-incentive-bonus',
        filterPanel: 'bonus-piece-weekly-incentive-filter-panel',
        gridPrefix: 'bonus-piece-weekly-grid',
        dateExempt: true,
    },
    {
        // Catalog/display key is `quality-incentive-bonus`; the grid hook and
        // backend route are both `quality-incentive-pay` — confirmed reconciled.
        key: 'quality-incentive-bonus',
        filterPanel: 'bonus-quality-incentive-filter-panel',
        gridPrefix: 'bonus-quality-incentive-pay-grid',
    },
    {
        key: 'piece-productivity-hourly-bonus',
        filterPanel: 'bonus-piece-productivity-hourly-filter-panel',
        gridPrefix: 'bonus-piece-productivity-hourly-grid',
    },
    {
        key: 'tier-hourly-piece-incentive',
        filterPanel: 'bonus-tier-hourly-piece-incentive-filter-panel',
        gridPrefix: 'bonus-tier-hourly-piece-incentive-grid',
    },
] as const satisfies readonly BonusTypeCase[];

/** Every catalog key, in API order — the landing page's expected card set. */
export const BONUS_TYPE_KEYS = BONUS_TYPES.map((t) => t.key);

/** Exactly the entries declaring `dateExempt: true`, as their own literal types. */
type DateExemptCase = Extract<(typeof BONUS_TYPES)[number], { dateExempt: true }>;

/**
 * The two types that read everything from their own panel and take no date range.
 *
 * Filtered with a **type predicate**, not a plain callback. A plain
 * `.filter(t => t.dateExempt)` returns the full 18-member element union, so
 * `t.key` would widen back to all 18 literals — and
 * `bonusFlowIds['date-exempt:' + key]` would then demand 18 map entries where
 * only 2 exist. The predicate keeps the narrowing that makes the id lookup
 * compile-checked.
 */
export const DATE_EXEMPT_BONUS_TYPES = BONUS_TYPES.filter(
    // `'dateExempt' in t` rather than `t.dateExempt`: the non-exempt entries omit
    // the property entirely, so it is not accessible on the union at all.
    (t): t is DateExemptCase => 'dateExempt' in t && t.dateExempt === true,
);

/** Literal union of every bonus type key — what makes the id maps index-checked. */
export type BonusTypeKey = (typeof BONUS_TYPES)[number]['key'];

/**
 * Look a type up by its catalog key.
 *
 * Throws rather than returning undefined: a miss means the caller named a type
 * that does not exist, and failing at that point is far clearer than a locator
 * built from `undefined` silently matching nothing.
 */
export function bonusTypeByKey(key: BonusTypeKey): BonusTypeCase {
    const hit = BONUS_TYPES.find((t) => t.key === key);
    if (!hit) throw new Error(`Unknown bonus type key: ${key}`);
    return hit;
}
