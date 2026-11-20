/**
 * WEBPET-3805 — Reports ▸ Input ▸ Job Card: Execute, Load and Save; Load lists the saved Job Card scripts (re-check of the 11-11 fail).
 * Data: src/data/client-feedback/webpet-3805-job-card-report-load.json · Plan: test-plans/client-feedback/webpet-3805-job-card-report-load.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JobCardReportLoadCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { fillTemplate, mintReportScriptName } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3805 · Reports Job Card: Load and Save', { tag: ['@ClientFeedback', '@WEBPET-3805'] }, () => {
    test('Reports > Input > Job Card has Load and Save for report scripts', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3805' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(JobCardReportLoadCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const jc = pages.jobCardReportSelection;
        const { scripts } = jc.report;
        const deps = { sessionApi, testInfo, pages };

        // 0. The script's name; its teardown is registered before anything is saved.
        const name = mintReportScriptName(deps, s.ticket);

        // 1. Reports > Input > Job Card shows Execute, Load and Save.
        await jc.openFromMenu();
        for (const label of s.expected.buttons) await expect(jc.button(label), `${label} is offered`).toBeVisible();

        // 2. Save opens the Report dialog with the Save menu open; save the run-named script.
        await jc.saveButton.click();
        await scripts.saveAsNew(name, fillTemplate(s.expected.savedToast, { name }));
        await jc.report.close();

        // 3. Load opens the picker alone: no Report dialog over or under it (the 11-11 fail).
        await jc.loadButton.click();
        await expect(scripts.loadDialog, 'the Load Filter Script picker opens').toBeVisible();
        await expect(scripts.loadDialog).toHaveAccessibleName(s.expected.loadTitle);
        await expect(jc.report.dialog, 'no Report dialog over or under the picker').toHaveCount(0);

        // 4. The picker is clickable and lists the saved Job Card script.
        const options = await scripts.pickScript(name);
        expect(options, 'the picker lists the run-named script').toContain(name);
        await expect(scripts.loadSubmit, 'Load is enabled once a script is picked').toBeEnabled();

        // 5. Cancel closes the picker and returns to the selection screen.
        await scripts.loadCancel.click();
        await expect(scripts.loadDialog).toBeHidden();
        await expect(jc.executeButton, 'back on the selection screen').toBeVisible();
        await expect(jc.report.dialog, 'no Report dialog is left open').toHaveCount(0);

        // 6. Delete the script on screen.
        await pages.filterScripts.gotoList();
        await pages.filterScripts.deleteScript(name, s.expected.deletedToast);
    });
});
