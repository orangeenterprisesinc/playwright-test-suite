/**
 * WEBPET-3835 — Transfer to Job Cards: the report selection dialog closes with an X top-right and has no Cancel.
 * Data: src/data/client-feedback/webpet-3835-tjc-report-close-x.json · Plan: test-plans/client-feedback/webpet-3835-tjc-report-close-x.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcReportCloseXCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';

test.describe('WEBPET-3835 · Transfer to Job Cards: report dialog closes with an X', { tag: ['@ClientFeedback', '@WEBPET-3835'] }, () => {
    test('the report dialog closes with an X top-right and has no Cancel', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3835' }],
    }, async ({ pages }, testInfo) => {
        const s = await loadScenario(TjcReportCloseXCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const tol = s.expected.cornerTolerancePx;

        // 1. Open Transfer to Job Cards from the left menu.
        await tjc.openFromMenu();

        // 2. Click Report: the selection dialog opens (Report is enabled on an empty screen).
        await tjc.report.open();
        await expect(tjc.report.dialog, 'the dialog is the report selection').toHaveAccessibleName(new RegExp(`^${s.expected.titlePrefix}`));

        // 3. The X sits in the dialog's top-right corner.
        const { dialog, close } = await tjc.reportCornerBoxes();
        expect(close.x + close.width, 'the X is inside the dialog right edge').toBeLessThanOrEqual(dialog.x + dialog.width);
        expect(close.x + close.width, 'the X is near the dialog right edge').toBeGreaterThanOrEqual(dialog.x + dialog.width - tol);
        expect(close.y, 'the X is inside the dialog top edge').toBeGreaterThanOrEqual(dialog.y);
        expect(close.y, 'the X is near the dialog top edge').toBeLessThanOrEqual(dialog.y + tol);

        // 4. The button row has no Cancel.
        const labels = await tjc.report.buttonRowLabels();
        expect(labels, 'the button row keeps its actions').toEqual(expect.arrayContaining(s.expected.buttonRowIncludes));
        expect(labels, 'the button row has no Cancel').not.toContain(s.expected.absentButton);
        await expect(tjc.report.cancelButton, 'no Cancel button in the dialog').toHaveCount(0);

        // 5. The X closes the dialog.
        await tjc.report.closeX.click();
        await expect(tjc.report.dialog, 'the X closes the dialog').toBeHidden();
    });
});
