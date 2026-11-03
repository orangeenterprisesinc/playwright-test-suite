/**
 * WEBPET-3817 — Reports ▸ Report Scripts: a Time In script with Date In = This week and Execute Report = Yes runs straight away with the current week.
 * Data: src/data/client-feedback/webpet-3817-report-script-this-week.json · Plan: test-plans/client-feedback/webpet-3817-report-script-this-week.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { ReportScriptThisWeekCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { fillTemplate, mintReportScriptName } from '@utils/client-feedback/clientFeedbackFlow';
import { readPdfText } from '@utils/pdf/pdfText';

test.describe('WEBPET-3817 · Report Scripts: relative week, Execute Report = Yes', { tag: ['@ClientFeedback', '@WEBPET-3817'] }, () => {
    test('A saved report script runs from Reports > Report Scripts with its relative dates and Execute Report setting', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3817' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(ReportScriptThisWeekCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const ti = pages.timeInReportSelection;
        const rs = pages.reportScripts;

        // 0. Mint the script's name; its teardown is registered before anything is saved.
        const name = mintReportScriptName({ sessionApi, testInfo, pages }, s.ticket);

        // 1. On screen: a Time In script with Date In = This week, Execute report on (checked inside saveAsNew).
        await ti.openFromMenu();
        await ti.chooseField(s.criterion.field);
        await ti.chooseMatch(s.criterion.match);
        await ti.chooseRange(s.criterion.key, s.criterion.range);
        await expect(ti.summaryRegion).toContainText(s.expected.summaryLine);
        await ti.saveButton.click();
        await expect(ti.report.dialog).toBeVisible({ timeout: 30_000 });
        await ti.scripts.saveAsNew(name, fillTemplate(s.expected.savedToast, { name }));
        await ti.report.close();

        // 2. Reports > Report Scripts: select it, Execute.
        await rs.openFromMenu();
        await rs.select(name);
        const sent = await rs.execute();

        // 3. It runs straight away: the Time In selection carries the script's criterion, the PDF viewer is up, no Report dialog.
        const viewer = await rs.viewer.waitOpen();
        expect(viewer.heading.startsWith(s.expected.viewerTitlePrefix), `viewer '${viewer.heading}'`).toBe(true);
        await expect(ti.report.dialog, 'no stop on the Report dialog').toHaveCount(0);

        // 4. Current week, not saved dates: the run sends the relative criterion, resolved when it runs.
        testInfo.annotations.push({
            type: 'api-only-evidence',
            description: 'The week is resolved server-side; the screen and PDF read "This week". The relative criterion is read from the browser\'s own POST /reports/run.',
        });
        expect(sent.criteria, 'Date In = current week, no fixed dates').toContainEqual(s.expected.runCriterion);
        const pdf = testInfo.outputPath('webpet-3817-time-in.pdf');
        await rs.viewer.download(pdf);
        expect(await readPdfText(pdf), 'the PDF prints the relative filter').toContain(s.expected.pdfFilterLine);
        await rs.viewer.close();
        // The modal viewer aria-hides the screen behind it, so the landing screen is read once it closes.
        await expect(ti.heading).toHaveText(s.expected.landingTitle);
        await expect(ti.summaryRegion).toContainText(s.expected.summaryLine);

        // 5. Delete the script on screen.
        await pages.filterScripts.gotoList();
        await pages.filterScripts.deleteScript(name, s.expected.deletedToast);
    });
});
