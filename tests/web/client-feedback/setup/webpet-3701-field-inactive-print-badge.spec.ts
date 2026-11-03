/**
 * WEBPET-3701 — Setup ▸ Field ▸ Print Badges prints a badge for an inactive record the grid shows.
 * Data: src/data/client-feedback/webpet-3701-field-inactive-print-badge.json · Plan: test-plans/client-feedback/webpet-3701-field-inactive-print-badge.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { SetupFieldInactiveBadgeCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ensureCfInactiveField } from '@utils/client-feedback/clientFeedbackFlow';
import { readPdfText } from '@utils/pdf/pdfText';

test.describe('WEBPET-3701 · Setup Field: badge for an inactive field', { tag: ['@ClientFeedback', '@WEBPET-3701'] }, () => {
    test('Print Badges prints a badge for an inactive record that the grid shows', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3701' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(SetupFieldInactiveBadgeCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const fields = pages.field;

        // 0. Arrange: CF RANCH and the fixed inactive field under it.
        const { ranch, field } = await ensureCfInactiveField({ sessionApi, testInfo, pages });

        // 1. Setup > Field from the menu, filter the grid to the inactive field.
        await fields.gotoList();
        await fields.grid.columnFilter(s.filter.column, field.name);
        await expect.poll(() => fields.grid.totalRowCount(), { message: 'the grid shows the inactive field' }).toBe(s.expected.rows);
        await expect(fields.grid.activeCheckbox(field.name), 'the field is inactive').not.toBeChecked();

        // 2. Print Badges for the current filter → preview.
        const out = await fields.printBadges(s.expected.recordsScope, testInfo.outputPath('webpet-3701-badges.pdf'));
        expect(out.viewerHeading).toMatch(new RegExp(`^${s.expected.viewerTitlePrefix}`));

        // 3. One badge for the inactive field, not an empty report.
        const text = await readPdfText(out.savedPath);
        expect(text.split(field.name).length - 1, 'one badge for the inactive field').toBe(s.expected.badges);
        expect(text, "the badge carries the field's ranch").toContain(ranch.name);
    });
});
