/**
 * Catalog workflow E5 — Weekly minimum-wage guarantee on piece (E5 DEPARTMENT's Minimum Wage Method "Each Week" tops a short
 * piece week up to hours x minimum wage for the week, not per day, across one Mon-Tue transfer).
 * Data: src/data/journey-e/e05-weekly-minimum-wage-guarantee-on-piece.json · Plan: test-plans/journey-e/e05-weekly-minimum-wage-guarantee-on-piece.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyE5MinimumWageCaseSchema } from '@data/schemas/journeyEScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareJourneyE5, readPieceWeekOnScreen, recordMakeUpEvidence, seedPieceDays, transferPieceWeek } from '@utils/journeys/journeyEFlow';

test.describe('E5 · Weekly minimum-wage guarantee on piece', { tag: ['@JourneyE', '@E5'] }, () => {
    test('[Payroll] A piece week below minimum wage is topped up to hours x minimum wage for the week, not per day.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E5' }],
    }, async ({ sessionApi, pages }, testInfo) => {
        // Six punches on screen, one Mon-Tue transfer, one View > Job Cards read; each with per-action screenshots.
        test.setTimeout(900_000);

        const scenario = await loadScenario(JourneyE5MinimumWageCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };

        // 1. Arrange: minimum wage, department (wage + Each Week), crew + picker in it, piece job, gates, per-day sweep.
        const run = await prepareJourneyE5(scenario, deps);
        try {
            // 2. Seed Mon and Tue on screen: time-in, crew piece-out, time-out per day.
            const seed = await seedPieceDays(run, deps);
            expect(seed.timeCardCounters, `${scenario.label}: all own time cards are seeded`).toHaveLength(scenario.expected.timeCards);

            // 3. One Mon-Tue commit by Reference after the crew scope.
            await transferPieceWeek(run, deps, seed);

            // 4. Read the week on screen: Totals Amount against the Each Week, Each Day and Never values.
            const cards = await readPieceWeekOnScreen(run, deps);

            // 5. The make-up's composition is on no screen: record it as evidence (calibrates where the 24.00 lands).
            await recordMakeUpEvidence(run, deps, cards);
        } finally {
            await run.cleanup();
        }
    });
});
