/**
 * Bonus wizard — form *shell* slice.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/screens/bonus.md` |
 * | Runner rows | `src/data/runner/screens.csv` → `SCR-040`…`SCR-077` |
 *
 * Relocated from `tests/webpet/bonus-shell.spec.ts` (slice-bonus-shell). Every
 * assertion below is the one that spec carried, in the same order and the same
 * describes; what changed is the fixture (`base.fixture`), the id and tag
 * vocabulary, and the date-filter locator. These 38 tests were already
 * hand-authored one `test()` each with literal ids, so nothing needed expanding.
 *
 * Scope: catalog endpoint, landing page, wizard page, Selection step's
 * universal date filter, Continue/Save/Load affordances, the per-type panel
 * field sets, the Step-2 missing-filter banners, sub-selection, and the
 * unknown-type redirect. Per-type flow behaviour is covered by
 * bonus-flow.spec.ts, not here.
 *
 * Locators live on `BonusWizardPage`, and the panel and grid testids come from
 * the shared case table in `src/data/webpet/bonusTypes.ts` rather than being
 * spelled out per test — several of those ids deliberately diverge from the
 * catalog key, and hardcoding one per test is exactly how they drift.
 *
 * ## Text-dependent assertions
 *
 * The per-type panel-field tests (`SCR-049`…`SCR-065`) and the selection-heading
 * test (`SCR-042`) match **English label text** — `getByLabel(/Bonus Unit/)` and
 * friends. The web-pet project pinned the browser locale and rewrote
 * `user.language` to 'en'; this suite does neither, so they now depend on the
 * session user's own language. That is a visible red if it ever breaks, not a
 * silent pass — unlike the date-filter negatives, which are fixed on
 * `BonusWizardPage` (see its note on `startDateFilter`).
 */
import { expect, test } from '@fixtures/base.fixture';
import { BONUS_TYPE_KEYS, bonusTypeByKey } from '@data/webpet/bonusTypes';

test.describe('Bonus shell — landing page', { tag: ['@Screens', '@Bonus'] }, () => {

    test('[Bonus] Verify that the landing page lists all 18 bonus types as navigable cards.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-040' },
            { type: 'requirement', description: 'SCR-R009' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-041' },
            { type: 'requirement', description: 'SCR-R010' },
        ],
    }, async ({ page, pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoLanding();
        await wizard.typeCard('employee').click();
        await expect(page).toHaveURL(/\/bonus\/employee$/);
    });

});

test.describe('Bonus shell — wizard Step 1 (Selection)', { tag: ['@Screens', '@Bonus'] }, () => {

    test('[Bonus] Verify that the selection step title carries the type label.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-042' },
            { type: 'requirement', description: 'SCR-R011' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('employee');
        await expect(
            wizard.selectionHeading(/Employee Bonus Payment.*1\/2 Record Selection/),
        ).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that the date filter shows for types that require it.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-043' },
            { type: 'requirement', description: 'SCR-R012' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('employee');
        await expect(wizard.startDateFilter).toBeVisible({ timeout: 10_000 });
        await expect(wizard.endDateFilter).toBeVisible();
    });

    test('[Bonus] Verify that the date filter is hidden for Holiday Pay.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-044' },
            { type: 'requirement', description: 'SCR-R002|SCR-R008' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('holiday-pay');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.startDateFilter).toHaveCount(0);
        await expect(wizard.endDateFilter).toHaveCount(0);
    });

    test('[Bonus] Verify that the date filter is hidden for Piece Weekly Incentive.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-045' },
            { type: 'requirement', description: 'SCR-R002|SCR-R008' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('piece-weekly-incentive-bonus');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.startDateFilter).toHaveCount(0);
    });

    test('[Bonus] Verify that Continue is disabled on the selection step.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-046' },
            { type: 'requirement', description: 'SCR-R003' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('employee');
        // Continue stays disabled until a selection is made. (The deferred `title`
        // "Continue is disabled…" tooltip has since been removed — the disabled
        // state itself is the behaviour under test.)
        await expect(wizard.continueButton).toBeDisabled();
    });

    test('[Bonus] Verify that Save filter and Load filter are present and enabled.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-047' },
            { type: 'requirement', description: 'SCR-R013' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('employee');
        // These were deferred (disabled) when this test was written; the filter
        // save/load feature has since shipped, so they now render enabled.
        await expect(wizard.saveFilterButton).toBeEnabled();
        await expect(wizard.loadFilterButton).toBeEnabled();
    });

    test('[Bonus] Verify that Cancel returns to the landing page.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-048' },
            { type: 'requirement', description: 'SCR-R014' },
        ],
    }, async ({ page, pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('employee');
        await wizard.cancelButton.click();
        await expect(page).toHaveURL(/\/bonus$/);
    });

    test('[Bonus] Verify that the Employee panel renders its bonus unit, rate, job and duplicate-handling fields.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-049' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-050' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-051' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-052' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-053' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-054' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-055' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-056' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-057' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-058' },
            { type: 'requirement', description: 'SCR-R015|SCR-R016' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-059' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-060' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-061' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-062' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-063' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('tier-hourly-piece-incentive');
        await wizard.gotoType(type.key);
        await expect(wizard.filterPanel(type)).toBeVisible({ timeout: 10_000 });
        await expect(wizard.field(/Bonus Job/)).toBeVisible();
        await expect(wizard.field(/Piece Count Type/)).toBeVisible();
    });

    test('[Bonus] Verify that the Piece Productivity Hourly panel renders its job and four grouping selects.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-064' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-065' },
            { type: 'requirement', description: 'SCR-R015' },
        ],
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

