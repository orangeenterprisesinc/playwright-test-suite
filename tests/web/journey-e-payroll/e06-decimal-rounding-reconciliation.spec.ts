/**
 * Catalog workflow E6 — Decimal-rounding reconciliation (an eight-hour crew day in three 160-minute jobs, transferred
 * at Time Decimal Accuracy 4, 2 and 3; the correction lands on the last card, so the day always reads exactly 8).
 * Data: src/data/journey-e/e06-decimal-rounding-reconciliation.json · Plan: test-plans/journey-e/e06-decimal-rounding-reconciliation.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyE6RoundingCaseSchema } from '@data/schemas/journeyEScenario';
import { journeyE6Fixture } from '@data/journey-e/fixture';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    assertRoundingGates,
    prepareJourneyEOwnJobs,
    reverseOwnPass,
    seedJobChangeDay,
    setTimeDecimalAccuracy,
    transferAndReadPass,
} from '@utils/journeys/journeyEFlow';

test.describe('E6 · Decimal-rounding reconciliation', { tag: ['@JourneyE', '@E6'] }, () => {
    test('[Payroll] An eight-hour day in three 160-minute jobs reads exactly 8 at 4, 2 and 3 decimals, the correction on the last card.', {
        tag: ['@Regression', '@Demo'],
        annotation: [{ type: 'testCaseId', description: 'E6' }],
    }, async ({ sessionApi, pages }, testInfo) => {
        // Three cold job creates, three transfers, two reverses and three preference saves.
        test.setTimeout(900_000);

        const scenario = await loadScenario(JourneyE6RoundingCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };
        const { expected, passes, baselinePrecision } = scenario;

        // 1. Arrange: fixture rows, three own jobs with rule + rate on the Job form, gates, before-phase sweep, precision snapshot.
        const run = await prepareJourneyEOwnJobs(scenario, deps, journeyE6Fixture().jobs);
        try {
            // 2. Gate on screen: Round Job Change OFF and Time Decimal Accuracy at the baseline, before anything changes.
            await assertRoundingGates(run, deps, scenario);

            // 3. Seed on screen: crew time-in on each job at 06:00 / 08:40 / 11:20, crew time-out at 14:00.
            const seed = await seedJobChangeDay(run, deps, scenario.segments, scenario.timeOut);
            expect(seed.timeCardCounters, `${scenario.label}: all own time cards are seeded`).toHaveLength(expected.timeCards);

            // 4-8. Catalog steps 1-3, one pass per precision: the baseline first (nothing written), then 2 and 3, each
            // set on Job Card Preferences. A pass is read on the transfer landing and reversed, except the last.
            for (const [index, pass] of passes.entries()) {
                if (index > 0) await setTimeDecimalAccuracy(run, deps, scenario, pass.precision);
                const outcome = await transferAndReadPass(run, deps, scenario, pass, seed);
                if (index < passes.length - 1) await reverseOwnPass(run, deps, scenario, outcome);
            }

            // 9. Restore on screen: the precision goes back to the baseline and reads so after a fresh load.
            await setTimeDecimalAccuracy(run, deps, scenario, baselinePrecision);
        } finally {
            await run.cleanup();
        }
    });
});
