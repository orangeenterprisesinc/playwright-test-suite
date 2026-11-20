/**
 * WEBPET-3825 — View ▸ Job Cards: the "Daily Hours" report prints hours with Time Decimal Accuracy decimals.
 * Data: src/data/client-feedback/webpet-3825-vjc-daily-hours-decimals.json · Plan: test-plans/client-feedback/webpet-3825-vjc-daily-hours-decimals.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VjcDailyHoursDecimalsCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay, transferCrewDay } from '@utils/client-feedback/clientFeedbackFlow';
import { readPdfText } from '@utils/pdf/pdfText';

test.describe('WEBPET-3825 · View Job Cards: Daily Hours decimals', { tag: ['@ClientFeedback', '@WEBPET-3825'] }, () => {
    test('Job Card: Daily Hours prints hours with the Time Decimal Accuracy decimals', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3825' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(VjcDailyHoursDecimalsCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const view = pages.viewJobCards;
        const prefs = pages.jobCardPreferences;
        const deps = { sessionApi, testInfo, pages };

        // 1. Read Time Decimal Accuracy on Job Card Preferences (read only, nothing changed).
        await prefs.openFromMenu();
        await prefs.gotoSection(s.prefs.section);
        const decimals = await prefs.readNumber(s.prefs.label);
        testInfo.annotations.push({ type: 'preference-evidence', description: `${s.prefs.label} = ${decimals} (read on screen, not changed)` });

        // 2. Arrange: the crew's fixture rows, its day of time cards, transferred to job cards.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);
        await transferCrewDay(run, deps, seed, s.jobCards);

        // 3. View > Job Cards: the day, Apply, the crew (its ids go into the report).
        await view.openFromMenu();
        await view.scopeToDay(run.day);
        await view.applyFilter();
        await view.filterByCrew(run.crew.name);

        // 4. Report > Daily Hours > PDF.
        const out = await view.runReport(s.report, 'pdf', testInfo.outputPath('webpet-3825-daily-hours.pdf'));
        expect(out.status, 'POST /reports/run').toBe(200);

        // 5. Every hour cell and the total carry exactly the preference's decimals, not cut off.
        const text = await readPdfText(out.savedPath);
        expect(text, 'the report title').toContain(s.expected.pdfTitle);
        expect(text, 'the total column').toContain(s.expected.totalLabel);
        const lines = text.split('\n').filter((l) => l.includes(run.employees[0].name));
        expect(lines.length, `the PDF has a line for ${run.employees[0].name}`).toBeGreaterThan(0);
        const cells = lines.flatMap((l) => l.match(/\d+\.\d+/g) ?? []);
        expect(cells.length, 'the day cell and the total are both printed').toBeGreaterThanOrEqual(2);
        const worked = s.workedMinutes / 60;
        for (const cell of cells) {
            expect(cell, `'${cell}' has exactly ${decimals} decimals`).toMatch(new RegExp(`^\\d+\\.\\d{${decimals}}$`));
            expect(Math.abs(Number(cell) - worked), `'${cell}' is ${worked} h to ${decimals} decimals, not truncated`).toBeLessThanOrEqual(0.5 * 10 ** -decimals + 1e-9);
        }
    });
});
