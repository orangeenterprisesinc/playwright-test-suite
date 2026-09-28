/**
 * Catalog workflow B1 — Crew time-in, office half (the device capture is out of automated scope).
 * Data: src/data/journey-b/b01-crew-time-in.json · Plan: test-plans/journey-b/b01-crew-time-in.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { assertExpectedCards, assertTransferGrid, runJourneyBScenario } from '@utils/journeys/journeyBFlow';

test.describe('B1 · Crew time-in', { tag: ['@JourneyB', '@B1'] }, () => {
    test('[Crew Time In] Deliver a crew time-in export to the office and verify the punches.', {
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'B1' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const run = await runJourneyBScenario(scenario, { sessionApi, pages, testInfo });
        const want = scenario.expected.envelope!;
        for (const lookup of want.lookupContents!) {
            expect(run.envelope.lookupContents).toContain(lookup);
        }
        for (const code of want.employees!) {
            expect(run.envelope.employees).toContain(code);
        }
        for (const code of scenario.absentEmployees!) {
            expect(run.envelope.employees, 'the absentee must not be in the export').not.toContain(code);
        }
        expect(run.envelope.references).toHaveLength(scenario.records.length);
        expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);
        expect(run.cards).toHaveLength(scenario.expected.cards.length);
        assertExpectedCards(run, scenario.expected.cards);
        await assertTransferGrid(pages, run, scenario.expected.grid!);
    });

});
