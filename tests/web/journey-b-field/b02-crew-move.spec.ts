/**
 * Catalog workflow B2 — Crew move and job change, office half.
 * Data: src/data/journey-b/b02-crew-move.json · Plan: test-plans/journey-b/b02-crew-move-and-job-change.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { assertExpectedCards, assertTransferGrid, runJourneyBScenario } from '@utils/journeys/journeyBFlow';

test.describe('B2 · Crew move and job change', { tag: ['@JourneyB', '@B2'] }, () => {
    test('[Crew Move] Deliver a post-move export and verify movers and the member left behind.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B2-001' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const run = await runJourneyBScenario(scenario, { sessionApi, pages, testInfo });
        try {
            const want = scenario.expected.envelope;
            for (const code of want.fields!) {
                expect(run.envelope.fields).toContain(code);
            }
            for (const code of want.jobs!) {
                expect(run.envelope.jobs).toContain(code);
            }
            // One punch per crew member — a move reassigns, it never adds.
            expect(run.envelope.references).toHaveLength(scenario.records.length);
            expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);
            expect(run.cards).toHaveLength(scenario.expected.cards.length);
            assertExpectedCards(run, scenario.expected.cards);
            await assertTransferGrid(pages, run, scenario.expected.grid!);
        } finally {
            await run.cleanup();
        }
    });
});
