/**
 * WEBPET-3424 — Setup ▸ Ranch: the Report prints only the rows the grid filter leaves, with the filter in its header.
 * Data: src/data/client-feedback/webpet-3424-ranch-report-filtered-rows.json · Plan: test-plans/client-feedback/webpet-3424-ranch-report-filtered-rows.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { SetupRanchReportFilterCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ensureCfRanch } from '@utils/client-feedback/clientFeedbackFlow';
import { readPdfText } from '@utils/pdf/pdfText';

test.describe('WEBPET-3424 · Setup Ranch: report follows the grid filter', { tag: ['@ClientFeedback', '@WEBPET-3424'] }, () => {
    test('Setup > Ranch Report prints only the rows matching the grid filter', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3424' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(SetupRanchReportFilterCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const ranches = pages.ranch;

        // 0. Arrange: the CF RANCH fixture row.
        const ranch = await ensureCfRanch({ sessionApi, testInfo, pages });

        // 1. Open Setup > Ranch from the menu and filter the grid down to the CF ranch.
        await ranches.gotoList();
        await ranches.grid.columnFilter(s.filter.column, s.filter.value);
        await expect.poll(() => ranches.grid.totalRowCount(), { message: 'the filter leaves only the CF ranch' }).toBe(s.expected.rows);

        // 2. Report → PDF.
        await ranches.report.open();
        await expect(ranches.report.dialog).toHaveAccessibleName(new RegExp(`^${s.expected.dialogTitlePrefix}`));
        const out = await ranches.report.run('pdf', testInfo.outputPath('webpet-3424-ranch-report.pdf'));
        expect(out.status, 'POST /reports/run').toBe(200);

        // 3. The PDF names the filter and lists the grid's rows only.
        const text = await readPdfText(out.savedPath);
        expect(text, 'the header names the grid filter').toContain(s.expected.filterLine);
        expect(text).toContain(s.expected.reportTitle);
        expect(text, 'the filtered ranch is listed').toContain(ranch.name);
        expect(text.split(s.expected.rowMarker).length - 1, 'one ranch row per grid row, not every ranch').toBe(s.expected.rows);
    });
});
