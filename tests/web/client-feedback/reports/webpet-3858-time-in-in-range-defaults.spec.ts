/**
 * WEBPET-3858 — Reports ▸ Input ▸ Time In: Date In ▸ In range defaults From to today 12:00 AM and To to today 11:59 PM.
 * Data: src/data/client-feedback/webpet-3858-time-in-in-range-defaults.json · Plan: test-plans/client-feedback/webpet-3858-time-in-in-range-defaults.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TimeInInRangeDefaultsCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { fillTemplate } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3858 · Reports Time In: In range defaults', { tag: ['@ClientFeedback', '@WEBPET-3858'] }, () => {
    test('Choosing In range on a Reports date filter defaults From to 12:00 AM and To to 11:59 PM', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3858' }],
    }, async ({ pages }, testInfo) => {
        const s = await loadScenario(TimeInInRangeDefaultsCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const ti = pages.timeInReportSelection;

        // 1. Reports > Input > Time In; Search by Date In, Match In range.
        await ti.openFromMenu();
        await ti.chooseField(s.criterion.field);
        await ti.chooseMatch(s.criterion.match);

        // 2. From and To hold today at 00:00 and 23:59 (datetime-local values, the same in every locale).
        const today = await ti.day(0);
        await expect(ti.from(s.criterion.key), 'From').toHaveValue(`${today}T${s.expected.fromTime}`);
        await expect(ti.to(s.criterion.key), 'To').toHaveValue(`${today}T${s.expected.toTime}`);

        // 3. The Filter description, with the stamps formatted as the browser formats them.
        const line = fillTemplate(s.expected.summaryTemplate, {
            from: await ti.stamp(today, s.expected.fromTime),
            to: await ti.stamp(today, s.expected.toTime),
        });
        await expect(ti.summaryRegion).toContainText(line);
    });
});
