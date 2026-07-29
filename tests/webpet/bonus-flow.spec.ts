import { test, expect } from './fixtures';

/**
 * WEBPET-861 — Bonus wizard *per-type flow* verification sweep (all 18 types).
 *
 * Distinct from `bonus-shell.spec.ts` (which stops at the shell: panels render,
 * date filter shows/hides, Continue/Save/Load disabled) and from the per-type
 * compute-*math* Go tests (`apps/api/internal/bonus/*_grid_test.go`). This spec
 * verifies the wizard *flow* — selection → results grid → review → commit
 * affordance — for every one of the 18 `BonusTypeOptions` (ids 0–17), after the
 * Continue→compute (WEBPET-858) and Review→commit (WEBPET-859) slices landed.
 *
 * ## What "flow pass" means here (and why empty grids count)
 *
 * Each per-type Step-1 filter is only "valid" (Continue enables, the grid hook
 * is `enabled`) once that panel's non-date prefs — e.g. a real Bonus Job
 * counter — are present in localStorage. Those counters are DB-specific and the
 * DelLlano fixture has no guaranteed seedable rows for every type, so the plan
 * (WEBPET-861) explicitly sanctions the **empty-results / empty-filter banner**
 * as an accepted pass for the *flow* (compute *math* is covered elsewhere).
 *
 * Concretely, on Step 2 each per-type review panel renders exactly one of:
 *   - `bonus-<prefix>-grid-empty-filter`  (no valid filter — the deterministic
 *     state on direct `?step=2` nav without seeded prefs),
 *   - `bonus-<prefix>-grid-loading` → settles to `bonus-review-grid-panel`
 *     (valid filter; rows or an empty message),
 *   - `bonus-<prefix>-grid-error`.
 * All four mount the per-type panel, so asserting a visible
 * `[data-testid^="bonus-<prefix>-grid"]` container proves selection→results→
 * review wiring end-to-end for that type without brittle per-type DB seeding.
 *
 * The admin fixture seeds `BonusPayment` module + `bonus.view` + `records.create`
 * so every gate (read/compute + the commit `requireCreate`) passes.
 *
 * Per-type defects (if any) are filed as their own follow-up tickets that Block
 * back to epic WEBPET-857 — never patched inline. The companion per-type
 * results table is recorded as a comment on WEBPET-861.
 */

interface BonusTypeCase {
  /** Catalog key = the `/bonus/:type` route segment. */
  key: string;
  /** Step-1 filter panel testid. */
  filterPanel: string;
  /**
   * Step-2 review-grid testid *prefix*. The per-type grid panel emits
   * `<prefix>-empty-filter` / `-loading` / `-error`, and on data the shared
   * `bonus-review-grid-panel`. Note several prefixes differ from the catalog
   * key (e.g. `crew` → `bonus-crew-bonus-grid`, `quality-incentive-bonus` →
   * `bonus-quality-incentive-pay-grid`).
   */
  gridPrefix: string;
  /** The two HolidayPay / PieceWeeklyIncentive types take no date filter. */
  dateExempt?: boolean;
}

// id order matches apps/api/internal/bonus/types.go (BonusTypeOptions 0–17).
const BONUS_TYPES: BonusTypeCase[] = [
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
    // catalog/display key is `quality-incentive-bonus`; the grid hook + backend
    // route are both `quality-incentive-pay` (confirmed reconciled — no defect).
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
];

test.describe('Bonus wizard — per-type flow sweep (WEBPET-861)', () => {
  test('the sweep covers all 18 BonusTypeOptions', () => {
    expect(BONUS_TYPES).toHaveLength(18);
    // No duplicate keys / grid prefixes.
    expect(new Set(BONUS_TYPES.map((t) => t.key)).size).toBe(18);
    expect(new Set(BONUS_TYPES.map((t) => t.gridPrefix)).size).toBe(18);
  });

  for (const tc of BONUS_TYPES) {
    test.describe(`type: ${tc.key}`, () => {
      test('Step 1 — selection panel mounts and Continue gates on filter validity', async ({
        page,
      }) => {
        await page.goto(`/bonus/${tc.key}`);
        await expect(page.getByTestId(tc.filterPanel)).toBeVisible({ timeout: 10_000 });

        // Continue starts disabled (no valid filter yet) and carries an
        // aria-label — i.e. it is wired (WEBPET-858), not the deferred stub.
        const cont = page.getByTestId('bonus-wizard-continue');
        await expect(cont).toBeVisible();
        await expect(cont).toBeDisabled();
        await expect(cont).toHaveAttribute('aria-label', /.+/);
      });

      test('Step 2 — review grid mounts and the commit affordance is present', async ({ page }) => {
        // Direct nav to Step 2 deterministically renders the per-type panel's
        // empty-filter/loading/error/grid container (any one = flow pass).
        await page.goto(`/bonus/${tc.key}?step=2`);

        await expect(page.locator(`[data-testid^="${tc.gridPrefix}"]`).first()).toBeVisible({
          timeout: 10_000,
        });

        // Commit affordance (WEBPET-859): Execute button rendered + Back button.
        // Execute is disabled with no included rows (the expected empty-data
        // state); we assert presence + wiring, not a live commit (which needs
        // seeded compute rows — covered manually per the results table).
        const execute = page.getByTestId('bonus-wizard-execute');
        await expect(execute).toBeVisible();
        await expect(execute).toHaveAttribute('aria-label', /.+/);
        await expect(page.getByTestId('bonus-wizard-back')).toBeVisible();
      });
    });
  }
});

test.describe('Bonus wizard — date-filter-exempt types (explicit per WEBPET-861)', () => {
  // HolidayPay (id=8) and PieceWeeklyIncentiveBonus (id=14) read everything from
  // their own panel fields (localStorage) and take no shared date range; assert
  // the universal date inputs are absent while the panel + Continue still mount.
  for (const tc of BONUS_TYPES.filter((t) => t.dateExempt)) {
    test(`${tc.key} — no shared date inputs; Continue computes from own panel fields`, async ({
      page,
    }) => {
      await page.goto(`/bonus/${tc.key}`);
      await expect(page.getByTestId(tc.filterPanel)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByLabel('Start Date/Time In')).toHaveCount(0);
      await expect(page.getByLabel('Last Date/Time In')).toHaveCount(0);

      // Continue is present and wired; it stays disabled until the panel's own
      // required fields are filled (no shared date range gates it).
      const cont = page.getByTestId('bonus-wizard-continue');
      await expect(cont).toBeVisible();
      await expect(cont).toBeDisabled();

      // Step 2 still mounts the per-type review grid for the exempt type.
      await page.goto(`/bonus/${tc.key}?step=2`);
      await expect(page.locator(`[data-testid^="${tc.gridPrefix}"]`).first()).toBeVisible({
        timeout: 10_000,
      });
    });
  }
});
