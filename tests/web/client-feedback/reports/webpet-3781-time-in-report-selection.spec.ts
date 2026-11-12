/**
 * WEBPET-3781 — Reports ▸ Input ▸ Time In: a legacy-style selection screen with Execute, Load and Save; Execute opens the report dialog.
 * Data: src/data/client-feedback/webpet-3781-time-in-report-selection.json · Plan: test-plans/client-feedback/webpet-3781-time-in-report-selection.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TimeInReportSelectionCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';

test.describe('WEBPET-3781 · Reports Time In: selection screen', { tag: ['@ClientFeedback', '@WEBPET-3781'] }, () => {
    test('Every Reports > Input screen (e.g. Time In) opens a legacy-style selection screen with Execute, Load and Save', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3781' }],
    }, async ({ pages }, testInfo) => {
        const s = await loadScenario(TimeInReportSelectionCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const ti = pages.timeInReportSelection;

        // 1. Reports > Input > Time In.
        await ti.openFromMenu();

        // 2. The breadcrumb sits under Reports.
        expect(await ti.breadcrumbTrail(), 'the breadcrumb').toEqual(s.expected.breadcrumb);

        // 3. The screen's title.
        await expect(ti.heading).toHaveText(s.expected.title);

        // 4. Search by offers a field to pick; Clear All is shown.
        await expect(ti.searchBy, 'Search by').toHaveText(s.expected.searchByPlaceholder);
        await expect(ti.button(s.expected.clearAll), `${s.expected.clearAll} is offered`).toBeVisible();

        // 5. Nothing is selected yet.
        await expect(ti.summaryRegion, 'the Filter description').toContainText(s.expected.noFilters);

        // 6. Execute, Load and Save.
        for (const label of s.expected.buttons) await expect(ti.button(label), `${label} is offered`).toBeVisible();

        // 7. Execute opens the Report dialog, and its PDF comes back.
        await ti.report.open();
        await expect(ti.report.dialog).toHaveAccessibleName(new RegExp(`^${s.expected.dialogTitlePrefix}`));
        const out = await ti.report.run('pdf', testInfo.outputPath('webpet-3781-time-in.pdf'));
        expect(out.status, 'POST /reports/run').toBe(200);
        expect(out.suggestedFilename).toMatch(/\.pdf$/i);
        expect(out.savedBytes, 'a PDF was produced').toBeGreaterThan(0);
    });
});
