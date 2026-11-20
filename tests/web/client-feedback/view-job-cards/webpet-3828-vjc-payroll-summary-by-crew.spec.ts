/**
 * WEBPET-3828 — View ▸ Job Cards: "Payroll Summary by Crew" opens a PDF with the crew group, payroll lines and totals.
 * Data: src/data/client-feedback/webpet-3828-vjc-payroll-summary-by-crew.json · Plan: test-plans/client-feedback/webpet-3828-vjc-payroll-summary-by-crew.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VjcPayrollByCrewCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { cfDay, prepareCfRun, seedCrewDay, transferCrewDay } from '@utils/client-feedback/clientFeedbackFlow';
import { readPdfText } from '@utils/pdf/pdfText';

test.describe('WEBPET-3828 · View Job Cards: Payroll Summary by Crew', { tag: ['@ClientFeedback', '@WEBPET-3828'] }, () => {
    test('View Job Cards: Payroll Summary by Crew opens a PDF with the crew group lines and totals', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3828' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(VjcPayrollByCrewCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const view = pages.viewJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, its day of time cards, transferred to job cards.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);
        await transferCrewDay(run, deps, seed, s.jobCards);

        // 1. View > Job Cards: a past week around the day, Apply, the crew.
        await view.openFromMenu();
        await view.scopeToRange(cfDay(s.range.fromOffset), cfDay(s.range.toOffset));
        await view.applyFilter();
        await view.filterByCrew(run.crew.name);

        // 2. Report: the monetary report is offered (it is hidden without rates.view); choose it and run the PDF.
        await view.report.open();
        expect(await view.report.reportOptions(), 'the monetary report is offered to this user').toContain(s.report);
        await view.report.selectReport(s.report);
        const out = await view.report.run('pdf', testInfo.outputPath('webpet-3828-payroll-summary-by-crew.pdf'));
        expect(out.status, 'POST /reports/run').toBe(s.expected.status);
        expect(out.savedBytes, 'a PDF was produced').toBeGreaterThan(0);

        // 3. The PDF has the crew group, a payroll line per employee and the totals.
        const text = await readPdfText(out.savedPath);
        expect(text, 'the crew group').toContain(run.crew.name);
        for (const employee of run.employees) expect(text, `a payroll line for ${employee.name}`).toContain(employee.name);
        for (const total of s.expected.totals) expect(text, `the ${total} line`).toContain(total);
    });
});
