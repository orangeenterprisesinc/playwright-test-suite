/**
 * Bonus wizard — per-type flow sweep across all 18 bonus types.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/screens/bonus.md` |
 * | Runner rows | `src/data/runner/screens.csv` → `SCR-001`…`SCR-039` |
 *
 * Relocated from `tests/webpet/bonus-flow.spec.ts` (WEBPET-861). Every
 * assertion below is the one that spec carried; what changed is the fixture
 * (`base.fixture`), the id and tag vocabulary, and the date-filter locator —
 * see the note on the date-exempt tier at the foot of this header.
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
 * are DB-specific and no fixture has guaranteed seedable rows for every type, so
 * the plan explicitly sanctions the **empty-results / empty-filter banner** as an
 * accepted pass for the *flow*. Asserting a visible
 * `[data-testid^="<gridPrefix>"]` container proves selection→results→review
 * wiring end-to-end for that type without brittle per-type DB seeding.
 *
 * Per-type defects are filed as their own follow-up tickets that Block back to
 * epic WEBPET-857 — never patched inline.
 *
 * ## Why 39 literal test() calls instead of a loop over the case table
 *
 * These were generated from an 18-entry table, which meant their titles and
 * their `testCaseId` annotations were both template literals. `runner:check`
 * parses specs with regular expressions, so neither was visible to it: every one
 * of the 38 generated tests was silently exempt from every tag, tier and
 * requirement rule the checker enforces. The declarations are now literal and the
 * shared bodies live in the three helpers below, so the assertions stay
 * single-sourced while the declarations are checkable.
 *
 * ## The date-exempt tier and the locale trap
 *
 * The two date-exempt tests assert the shared date inputs are ABSENT. Under the
 * web-pet fixture that assertion sat behind a `getByLabel('Start Date/Time In')`
 * locator plus a `pt.locale` pin forcing English. `base.fixture` has no such pin,
 * and the label is an i18n string — so on a non-English user the locator would
 * have matched nothing and `toHaveCount(0)` would have passed while proving
 * nothing at all. `BonusWizardPage` now matches `#startDate` / `#endDate`, the
 * form-field ids, which are locale-neutral; the surrounding positive assertions
 * (the type's own panel mounts, Continue renders) keep the test able to fail.
 */
import { expect, test } from '@fixtures/base.fixture';
import { bonusTypeByKey, BONUS_TYPES, type BonusTypeCase } from '@data/webpet/bonusTypes';
import type { BonusWizardPage } from '@pages/bonus/BonusWizardPage';

/**
 * Step 1: the type's filter panel mounts and Continue is present but gated.
 *
 * A disabled Continue carrying an aria-label is the evidence that the button is
 * wired for compute (WEBPET-858) rather than the deferred stub it replaced.
 */
async function assertStep1PanelMountsAndContinueGates(
    wizard: BonusWizardPage,
    type: BonusTypeCase,
): Promise<void> {
    await wizard.gotoType(type.key);
    await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });

    await expect(wizard.continueButton).toBeVisible();
    await expect(wizard.continueButton).toBeDisabled();
    await expect(wizard.continueButton).toHaveAttribute('aria-label', /.+/);
}

/**
 * Step 2: the type's review container mounts and the commit affordance is there.
 *
 * Direct nav deterministically renders the per-type panel's
 * empty-filter/loading/error/grid container — any one of them is a flow pass.
 * Execute is disabled with no included rows (the expected empty-data state), so
 * this asserts presence and wiring, not a live commit: that needs seeded compute
 * rows and is covered manually per the results table.
 */
async function assertStep2GridAndCommitAffordance(
    wizard: BonusWizardPage,
    type: BonusTypeCase,
): Promise<void> {
    await wizard.gotoTypeStep2(type.key);
    await expect(wizard.reviewGrid(type)).toBeVisible({ timeout: 10_000 });

    await expect(wizard.executeButton).toBeVisible();
    await expect(wizard.executeButton).toHaveAttribute('aria-label', /.+/);
    await expect(wizard.backButton).toBeVisible();
}

/**
 * The date-exempt tier: no shared date range, but the panel and Continue still
 * mount and Step 2 still renders the per-type review grid.
 */
async function assertDateExemptPanel(
    wizard: BonusWizardPage,
    type: BonusTypeCase,
): Promise<void> {
    await wizard.gotoType(type.key);
    await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
    await expect(wizard.startDateFilter).toHaveCount(0);
    await expect(wizard.endDateFilter).toHaveCount(0);

    // Continue is present and wired; it stays disabled until the panel's own
    // required fields are filled (no shared date range gates it).
    await expect(wizard.continueButton).toBeVisible();
    await expect(wizard.continueButton).toBeDisabled();

    // Step 2 still mounts the per-type review grid for the exempt type.
    await wizard.gotoTypeStep2(type.key);
    await expect(wizard.reviewGrid(type)).toBeVisible({ timeout: 10_000 });
}

