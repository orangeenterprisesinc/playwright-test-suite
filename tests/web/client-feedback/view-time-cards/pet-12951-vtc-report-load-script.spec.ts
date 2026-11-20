/**
 * PET-12951 — View ▸ Time Cards: Report ▸ Load lists the screen's filter scripts and loads the picked one.
 * Data: src/data/client-feedback/pet-12951-vtc-report-load-script.json · Plan: test-plans/client-feedback/pet-12951-vtc-report-load-script.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VtcReportLoadCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { fillTemplate, mintReportScriptName, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('PET-12951 · View Time Cards: Report Load', { tag: ['@ClientFeedback', '@PET-12951'] }, () => {
    test('Report > Load on View Time Cards lists the saved filter scripts and loads the picked one', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'PET-12951' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(VtcReportLoadCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const view = pages.viewTimeCards;
        const { report } = view;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the script's name (teardown registered first), the crew's fixture rows, its day of time cards.
        const name = mintReportScriptName(deps, s.ticket);
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);

        // 1. View > Time Cards, the day with All crews (as the ticket's QA run), Apply (Report waits for a loaded filter).
        //    A Time Card Crew criterion would hide Report's Load/Save: ReportDialog shows them only when the screen hands it no
        //    extra criteria (web-pet ReportDialog.tsx:541 scriptsAvailable), and View Time Cards hands its crew criterion over.
        await view.openFromMenu();
        await view.scopeToDay(run.day);
        await view.applyFilter();
        expect(await view.totalRows(), 'the day loads at least the crew cards').toBeGreaterThanOrEqual(s.expected.rows);

        // 2. Report: choose a report, set one parameter, Save as the run-named script, close.
        await report.open();
        await report.selectReport(s.report.name);
        await report.setParam(s.report.param.label, s.report.param.value);
        await report.scripts.saveAsNew(name, fillTemplate(s.expected.savedToast, { name }), { executeReport: false });
        await report.close();

        // 3. Report again, back on another report: the dialog keeps the last pick (PET-12950), so Load proves nothing otherwise.
        await report.open();
        await report.selectReport(s.resetReport);

        // 4. Load opens the picker, empty of nothing: it lists the screen's scripts and stays disabled until one is picked.
        await report.loadButton.click();
        await expect(report.scripts.loadDialog, 'the Load Filter Script picker opens').toBeVisible();
        await expect(report.scripts.loadDialog).toHaveAccessibleName(s.expected.loadTitle);
        await expect(report.scripts.loadSubmit, 'Load is disabled until a script is picked').toBeDisabled();

        // 5. Pick the run-named script; Load enables; Load.
        const options = await report.scripts.pickScript(name);
        await expect(report.scripts.loadDialog.getByText(s.expected.emptyText), 'the picker is not the empty state').toHaveCount(0);
        await expect(report.scripts.loadEmpty, 'the picker is not the empty state').toHaveCount(0);
        expect(options, 'the picker lists the run-named script').toContain(name);
        await expect(report.scripts.loadSubmit, 'Load is enabled once a script is picked').toBeEnabled();
        await report.scripts.confirmLoad();

        // 6. Report Selection shows the script's report, its saved parameter and the loaded banner.
        await expect(report.dialog, 'the script restores its report').toHaveAccessibleName(new RegExp(`^Report: ${s.report.name} — `));
        await expect(report.paramSelect(s.report.param.label), 'the script restores its parameter').toHaveText(s.report.param.value);
        await expect(report.loadedBanner, 'the banner names the script').toContainText(fillTemplate(s.expected.bannerTemplate, { name }));

        // 7. The screen's own filter is untouched.
        await report.close();
        await view.expandFilter();
        await view.expectScopedTo(run.day);

        // 8. Delete the script on screen.
        await pages.filterScripts.gotoList();
        await pages.filterScripts.deleteScript(name, s.expected.deletedToast);
    });
});
