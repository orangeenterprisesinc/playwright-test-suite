/**
 * WEBPET-3930 — The totals on Export to Accounting sit above the Candidates grid.
 * Data: src/data/client-feedback/webpet-3930-eta-totals-above-grid.json · Plan: test-plans/client-feedback/webpet-3930-eta-totals-above-grid.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EtaTotalsAboveGridCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay, transferCrewDay, withCrewEta } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3930 · Export to Accounting: totals above the grid', { tag: ['@ClientFeedback', '@WEBPET-3930'] }, () => {
    test('The totals on Export to Accounting sit above the Candidates grid', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3930' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(EtaTotalsAboveGridCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const eta = pages.exportToAccounting;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's day seeded on screen and transferred (teardown deletes the own job cards and time cards by id).
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);
        await transferCrewDay(run, deps, seed, s.expected.jobCards);

        // 1. Export to Accounting scoped to the crew-day, Refresh; the record-count strip and Totals line sit above the grid.
        await withCrewEta(run, deps, async () => {
            for (const l of s.expected.stripLabels) await expect(eta.recordCountLine).toContainText(l);
            for (const l of s.expected.totalsLabels) await expect(eta.totalsLine).toContainText(l);
            const grid = (await eta.grid.boundingBox())!;
            const strip = (await eta.recordCountLine.boundingBox())!;
            const totals = (await eta.totalsLine.boundingBox())!;
            expect(strip.y + strip.height, 'strip above the grid').toBeLessThanOrEqual(grid.y);
            expect(totals.y + totals.height, 'totals above the grid').toBeLessThanOrEqual(grid.y);
        });
    });
});
