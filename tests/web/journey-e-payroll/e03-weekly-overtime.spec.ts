/**
 * Catalog workflow E3 — Weekly overtime (a six-day week under AG CA 2022 crosses 40 regular hours on Saturday:
 * 2 regular + 4 weekly overtime, the daily overtime never counted twice).
 * Data: src/data/journey-e/e03-weekly-overtime.json · Plan: test-plans/journey-e/e03-weekly-overtime.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyE3WeeklyOvertimeCaseSchema } from '@data/schemas/journeyEScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { assertRuleOnScreen, prepareJourneyE3, readWeekOnScreen, seedWeek, transferWeek } from '@utils/journeys/journeyEFlow';

test.describe('E3 · Weekly overtime', { tag: ['@JourneyE', '@E3'] }, () => {
    test('[Payroll] A six-day week crosses 40 regular hours on Saturday: 2 regular + 4 weekly overtime, the daily overtime never counted twice.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E3' }],
    }, async ({ sessionApi, pages }, testInfo) => {
        // Twelve punches on screen over six days, six daily transfers, View > Job Cards; each with per-action screenshots.
        test.setTimeout(900_000);

        const scenario = await loadScenario(JourneyE3WeeklyOvertimeCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };

        // 1. Arrange: fixture rows, the week's days, per-day sweep, rule + rate on the Job form, gates.
        const run = await prepareJourneyE3(scenario, deps);
        try {
            // Setup ▸ Over-Time-Rule, read only: daily 8 / 12, Ag Type off; the weekly 40 / 6 gate.
            await assertRuleOnScreen(run, deps);

            // 2. Seed on screen: per day a crew time-in at 06:00 on E3 JOB and a crew time-out.
            const seed = await seedWeek(run, deps);
            expect(seed.timeCardCounters, `${scenario.label}: all own time cards are seeded`).toHaveLength(scenario.expected.timeCards);

            // 3-4. Six daily commits, Monday to Saturday (catalog steps 1 + 2); Saturday's preview is kept as evidence.
            await transferWeek(run, deps, seed);

            // 5. Prove on screen: per-day buckets, Totals, conservation, named contrasts.
            await readWeekOnScreen(run, deps);
        } finally {
            // 6. Teardown.
            await run.cleanup();
        }
    });
});
