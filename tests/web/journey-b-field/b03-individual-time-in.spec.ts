/**
 * Catalog workflow B3 — Individual time-in and duplicate-range correction.
 * Data: src/data/journey-b/b03-individual-time-in.json · Plan: test-plans/journey-b/b03-individual-time-in.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { assertExpectedCards, assertTransferGrid, runJourneyBScenario } from '@utils/journeys/journeyBFlow';

test.describe('B3 · Individual time-in and duplicate-range correction', { tag: ['@JourneyB', '@B3'] }, () => {
    test('[Individual Time In] Deliver an individual time-in export with a corrected and a new record and verify both punches.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B3-001' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const run = await runJourneyBScenario(scenario, { sessionApi, pages, testInfo });
        const want = scenario.expected.envelope!;
        expect(run.envelope.sections).toEqual(want.sections);
        expect(run.envelope.employeeSources, 'two BarcodeBadge sources').toEqual(want.employeeSources);
        expect(run.envelope.referenceParts).toEqual(want.referenceParts);
        for (const tag of want.absentTags!) {
            expect(run.envelope.tagNames, 'sample fidelity: TimeIn derives from DateIn+TimeIn, no CardType tag').not.toContain(tag);
        }
        expect(run.envelope.gpsFixes, 'exactly one record carries a GPS fix').toBe(want.gpsFixes);
        expect(run.envelope.references).toHaveLength(scenario.records.length);
        expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);
        expect(run.cards).toHaveLength(scenario.expected.cards.length);
        assertExpectedCards(run, scenario.expected.cards);
        await assertTransferGrid(pages, run, scenario.expected.grid!);
    });
});
