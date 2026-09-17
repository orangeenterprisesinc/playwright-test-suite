/**
 * Catalog workflow B4 — Sticker-roll assignment at day start (WEBPET-1523). Phase 2, the pack-house roll, stays withheld — see the JSON's _notes.
 * Data: src/data/journey-b/b04-sticker-roll-assignment.json · Plan: test-plans/journey-b/b04-sticker-roll-assignment.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { assertExpectedCards, assertTransferGrid, runJourneyBScenario } from '@utils/journeys/journeyBFlow';

test.describe('B4 · Sticker-roll assignment at day start', { tag: ['@JourneyB', '@B4'] }, () => {
    test('[Sticker Roll] Deliver individual time-in records carrying sticker-roll codes, verify each roll is stored against its own employee, and that the import writes no code-history row.', {
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'B4-001' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const run = await runJourneyBScenario(scenario, { sessionApi, pages, testInfo });
        try {
            // run.scenario is the loaded file with the minted roll codes substituted for {code0}/{code1}.
            const { records, expected } = run.scenario;
            const want = expected.envelope;
            expect(run.envelope.sections).toEqual(want.sections);
            expect(run.envelope.employeeSources, 'one BarcodeBadge source per employee').toEqual(want.employeeSources);
            // Each roll code is present verbatim and distinct per employee.
            expect(records[0].traceabilityCode).not.toBe(records[1].traceabilityCode);
            for (const roll of want.traceabilityCodes!) {
                expect(run.envelope.traceabilityCodes).toContain(roll);
            }
            expect(run.envelope.references).toHaveLength(records.length);
            expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);
            expect(run.cards).toHaveLength(expected.cards.length);
            assertExpectedCards(run, expected.cards);
            await assertTransferGrid(pages, run, expected.grid!);
            // Only phase 2 legitimately writes a history row, and that happens after this bracket closes.
            expect(run.codeHistory, 'the scenario hooks must bracket the import with code-history snapshots').not.toBeNull();
            expect(run.codeHistory!.after, 'B4-R9: the import must not create or modify any code-history row').toEqual(run.codeHistory!.before);
        } finally {
            await run.cleanup();
        }
    });
});
