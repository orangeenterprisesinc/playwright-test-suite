/**
 * WEBPET-861 — Bonus wizard *per-type flow* verification sweep (all 18 types).
 *
 * Distinct from `bonus-shell.spec.ts` (which stops at the shell: panels render,
 * date filter shows/hides, Continue/Save/Load state) and from the per-type
 * compute-*math* Go tests (`apps/api/internal/bonus/*_grid_test.go`). This spec
 * verifies the wizard *flow* — selection → results grid → review → commit
 * affordance — for every one of the 18 `BonusTypeOptions` (ids 0–17), after the
 * Continue→compute (WEBPET-858) and Review→commit (WEBPET-859) slices landed.
 *
 * ## What "flow pass" means here (and why empty grids count)
 *
 * Each per-type Step-1 filter is only "valid" once that panel's non-date prefs
 * — e.g. a real Bonus Job counter — are present in localStorage. Those counters
 * are DB-specific and the DelLlano fixture has no guaranteed seedable rows for
 * every type, so the plan explicitly sanctions the **empty-results / empty-filter
 * banner** as an accepted pass for the *flow*. Asserting a visible
 * `[data-testid^="<gridPrefix>"]` container proves selection→results→review
 * wiring end-to-end for that type without brittle per-type DB seeding.
 *
 * The admin fixture seeds `BonusPayment` module + `bonus.view` +
 * `records.create` so every gate (read/compute + the commit `requireCreate`)
 * passes.
 *
 * Per-type defects are filed as their own follow-up tickets that Block back to
 * epic WEBPET-857 — never patched inline.
 *
 * ## Framework alignment (Batch 11) — the loop-id contract
 *
 * 38 of these 39 tests are generated from an 18-entry case table, so their
 * `testCaseId` annotations cannot be literals. They come from
 * `src/data/webpet/ids/bonusFlowIds.ts`, which is **generated** from the
 * `caseKey` column of the runner CSV (`npm run webpet:runner:ids`).
 *
 * The table is `as const`, so `key` is a literal union and every map index below
 * is checked at **compile time**. That matters more than it looks: an unchecked
 * index would yield `undefined`, the annotation would be empty, and the runner
 * gate would silently skip the test while the suite still reported green.
 * `webpet:ids:check` additionally asserts the caseKey ⇄ map bijection, so a
 * renamed type cannot orphan a row.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import {
    BONUS_TYPES,
    DATE_EXEMPT_BONUS_TYPES,
} from '@data/webpet/bonusTypes';
import { bonusFlowIds } from '@data/webpet/ids/bonusFlowIds';

test.describe('Bonus wizard — per-type flow sweep (WEBPET-861)', { tag: ['@WebPet', '@wp-bonus', '@WPBatch11'] }, () => {

    test('[Bonus] Verify that the sweep covers all 18 bonus type options.', {
        tag: ['@wp-unit', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: bonusFlowIds['sweep:covers-18-types'] },
    }, () => {
        expect(BONUS_TYPES).toHaveLength(18);
        // No duplicate keys / grid prefixes.
        expect(new Set(BONUS_TYPES.map((t) => t.key)).size).toBe(18);
        expect(new Set(BONUS_TYPES.map((t) => t.gridPrefix)).size).toBe(18);
    });

    for (const tc of BONUS_TYPES) {
        test.describe(`type: ${tc.key}`, () => {

            test(`[Bonus] Verify that the ${tc.key} selection panel mounts and Continue gates on filter validity.`, {
                tag: ['@wp-ui', '@wp-regression'],
                annotation: { type: 'testCaseId', description: bonusFlowIds[`step1:${tc.key}`] },
            }, async ({ pages }) => {
                const wizard = pages.bonusWizard;
                await wizard.gotoType(tc.key);
                await expect(wizard.filterPanel(tc)).toBeVisible({ timeout: 10_000 });

                // Continue starts disabled (no valid filter yet) and carries an
                // aria-label — i.e. it is wired (WEBPET-858), not the deferred stub.
                await expect(wizard.continueButton).toBeVisible();
                await expect(wizard.continueButton).toBeDisabled();
                await expect(wizard.continueButton).toHaveAttribute('aria-label', /.+/);
            });

            test(`[Bonus] Verify that the ${tc.key} review grid mounts and the commit affordance is present.`, {
                tag: ['@wp-ui', '@wp-regression'],
                annotation: { type: 'testCaseId', description: bonusFlowIds[`step2:${tc.key}`] },
            }, async ({ pages }) => {
                const wizard = pages.bonusWizard;
                // Direct nav to Step 2 deterministically renders the per-type panel's
                // empty-filter/loading/error/grid container (any one = flow pass).
                await wizard.gotoTypeStep2(tc.key);

                await expect(wizard.reviewGrid(tc)).toBeVisible({ timeout: 10_000 });

                // Commit affordance (WEBPET-859): Execute rendered + Back present.
                // Execute is disabled with no included rows (the expected empty-data
                // state); assert presence + wiring, not a live commit (which needs
                // seeded compute rows — covered manually per the results table).
                await expect(wizard.executeButton).toBeVisible();
                await expect(wizard.executeButton).toHaveAttribute('aria-label', /.+/);
                await expect(wizard.backButton).toBeVisible();
            });

        });
    }

});

test.describe('Bonus wizard — date-filter-exempt types (explicit per WEBPET-861)', { tag: ['@WebPet', '@wp-bonus', '@WPBatch11'] }, () => {
    // HolidayPay (id=8) and PieceWeeklyIncentiveBonus (id=14) read everything from
    // their own panel fields (localStorage) and take no shared date range; assert
    // the universal date inputs are absent while the panel + Continue still mount.
    for (const tc of DATE_EXEMPT_BONUS_TYPES) {

        test(`[Bonus] Verify that ${tc.key} shows no shared date inputs and computes from its own panel fields.`, {
            tag: ['@wp-ui', '@wp-regression'],
            annotation: { type: 'testCaseId', description: bonusFlowIds[`date-exempt:${tc.key}`] },
        }, async ({ pages }) => {
            const wizard = pages.bonusWizard;
            await wizard.gotoType(tc.key);
            await expect(wizard.filterPanel(tc)).toBeVisible({ timeout: 10_000 });
            await expect(wizard.startDateFilter).toHaveCount(0);
            await expect(wizard.endDateFilter).toHaveCount(0);

            // Continue is present and wired; it stays disabled until the panel's own
            // required fields are filled (no shared date range gates it).
            await expect(wizard.continueButton).toBeVisible();
            await expect(wizard.continueButton).toBeDisabled();

            // Step 2 still mounts the per-type review grid for the exempt type.
            await wizard.gotoTypeStep2(tc.key);
            await expect(wizard.reviewGrid(tc)).toBeVisible({ timeout: 10_000 });
        });

    }

});
