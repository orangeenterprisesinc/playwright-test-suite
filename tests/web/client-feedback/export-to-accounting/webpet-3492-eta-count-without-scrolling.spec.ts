/**
 * WEBPET-3492 — The Export button count equals the number of job cards matched without scrolling through the grid.
 * Data: src/data/client-feedback/webpet-3492-eta-count-without-scrolling.json · Plan: test-plans/client-feedback/webpet-3492-eta-count-without-scrolling.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EtaCountNoScrollCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay, transferCrewDay, withCrewEta } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3492 · Export to Accounting: count without scrolling', { tag: ['@ClientFeedback', '@WEBPET-3492'] }, () => {
    test('The Export button count equals the number of job cards matched without scrolling through the grid', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3492' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(EtaCountNoScrollCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const eta = pages.exportToAccounting;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's day seeded on screen and transferred (teardown deletes the own job cards and time cards by id).
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);
        await transferCrewDay(run, deps, seed, s.expected.jobCards);

        // 1. Export to Accounting scoped to the crew-day, Refresh; the counts agree before and after scrolling the grid.
        await withCrewEta(run, deps, async () => {
            await expect(eta.matchedCount).toHaveText(s.expected.matched);
            await expect(eta.exportButton).toHaveText(s.expected.exportLabel);
            await expect.poll(() => eta.recordCountText(), { message: 'the Job-cards strip' }).toContain(s.expected.jobCardsLine);
            expect(await eta.readyCount(), 'Ready').toBe(s.expected.jobCards);
            await eta.scrollGrid();
            await expect(eta.matchedCount, 'unchanged after scrolling').toHaveText(s.expected.matched);
            await expect(eta.exportButton, 'unchanged after scrolling').toHaveText(s.expected.exportLabel);
        });
    });
});
