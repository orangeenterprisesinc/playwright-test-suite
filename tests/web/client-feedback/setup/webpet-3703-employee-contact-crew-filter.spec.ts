/**
 * WEBPET-3703 — Setup ▸ Employee filtered by Crew: Report ▸ Contact runs to a PDF instead of a 'could not be bound' error.
 * Data: src/data/client-feedback/webpet-3703-employee-contact-crew-filter.json · Plan: test-plans/client-feedback/webpet-3703-employee-contact-crew-filter.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { SetupEmployeeContactCrewCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ensureCfFixtures } from '@utils/client-feedback/clientFeedbackFlow';
import { readPdfText } from '@utils/pdf/pdfText';

test.describe('WEBPET-3703 · Setup Employee: Contact report with a Crew filter', { tag: ['@ClientFeedback', '@WEBPET-3703'] }, () => {
    test("An Employee report run with a Crew filter returns a PDF instead of a 'could not be bound' error", {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3703' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(SetupEmployeeContactCrewCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const employees = pages.employee;

        // 0. Arrange: the crew and its two fixture employees.
        const f = await ensureCfFixtures({ sessionApi, testInfo, pages }, s.fixtureCrew);

        // 1. Setup > Employee from the menu, filter the grid by the CF crew.
        await employees.gotoList();
        await employees.grid.columnPickerFilter(s.filter.column, f.crew.name);
        await expect.poll(() => employees.grid.totalRowCount(), { message: "the grid shows the crew's employees" }).toBe(s.expected.listed.length);

        // 2. Report → Contact → PDF.
        await employees.report.open();
        await employees.report.selectReport(s.report);
        const out = await employees.report.run('pdf', testInfo.outputPath('webpet-3703-employee-contact.pdf'));
        expect(out.status, 'POST /reports/run returns the PDF, not the could-not-be-bound error').toBe(200);

        // 3. No error; the header names the crew filter; only the crew's employees are listed.
        const text = await readPdfText(out.savedPath);
        expect(text).not.toContain(s.expected.errorText);
        expect(text, 'the header names the crew filter').toContain(`${s.expected.filterLinePrefix}${f.crew.name}`);
        const rows = text.split('\n').filter((l) => l.endsWith(s.expected.rowSuffix));
        expect(rows.sort(), "only the crew's employees are listed").toEqual([...s.expected.listed].sort());
    });
});