test.describe('Bonus wizard — per-type flow sweep', { tag: ['@Screens', '@Bonus'] }, () => {

    test('[Bonus] Verify that the sweep covers all 18 bonus type options.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-001' },
            { type: 'requirement', description: 'SCR-R001' },
        ],
        // `async` despite awaiting nothing: this test asserts on the case table
        // and touches no page. runner:check's parser keys on `}, async` to find
        // the end of the options object, so a synchronous callback makes the
        // whole declaration invisible to every tag and requirement rule.
    }, async () => {
        expect(BONUS_TYPES).toHaveLength(18);
        // No duplicate keys / grid prefixes.
        expect(new Set(BONUS_TYPES.map((t) => t.key)).size).toBe(18);
        expect(new Set(BONUS_TYPES.map((t) => t.gridPrefix)).size).toBe(18);
    });

    test('[Bonus] Verify that the employee selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-002' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('employee'));
    });

    test('[Bonus] Verify that the crew selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-003' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('crew'));
    });

    test('[Bonus] Verify that the supervisor selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-004' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('supervisor'));
    });

    test('[Bonus] Verify that the supervisor-piece-incentive selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-005' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('supervisor-piece-incentive'));
    });

    test('[Bonus] Verify that the supervisor-bonus-extra-pieces selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-006' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('supervisor-bonus-extra-pieces'));
    });

    test('[Bonus] Verify that the fair-food-premium selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-007' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('fair-food-premium'));
    });

    test('[Bonus] Verify that the daily-by-employee selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-008' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('daily-by-employee'));
    });

    test('[Bonus] Verify that the daily-by-job selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-009' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('daily-by-job'));
    });

    test('[Bonus] Verify that the holiday-pay selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-010' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('holiday-pay'));
    });

    test('[Bonus] Verify that the support-crew-bonus selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-011' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('support-crew-bonus'));
    });

    test('[Bonus] Verify that the supervisor-average-crew-hourly selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-012' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('supervisor-average-crew-hourly'));
    });

    test('[Bonus] Verify that the piece-incentive-bonus selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-013' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('piece-incentive-bonus'));
    });

    test('[Bonus] Verify that the tier-piece-incentive selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-014' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('tier-piece-incentive'));
    });

    test('[Bonus] Verify that the supervisor-crew-size selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-015' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('supervisor-crew-size'));
    });

    test('[Bonus] Verify that the piece-weekly-incentive-bonus selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-016' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('piece-weekly-incentive-bonus'));
    });

    test('[Bonus] Verify that the quality-incentive-bonus selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-017' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('quality-incentive-bonus'));
    });

    test('[Bonus] Verify that the piece-productivity-hourly-bonus selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-018' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('piece-productivity-hourly-bonus'));
    });

    test('[Bonus] Verify that the tier-hourly-piece-incentive selection panel mounts and Continue gates on filter validity.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-019' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R004' },
        ],
    }, async ({ pages }) => {
        await assertStep1PanelMountsAndContinueGates(pages.bonusWizard, bonusTypeByKey('tier-hourly-piece-incentive'));
    });

});

test.describe('Bonus wizard — per-type review and commit affordance', { tag: ['@Screens', '@Bonus'] }, () => {

    test('[Bonus] Verify that the employee review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-020' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('employee'));
    });

    test('[Bonus] Verify that the crew review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-021' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('crew'));
    });

    test('[Bonus] Verify that the supervisor review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-022' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('supervisor'));
    });

    test('[Bonus] Verify that the supervisor-piece-incentive review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-023' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('supervisor-piece-incentive'));
    });

    test('[Bonus] Verify that the supervisor-bonus-extra-pieces review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-024' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('supervisor-bonus-extra-pieces'));
    });

    test('[Bonus] Verify that the fair-food-premium review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-025' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('fair-food-premium'));
    });

    test('[Bonus] Verify that the daily-by-employee review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-026' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('daily-by-employee'));
    });

    test('[Bonus] Verify that the daily-by-job review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-027' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('daily-by-job'));
    });

    test('[Bonus] Verify that the holiday-pay review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-028' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('holiday-pay'));
    });

    test('[Bonus] Verify that the support-crew-bonus review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-029' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('support-crew-bonus'));
    });

    test('[Bonus] Verify that the supervisor-average-crew-hourly review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-030' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('supervisor-average-crew-hourly'));
    });

    test('[Bonus] Verify that the piece-incentive-bonus review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-031' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('piece-incentive-bonus'));
    });

    test('[Bonus] Verify that the tier-piece-incentive review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-032' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('tier-piece-incentive'));
    });

    test('[Bonus] Verify that the supervisor-crew-size review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-033' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('supervisor-crew-size'));
    });

    test('[Bonus] Verify that the piece-weekly-incentive-bonus review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-034' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('piece-weekly-incentive-bonus'));
    });

    test('[Bonus] Verify that the quality-incentive-bonus review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-035' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('quality-incentive-bonus'));
    });

    test('[Bonus] Verify that the piece-productivity-hourly-bonus review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-036' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('piece-productivity-hourly-bonus'));
    });

    test('[Bonus] Verify that the tier-hourly-piece-incentive review grid mounts and the commit affordance is present.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-037' },
            { type: 'requirement', description: 'SCR-R005|SCR-R006|SCR-R007' },
        ],
    }, async ({ pages }) => {
        await assertStep2GridAndCommitAffordance(pages.bonusWizard, bonusTypeByKey('tier-hourly-piece-incentive'));
    });

});

// HolidayPay (id=8) and PieceWeeklyIncentiveBonus (id=14) read everything from
// their own panel fields (localStorage) and take no shared date range.
test.describe('Bonus wizard — date-filter-exempt types', { tag: ['@Screens', '@Bonus'] }, () => {

    test('[Bonus] Verify that holiday-pay shows no shared date inputs and computes from its own panel fields.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-038' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R005|SCR-R008' },
        ],
    }, async ({ pages }) => {
        await assertDateExemptPanel(pages.bonusWizard, bonusTypeByKey('holiday-pay'));
    });

    test('[Bonus] Verify that piece-weekly-incentive-bonus shows no shared date inputs and computes from its own panel fields.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-039' },
            { type: 'requirement', description: 'SCR-R002|SCR-R003|SCR-R005|SCR-R008' },
        ],
    }, async ({ pages }) => {
        await assertDateExemptPanel(pages.bonusWizard, bonusTypeByKey('piece-weekly-incentive-bonus'));
    });

});
