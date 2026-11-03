/**
 * WEBPET-3462 — Reports ▸ Input ▸ Job Card: the selection screen filters by date range and Job Card Crew, and Execute opens the report dialog.
 * Data: src/data/client-feedback/webpet-3462-job-card-report-selection.json · Plan: test-plans/client-feedback/webpet-3462-job-card-report-selection.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JobCardReportSelectionCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { cfCrewCode, fillTemplate } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3462 · Reports Input Job Card: selection and Execute', { tag: ['@ClientFeedback', '@WEBPET-3462'] }, () => {
    test('Reports > Input > Job Card opens the Job Card Report Selection screen with a working selection and Execute', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3462' }],
    }, async ({ pages }, testInfo) => {
        const s = await loadScenario(JobCardReportSelectionCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const jc = pages.jobCardReportSelection;

        // 1. Reports > Input > Job Card: the selection screen with a date range, Start and End time.
        await jc.openFromMenu();
        await expect(jc.heading).toHaveText(s.expected.title);
        await expect(jc.dateRange, 'the date range').toBeVisible();
        await expect(jc.startTime).toHaveText(s.expected.startTime);
        await expect(jc.endTime).toHaveText(s.expected.endTime);
        for (const label of s.expected.buttons) await expect(jc.button(label), `${label} is offered`).toBeVisible();

        // 2. Two past days in the popup; the summary prints them in the browser's own date format.
        const from = await jc.day(s.range.fromOffset);
        const to = await jc.day(s.range.toOffset);
        await jc.dates.setRangeWithTimes(from, to, s.range.start, s.range.end);
        const dateLine = fillTemplate(s.expected.dateLineTemplate, {
            from: await jc.stamp(from, s.range.start),
            to: await jc.stamp(to, s.range.end),
        });

        // 3. Search by Job Card Crew, Match Contains, the CF crew's code.
        const code = cfCrewCode(s.fixtureCrew);
        await jc.crewContains(code);

        // 4. The Filter description names both criteria.
        await expect(jc.summaryRegion, 'the date line').toContainText(dateLine);
        await expect(jc.summaryRegion, 'the crew line').toContainText(fillTemplate(s.expected.crewLineTemplate, { text: code }));

        // 5. Execute opens the Report dialog for the selection, and its PDF comes back.
        await jc.report.open();
        await expect(jc.report.dialog).toHaveAccessibleName(new RegExp(`^${s.expected.dialogTitlePrefix}`));
        const out = await jc.report.run('pdf', testInfo.outputPath('webpet-3462-job-card.pdf'));
        expect(out.status, 'POST /reports/run').toBe(200);
        expect(out.suggestedFilename).toMatch(/\.pdf$/i);
        expect(out.savedBytes, 'a PDF was produced').toBeGreaterThan(0);
    });
});
