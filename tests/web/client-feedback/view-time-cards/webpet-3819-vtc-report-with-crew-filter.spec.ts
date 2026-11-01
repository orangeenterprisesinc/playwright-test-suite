/**
 * WEBPET-3819 — View ▸ Time Cards: Reports can be run when a Time Card Crew filter is applied.
 * Data: src/data/client-feedback/webpet-3819-vtc-report-with-crew-filter.json · Plan: test-plans/client-feedback/webpet-3819-vtc-report-with-crew-filter.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VtcReportWithCrewCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3819 · View Time Cards: reports with a crew filter', { tag: ['@ClientFeedback', '@WEBPET-3819'] }, () => {
    test('Reports can be run on View > Time Cards when a Time Card Crew filter is applied', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3819' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(VtcReportWithCrewCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const view = pages.viewTimeCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then its day of time cards seeded on screen.
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);

        // 1. Open View > Time Cards, scope the day and the Time Card Crew, apply.
        await view.openFromMenu();
        await view.scopeToDay(run.day);
        await view.scopeToTimeCardCrew(run.crew.name);
        await view.applyFilter();
        expect(await view.totalRows(), 'the crew-day loads its own cards').toBe(s.expected.rows);

        // 2. The crew criterion is applied and Report / Display Report are enabled.
        // Apply collapses the filter to "<range> · Time Card Crew: Contains · Edit filter"; reopen it to read the criterion line.
        await view.expandFilter();
        await expect(view.criterionLine('workCrew'), 'the Time Card Crew criterion is applied').toHaveText(s.expected.criterionLine);
        await expect(view.reportButton, 'Report is enabled').toBeEnabled();
        await expect(view.displayReportButton, 'Display Report is enabled').toBeEnabled();

        // 3. Hovering Report shows no "cannot apply" message.
        await view.reportButton.hover();
        await expect(view.textOnScreen(s.expected.blockedMessage), 'no "cannot apply the selection" message').toHaveCount(0);

        // 4. Report opens the report dialog.
        await view.report.open();
        await expect(view.report.dialog, 'the dialog is the report selection').toHaveAccessibleName(new RegExp(`^${s.expected.titlePrefix}`));
        await view.report.close();
    });
});
