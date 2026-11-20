/**
 * WEBPET-3824 — Input ▸ Time In: the "Piece Summary with Rank" report runs without a 422 and ranks the employees.
 * Data: src/data/client-feedback/webpet-3824-time-in-piece-summary-rank.json · Plan: test-plans/client-feedback/webpet-3824-time-in-piece-summary-rank.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TimeInPieceRankCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { cfDay, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';
import { readPdfText } from '@utils/pdf/pdfText';

test.describe('WEBPET-3824 · Time In: Piece Summary with Rank', { tag: ['@ClientFeedback', '@WEBPET-3824'] }, () => {
    test('Time In: the Piece Summary with Rank report runs without a 422 and ranks employees', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3824' }],
    }, async ({ page, pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TimeInPieceRankCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const list = pages.timeInList;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then its day of piece-outs seeded on screen.
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);

        // 1. Input > Time In, Date In between the two past dates.
        await list.openFromMenu();
        await list.applyRange(cfDay(s.range.fromOffset), cfDay(s.range.toOffset), s.range.start, s.range.end);

        // 2. Report, choose the report.
        await list.report.open();
        await list.report.selectReport(s.report);

        // 3. PDF: no 422 "cannot be narrowed".
        const out = await list.report.run('pdf', testInfo.outputPath('webpet-3824-piece-summary-rank.pdf'));
        expect(out.status, 'POST /reports/run is not 422').toBe(s.expected.status);
        await expect(page.getByText(s.expected.rejected), 'no "cannot be narrowed" message').toHaveCount(0);

        // 4. The PDF has the crew / ranch-field / job groups, the ranked employees, an Average line and a Grand Total.
        const text = await readPdfText(out.savedPath);
        const crewAt = text.indexOf(run.crew.name);
        expect(crewAt, `the PDF has the ${run.crew.name} group`).toBeGreaterThanOrEqual(0);
        const section = text.slice(crewAt);
        expect(section, 'the ranch group').toContain(run.ranch.name);
        expect(section, 'the field group').toContain(run.field.name);
        const jobAt = section.indexOf(run.jobs.piece.name);
        expect(jobAt, `the PDF has the ${run.jobs.piece.name} group`).toBeGreaterThanOrEqual(0);
        const job = section.slice(jobAt);
        const top = job.indexOf(run.employees[0].name);
        expect(top, `${run.employees[0].name} (5 pieces) is listed`).toBeGreaterThanOrEqual(0);
        const average = job.indexOf(s.expected.average, top);
        expect(average, `the ${s.expected.average} line follows the top employee`).toBeGreaterThanOrEqual(0);
        const below = job.indexOf(run.employees[1].name, average);
        expect(below, `${run.employees[1].name} (1 piece) is ranked below the ${s.expected.average} line`).toBeGreaterThanOrEqual(0);
        expect(text, 'the Grand Total').toContain(s.expected.grandTotal);
    });
});
