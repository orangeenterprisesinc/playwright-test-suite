/**
 * WEBPET-3431 — Transfer to Job Cards: the time window opens 12:00 AM–11:59 PM and a picked End time is remembered.
 * Data: src/data/client-feedback/webpet-3431-tjc-time-window-default.json · Plan: test-plans/client-feedback/webpet-3431-tjc-time-window-default.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcTimeWindowCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';

test.describe('WEBPET-3431 · Transfer to Job Cards: time window default', { tag: ['@ClientFeedback', '@WEBPET-3431'] }, () => {
    test('the time window opens 12:00 AM–11:59 PM and a picked End time survives a reload', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3431' }],
    }, async ({ pages }, testInfo) => {
        const s = await loadScenario(TjcTimeWindowCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;

        // 1. Open Transfer to Job Cards from the left menu.
        await tjc.openFromMenu();

        // 2. Begin and End show the full-day default.
        await expect(tjc.beginTimeInput, 'Begin opens at 12:00 AM').toHaveValue(s.expected.defaultBegin);
        await expect(tjc.endTimeInput, 'End opens at 11:59 PM').toHaveValue(s.expected.defaultEnd);

        // 3. Pick a different End, reload (F5): the pick is remembered and Begin is unchanged.
        await tjc.withEndTime(s.expected.pickedEnd, async () => {
            await tjc.reload();
            await expect(tjc.endTimeInput, 'the picked End survives F5').toHaveValue(s.expected.pickedEnd);
            await expect(tjc.beginTimeInput, 'Begin is still 12:00 AM after F5').toHaveValue(s.expected.defaultBegin);
        });

        // 4. The End is back on the default once the test has put it back.
        await expect(tjc.endTimeInput, 'End is back to 11:59 PM').toHaveValue(s.expected.defaultEnd);
    });
});