test.describe('Bonus shell — wizard Step 2 (Review)', { tag: ['@Screens', '@Bonus'] }, () => {

    test('[Bonus] Verify that the Daily by Employee grid panel renders its missing-filter banner on direct nav.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-066' },
            { type: 'requirement', description: 'SCR-R017' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('daily-by-employee');
        await wizard.gotoTypeStep2(type.key);
        await expect(wizard.reviewGridEmptyFilter(type)).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that the Daily by Job grid panel renders its missing-filter banner on direct nav.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-067' },
            { type: 'requirement', description: 'SCR-R017' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('daily-by-job');
        await wizard.gotoTypeStep2(type.key);
        await expect(wizard.reviewGridEmptyFilter(type)).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that the Tier Hourly Piece Incentive grid panel renders its missing-filter banner on direct nav.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-068' },
            { type: 'requirement', description: 'SCR-R017' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('tier-hourly-piece-incentive');
        await wizard.gotoTypeStep2(type.key);
        await expect(wizard.reviewGridEmptyFilter(type)).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that Back returns to Step 1.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-069' },
            { type: 'requirement', description: 'SCR-R018' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-070' },
            { type: 'requirement', description: 'SCR-R017' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        const type = bonusTypeByKey('piece-productivity-hourly-bonus');
        await wizard.gotoTypeStep2(type.key);
        await expect(wizard.reviewGridEmptyFilter(type)).toBeVisible({ timeout: 10_000 });
    });

});

test.describe('Bonus shell — sub-selection panel', { tag: ['@Screens', '@Bonus'] }, () => {

    test('[Bonus] Verify that the crew type renders the sub-selection panel.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-071' },
            { type: 'requirement', description: 'SCR-R019' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('crew');
        await expect(wizard.subSelectionPanel).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that the employee type renders the sub-selection panel.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-072' },
            { type: 'requirement', description: 'SCR-R019' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        // employee was added to subSelectionConfig in PET-277; it now renders the
        // column picker panel instead of the not-configured placeholder.
        await wizard.gotoType('employee');
        await expect(wizard.subSelectionPanel).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that daily-by-employee renders the sub-selection panel.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-073' },
            { type: 'requirement', description: 'SCR-R019' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('daily-by-employee');
        await expect(wizard.subSelectionPanel).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that holiday-pay renders the sub-selection panel.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-074' },
            { type: 'requirement', description: 'SCR-R019' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('holiday-pay');
        await expect(wizard.subSelectionPanel).toBeVisible({ timeout: 10_000 });
    });

    test('[Bonus] Verify that supervisor-crew-size renders the sub-selection panel.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-075' },
            { type: 'requirement', description: 'SCR-R019' },
        ],
    }, async ({ pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('supervisor-crew-size');
        await expect(wizard.subSelectionPanel).toBeVisible({ timeout: 10_000 });
    });

});

test.describe('Bonus shell — error paths', { tag: ['@Screens', '@Bonus'] }, () => {

    test('[Bonus] Verify that an unknown type redirects to the landing page with an error toast.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-076' },
            { type: 'requirement', description: 'SCR-R020' },
        ],
    }, async ({ page, pages }) => {
        const wizard = pages.bonusWizard;
        await wizard.gotoType('totally-bogus');
        await expect(page).toHaveURL(/\/bonus$/, { timeout: 10_000 });
        await expect(pages.toasts.errorToasts).toBeVisible({ timeout: 5_000 });
    });

    test('[Bonus] Verify that a 403 on the bonus types endpoint blocks the landing page UI.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-077' },
            { type: 'requirement', description: 'SCR-R021' },
        ],
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
