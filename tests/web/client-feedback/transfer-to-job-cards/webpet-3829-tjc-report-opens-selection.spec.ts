/**
 * WEBPET-3829 — Transfer to Job Cards: Report opens the report selection dialog instead of running a report.
 * Data: src/data/client-feedback/webpet-3829-tjc-report-opens-selection.json · Plan: test-plans/client-feedback/webpet-3829-tjc-report-opens-selection.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcReportSelectionCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3829 · Transfer to Job Cards: Report opens the selection', { tag: ['@ClientFeedback', '@WEBPET-3829'] }, () => {
    test('Report opens the report selection dialog instead of running a report', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3829' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcReportSelectionCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then its day of time cards seeded on screen.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);

        // 1. Open Transfer to Job Cards from the left menu.
        await tjc.openFromMenu();

        // 2. Scope the day and the crew, then analyze.
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: seed.timeCardCounters.length });

        // 3. Display Report sits beside Report.
        await expect(tjc.displayReportButton, 'Display Report is on the toolbar').toBeVisible();
        await expect(tjc.displayReportButton, 'Display Report is labelled as such').toHaveText(s.expected.displayReportLabel);

        // 4. Click Report: the selection dialog opens.
        await tjc.report.open();

        // 5. The dialog is titled "Report: …".
        await expect(tjc.report.dialog, 'the dialog is the report selection').toHaveAccessibleName(new RegExp(`^${s.expected.titlePrefix}`));

        // 6. The report dropdown lists several reports.
        expect((await tjc.report.reportOptions()).length, 'the report dropdown lists reports').toBeGreaterThanOrEqual(s.expected.minReportOptions);

        // 7. Report parameters are shown.
        await expect(tjc.report.dialog.getByTestId(new RegExp(`^${s.expected.paramTestIdPrefix}`)).first(), 'a report parameter is shown').toBeVisible();

        // 8. No report ran: no PDF viewer opened.
        await expect(tjc.pdfViewer.root, 'no PDF until a format is chosen').toHaveCount(0);

        // 9. Close the dialog.
        await tjc.report.close();
    });
});
