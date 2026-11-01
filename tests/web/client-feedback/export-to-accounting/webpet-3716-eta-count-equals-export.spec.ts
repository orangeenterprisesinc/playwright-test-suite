/**
 * WEBPET-3716 — The job card count on Export to Accounting equals the number on the Export button.
 * Data: src/data/client-feedback/webpet-3716-eta-count-equals-export.json · Plan: test-plans/client-feedback/webpet-3716-eta-count-equals-export.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EtaCountEqualsExportCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay, transferCrewDay, withCrewEta } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3716 · Export to Accounting: count equals Export button', { tag: ['@ClientFeedback', '@WEBPET-3716'] }, () => {
    test('The job card count on Export to Accounting equals the number on the Export button', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3716' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(EtaCountEqualsExportCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const eta = pages.exportToAccounting;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's day seeded on screen and transferred (teardown deletes the own job cards and time cards by id).
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);
        await transferCrewDay(run, deps, seed, s.expected.jobCards);

        // 1. Export to Accounting scoped to the crew-day, Refresh; the matched count, Export button and summary agree.
        await withCrewEta(run, deps, async () => {
            await expect(eta.matchedCount).toHaveText(s.expected.matched);
            await expect(eta.exportButton).toHaveText(s.expected.exportLabel);
            await expect.poll(() => eta.recordCountText(), { message: 'the Job-cards strip' }).toContain(s.expected.jobCardsLine);
            expect(await eta.readyCount(), 'Ready').toBe(s.expected.jobCards);
        });
    });
});
