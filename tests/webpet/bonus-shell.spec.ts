/**
 * Exercises the Bonus wizard form *shell* slice (slice-bonus-shell).
 *
 * Scope: catalog endpoint, landing page, wizard page, Selection step's
 * universal date filter, Continue/Save/Load affordances, the per-type panel
 * field sets, the Step-2 missing-filter banners, sub-selection, and the
 * unknown-type redirect. Per-type compute behaviour ships in follow-up slices
 * and is covered by bonus-flow.spec.ts, not here.
 *
 * The fixture seeds an admin session (records.create + bonus.view +
 * BonusPayment module all true) so the gates pass; the no-permission
 * scenario is covered by routing the API to a 403 response.
 *
 * Framework-aligned (Batch 11): locators live on BonusWizardPage, and the panel
 * and grid testids come from the shared case table in
 * `src/data/webpet/bonusTypes.ts` rather than being spelled out per test —
 * several of those ids deliberately diverge from the catalog key, and hardcoding
 * one per test is exactly how they drift.
 *
 * Unlike bonus-flow.spec.ts these 38 tests are **hand-authored**, one `test()`
 * callsite each, so their annotations are literal ids.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import { BONUS_TYPE_KEYS, bonusTypeByKey } from '@data/webpet/bonusTypes';

test.describe('Bonus shell — landing page', { tag: ['@WebPet', '@wp-bonus', '@WPBatch11'] }, () => {

    test('[Bonus] Verify that the landing page lists all 18 bonus types as navigable cards.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0046' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoLanding();

        await expect(wizard.typesGrid).toBeVisible({ timeout: 10_000 });

        // Keys come from the shared table, so this cannot drift out of step with
        // the per-type sweep in bonus-flow.spec.ts.
        for (const key of BONUS_TYPE_KEYS) {
            await expect(wizard.typeCard(key)).toBeVisible();
        }
    });

    test('[Bonus] Verify that clicking a card navigates to that type wizard.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0047' },
    }, async ({ page, pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoLanding();
        await wizard.typeCard('employee').click();
        await expect(page).toHaveURL(/\/bonus\/employee$/);
    });

});

test.describe('Bonus shell — wizard Step 1 (Selection)', { tag: ['@WebPet', '@wp-bonus', '@WPBatch11'] }, () => {

    test('[Bonus] Verify that the selection step title carries the type label.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0048' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('employee');
        await expect(
            wizard.selectionHeading(/Employee Bonus Payment.*1\/2 Record Selection/),
        ).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that the date filter shows for types that require it.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0049' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('employee');
        await expect(wizard.startDateFilter).toBeVisible({ timeout: 10_000 });
        await expect(wizard.endDateFilter).toBeVisible();
    });

    test('[Bonus] Verify that the date filter is hidden for Holiday Pay.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0050' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('holiday-pay');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.startDateFilter).toHaveCount(0);
        await expect(wizard.endDateFilter).toHaveCount(0);
    });

    test('[Bonus] Verify that the date filter is hidden for Piece Weekly Incentive.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0051' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('piece-weekly-incentive-bonus');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.startDateFilter).toHaveCount(0);
    });

    test('[Bonus] Verify that Continue is disabled on the selection step.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0052' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('employee');
        // Continue stays disabled until a selection is made. (The deferred `title`
        // "Continue is disabled…" tooltip has since been removed — the disabled
        // state itself is the behaviour under test.)
        await expect(wizard.continueButton).toBeDisabled();
    });

    test('[Bonus] Verify that Save filter and Load filter are present and enabled.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0053' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('employee');
        // These were deferred (disabled) when this test was written; the filter
        // save/load feature has since shipped, so they now render enabled.
        await expect(wizard.saveFilterButton).toBeEnabled();
        await expect(wizard.loadFilterButton).toBeEnabled();
    });

    test('[Bonus] Verify that Cancel returns to the landing page.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0054' },
    }, async ({ page, pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('employee');
        await wizard.cancelButton.click();
        await expect(page).toHaveURL(/\/bonus$/);
    });

    test('[Bonus] Verify that the Employee panel renders its bonus unit, rate, job and duplicate-handling fields.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0055' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('employee');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/Bonus Unit/)).toBeVisible();
        await expect(wizard.field(/Rate/)).toBeVisible();
        // "Bonus Job" is an FK ParentPicker whose label isn't getByLabel-associated
        // (unlike the plain inputs above) — assert its label text renders instead.
        await expect(wizard.fieldLabelText(/Bonus Job/)).toBeVisible();
        await expect(wizard.field(/Duplicate Handling/)).toBeVisible();
    });

    test('[Bonus] Verify that the Crew panel renders its bonus unit, maximum, minimum-percent and job fields.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0056' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('crew');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/Bonus Unit/)).toBeVisible();
        await expect(wizard.field(/Maximum Bonus/)).toBeVisible();
        await expect(wizard.field(/Minimum Bonus Percent/)).toBeVisible();
        await expect(wizard.fieldLabelText(/Bonus Job/)).toBeVisible();
    });

    test('[Bonus] Verify that the Support Crew panel renders its crew, extra-pay job and support job fields.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0057' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('support-crew-bonus');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/Support Crew/)).toBeVisible();
        await expect(wizard.field(/Extra Pay Job/)).toBeVisible();
        await expect(wizard.field(/Support Job/)).toBeVisible();
        // Ranch/Field visibility depends on the seeded fieldEntryRequired
        // preference; the panel mounts regardless. Don't strictly assert
        // visibility on those two.
    });

    test('[Bonus] Verify that the Fair Food Premium panel renders its total, job-date and job fields.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0058' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('fair-food-premium');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/Total Premium Pay/)).toBeVisible();
        await expect(wizard.field(/Bonus Job Date/)).toBeVisible();
        await expect(wizard.field(/Bonus Job/)).toBeVisible();
    });

    test('[Bonus] Verify that the Holiday Pay panel renders its qualification, hours, multiplier and job fields.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0059' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('holiday-pay');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/Qualification Period/)).toBeVisible();
        await expect(wizard.field(/Holiday Job/)).toBeVisible();
        await expect(wizard.field(/Number of Hours/)).toBeVisible();
        await expect(wizard.field(/Holiday Name/)).toBeVisible();
        await expect(wizard.field(/Holiday Date/)).toBeVisible();
        await expect(wizard.field(/Rate Multiplier/)).toBeVisible();
    });

    test('[Bonus] Verify that the Piece Weekly Incentive panel renders its bonus, exclusion and work job fields.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0060' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('piece-weekly-incentive-bonus');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/Bonus Job/)).toBeVisible();
        await expect(wizard.field(/Exclusion Job/)).toBeVisible();
        await expect(wizard.field(/Minimum Pieces per Hour/)).toBeVisible();
        await expect(wizard.field(/Work Job/)).toBeVisible();
    });

    test('[Bonus] Verify that the Supervisor panel renders its supervisor, minimum-rate, job and divisor fields.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0061' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('supervisor');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/^Supervisor /)).toBeVisible();
        await expect(wizard.field(/Minimum Rate/)).toBeVisible();
        await expect(wizard.field(/Bonus Job/)).toBeVisible();
        await expect(wizard.fieldLabelText(/Crew Size Divisor/)).toBeVisible();
    });

    test('[Bonus] Verify that the Supervisor Piece Incentive panel renders its five fields.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0062' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('supervisor-piece-incentive');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/^Supervisor /)).toBeVisible();
        await expect(wizard.field(/Piece Multiplier/)).toBeVisible();
        await expect(wizard.field(/Piece Rate/)).toBeVisible();
        await expect(wizard.field(/Bonus Job/)).toBeVisible();
        await expect(wizard.field(/Work Job/)).toBeVisible();
    });

    test('[Bonus] Verify that the Piece Incentive panel renders its bonus job field.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0063' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('piece-incentive-bonus');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        // Bonus Job is always present; Ranch/Field are gated on the seeded
        // fieldEntryRequired preference, so don't strictly assert on those.
        await expect(wizard.field(/Bonus Job/)).toBeVisible();
    });

    test('[Bonus] Verify that the Quality Incentive panel renders its job, percent and deferral note.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0064' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('quality-incentive-bonus');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/Bonus Job/)).toBeVisible();
        await expect(wizard.field(/Quality Percent/)).toBeVisible();
        await expect(wizard.qualityMeasurementDeferred).toBeVisible();
    });

    test('[Bonus] Verify that the Supervisor Average Crew Hourly panel renders its three fields.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0065' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('supervisor-average-crew-hourly');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/^Supervisor /)).toBeVisible();
        await expect(wizard.field(/Extra Hourly Pay/)).toBeVisible();
        await expect(wizard.field(/Bonus Job/)).toBeVisible();
    });

    test('[Bonus] Verify that the Supervisor Crew Size panel renders its four fields.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0066' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('supervisor-crew-size');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/Foreman Job/)).toBeVisible();
        await expect(wizard.field(/Hourly Rate/)).toBeVisible();
        await expect(wizard.field(/Required Crew Size/)).toBeVisible();
        await expect(wizard.field(/Bonus Job/)).toBeVisible();
    });

    test('[Bonus] Verify that the Supervisor Bonus Extra Pieces panel renders its five fields.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0067' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('supervisor-bonus-extra-pieces');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/^Supervisor /)).toBeVisible();
        await expect(wizard.field(/Daily Target Pieces/)).toBeVisible();
        await expect(wizard.field(/Bonus Job/)).toBeVisible();
        await expect(wizard.field(/Rate per Extra Piece/)).toBeVisible();
        await expect(wizard.field(/Work Job/)).toBeVisible();
    });

    test('[Bonus] Verify that the Tier Piece Incentive panel renders ranch, field and bonus job with no preference gate.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0068' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('tier-piece-incentive');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        // Ranch/Field render unconditionally for this panel (no preference gate).
        await expect(wizard.fieldLabelText(/^Ranch/)).toBeVisible();
        await expect(wizard.fieldLabelText(/^Field/)).toBeVisible();
        await expect(wizard.fieldLabelText(/Bonus Job/)).toBeVisible();
    });

    test('[Bonus] Verify that the Tier Hourly Piece Incentive panel renders its job and piece-count-type fields.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0069' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('tier-hourly-piece-incentive');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/Bonus Job/)).toBeVisible();
        await expect(wizard.field(/Piece Count Type/)).toBeVisible();
    });

    test('[Bonus] Verify that the Piece Productivity Hourly panel renders its job and four grouping selects.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0070' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('piece-productivity-hourly-bonus');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/Bonus Job/)).toBeVisible();
        await expect(wizard.fieldLabelText(/Group by Day/)).toBeVisible();
        await expect(wizard.fieldLabelText(/Group by Job/)).toBeVisible();
        await expect(wizard.fieldLabelText(/Group by Field/)).toBeVisible();
        await expect(wizard.fieldLabelText(/Change Job Card Rate/)).toBeVisible();
    });

    test('[Bonus] Verify that the Daily by Employee panel renders its hours, job and duplicate-handling fields.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0071' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('daily-by-employee');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/Extra Hours \/ Day/)).toBeVisible();
        await expect(wizard.fieldLabelText(/Bonus Job/)).toBeVisible();
        await expect(wizard.field(/Duplicate Handling/)).toBeVisible();
    });

});

test.describe('Bonus shell — wizard Step 2 (Review)', { tag: ['@WebPet', '@wp-bonus', '@WPBatch11'] }, () => {

    test('[Bonus] Verify that the Daily by Employee grid panel renders its missing-filter banner on direct nav.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0072' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('daily-by-employee');
        await wizard.gotoTypeStep2(type.key);
        await expect(wizard.reviewGridEmptyFilter(type)).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that the Daily by Job grid panel renders its missing-filter banner on direct nav.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0073' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('daily-by-job');
        await wizard.gotoTypeStep2(type.key);
        await expect(wizard.reviewGridEmptyFilter(type)).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that the Tier Hourly Piece Incentive grid panel renders its missing-filter banner on direct nav.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0074' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('tier-hourly-piece-incentive');
        await wizard.gotoTypeStep2(type.key);
        await expect(wizard.reviewGridEmptyFilter(type)).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that Back returns to Step 1.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0075' },
    }, async ({ page, pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('tier-hourly-piece-incentive');
        await wizard.gotoTypeStep2(type.key);
        await wizard.backButton.click();
        // URL no longer carries ?step (Step 1 is canonical).
        await expect(page).not.toHaveURL(/\?step=2/);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 5_000 });
    });

    test('[Bonus] Verify that the Piece Productivity Hourly grid panel renders its missing-filter banner on direct nav.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0076' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('piece-productivity-hourly-bonus');
        await wizard.gotoTypeStep2(type.key);
        await expect(wizard.reviewGridEmptyFilter(type)).toBeVisible({ timeout: 10_000 });
    });

});

test.describe('Bonus shell — sub-selection panel', { tag: ['@WebPet', '@wp-bonus', '@WPBatch11'] }, () => {

    test('[Bonus] Verify that the crew type renders the sub-selection panel.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0077' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('crew');
        await expect(wizard.subSelectionPanel).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that the employee type renders the sub-selection panel.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0078' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        // employee was added to subSelectionConfig in PET-277; it now renders the
        // column picker panel instead of the not-configured placeholder.
        await wizard.gotoType('employee');
        await expect(wizard.subSelectionPanel).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that daily-by-employee renders the sub-selection panel.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0079' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('daily-by-employee');
        await expect(wizard.subSelectionPanel).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that holiday-pay renders the sub-selection panel.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0080' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('holiday-pay');
        await expect(wizard.subSelectionPanel).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that supervisor-crew-size renders the sub-selection panel.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0081' },
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('supervisor-crew-size');
        await expect(wizard.subSelectionPanel).toBeVisible({ timeout: 10_000 });
    });

});

test.describe('Bonus shell — error paths', { tag: ['@WebPet', '@wp-bonus', '@WPBatch11'] }, () => {

    test('[Bonus] Verify that an unknown type redirects to the landing page with an error toast.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0082' },
    }, async ({ page, pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('totally-bogus');
        await expect(page).toHaveURL(/\/bonus$/, { timeout: 10_000 });
        await expect(pages.toasts.errorToasts).toBeVisible({ timeout: 5_000 });
    });

    test('[Bonus] Verify that a 403 on the bonus types endpoint blocks the landing page UI.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0083' },
    }, async ({ page, pages }) => {
        const wizard = pages.bonusWizard;
        await page.route('**/api/bonus/types', (route) =>
            route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Permission denied.' }),
            }),
        );
        await wizard.gotoLanding();
        // The grid never renders; the page surfaces the error message via the
        // global handler (toast) and the local error branch.
        await expect(wizard.typesGrid).toHaveCount(0);
    });

});
