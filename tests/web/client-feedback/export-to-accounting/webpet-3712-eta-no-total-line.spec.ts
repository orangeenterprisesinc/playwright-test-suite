/**
 * WEBPET-3712 — Export to Accounting shows no total line under the Candidates rows.
 * Data: src/data/client-feedback/webpet-3712-eta-no-total-line.json · Plan: test-plans/client-feedback/webpet-3712-eta-no-total-line.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EtaNoTotalLineCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay, transferCrewDay, withCrewEta } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3712 · Export to Accounting: no total line', { tag: ['@ClientFeedback', '@WEBPET-3712'] }, () => {
    test('Export to Accounting shows no total line under the Candidates rows', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3712' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(EtaNoTotalLineCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const eta = pages.exportToAccounting;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's day seeded on screen and transferred (teardown deletes the own job cards and time cards by id).
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);
        await transferCrewDay(run, deps, seed, s.expected.jobCards);

        // 1. Export to Accounting scoped to the crew-day, Refresh, then read the screen.
        await withCrewEta(run, deps, async () => {
            await expect(eta.matchedCount, 'the own job cards are listed').toHaveText(`${s.expected.jobCards} matched`);
            await expect(eta.screenText(new RegExp(s.expected.totalLine)), 'no "Total N rows" line').toHaveCount(0);
            expect(await eta.counter('pending'), 'Ready').toBe(s.expected.jobCards);
            expect(await eta.counter('needsReexport'), 'Needs re-export').toBe(s.expected.needsReexport);
            expect(await eta.counter('warnings'), 'Warnings').toBe(s.expected.warnings);
        });
    });
});
