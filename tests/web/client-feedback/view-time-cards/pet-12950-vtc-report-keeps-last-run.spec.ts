/**
 * PET-12950 — View ▸ Time Cards: Report Selection reopens on the last-run report and its answers.
 * Data: src/data/client-feedback/pet-12950-vtc-report-keeps-last-run.json · Plan: test-plans/client-feedback/pet-12950-vtc-report-keeps-last-run.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VtcReportKeepsLastCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('PET-12950 · View Time Cards: Report keeps the last run', { tag: ['@ClientFeedback', '@PET-12950'] }, () => {
    test('Report Selection on View Time Cards reopens on the last-run report and its answers', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'PET-12950' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(VtcReportKeepsLastCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const view = pages.viewTimeCards;
        const { report } = view;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then its day of time cards seeded on screen.
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);

        // 1. View > Time Cards, the day and the Time Card Crew, Apply.
        await view.openFromMenu();
        await view.scopeToDay(run.day);
        await view.scopeToTimeCardCrew(run.crew.name);
        await view.applyFilter();
        expect(await view.totalRows(), 'the crew-day loads its own cards').toBe(s.expected.rows);

        // 2. The first opening is the default report.
        await report.open();
        await expect(report.dialog, 'the first opening seeds the default report').toHaveAccessibleName(new RegExp(`^Report: ${s.expected.defaultReport} — `));

        // 3. Choose another report and answer one parameter.
        await report.selectReport(s.report.name);
        await report.setParam(s.report.param.label, s.report.param.value);

        // 4. Run it as a PDF; run() closes the viewer and the Report dialog.
        const out = await report.run('pdf', testInfo.outputPath('pet-12950.pdf'));
        expect(out.status, 'POST /reports/run').toBe(200);
        expect(out.savedBytes, 'a PDF was produced').toBeGreaterThan(0);

        // 5. Report again on the same visit.
        await report.open();

        // 6. It reopens on the last-run report with the saved answer, not the default.
        await expect(report.dialog, 'the dialog keeps the last-run report').toHaveAccessibleName(new RegExp(`^Report: ${s.report.name} — `));
        await expect(report.paramSelect(s.report.param.label), 'the dialog keeps the last answers').toHaveText(s.report.param.value);

        // 7. Close.
        await report.close();
    });
});
