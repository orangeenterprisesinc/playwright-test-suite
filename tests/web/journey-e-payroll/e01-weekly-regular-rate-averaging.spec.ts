/**
 * Catalog workflow E1 — Weekly regular-rate averaging (E1 DEPARTMENT's Weekly Overtime Method prices Tuesday's overtime at the
 * week's average regular rate, then re-prices it when Wednesday moves the average).
 * Data: src/data/journey-e/e01-weekly-regular-rate-averaging.json · Plan: test-plans/journey-e/e01-weekly-regular-rate-averaging.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyE1RegularRateCaseSchema } from '@data/schemas/journeyEScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareJourneyE1, readDaysOnScreen, recordCalculationDescs, seedDays, transferDays } from '@utils/journeys/journeyEFlow';

test.describe('E1 · Weekly regular-rate averaging', { tag: ['@JourneyE', '@E1'] }, () => {
    test('[Payroll] Overtime is priced at the weekly average regular rate and re-priced when a later day moves the average.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E1' }],
    }, async ({ sessionApi, pages }, testInfo) => {
        // Six punches on screen over two transfers, two View > Job Cards reads; each with per-action screenshots.
        test.setTimeout(900_000);

        const scenario = await loadScenario(JourneyE1RegularRateCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };

        // 1. Arrange: department method, crew + picker in it, jobs on the rule at their rates, gates, per-day sweep.
        const run = await prepareJourneyE1(scenario, deps);
        try {
            // 2-6. Per transfer: seed its days on screen, roster Ready + commit (catalog steps 1 + 2), then View > Job Cards.
            // Transfer 1 is Mon-Tue; transfer 2 is Wed alone and must re-price Tuesday (catalog step 3).
            for (const [index, transfer] of scenario.transfers.entries()) {
                const seed = await seedDays(run, deps, transfer.days.map((d) => d.weekday));
                expect(seed.timeCardCounters, `${scenario.label}: all own time cards of transfer ${index + 1} are seeded`).toHaveLength(transfer.toast.timeCards);
                await transferDays(run, deps, seed, index);
                await readDaysOnScreen(run, deps, index);
            }

            // 7. The regular rate itself is on no screen: calculationDesc per own card, as api-only-evidence.
            await recordCalculationDescs(run, deps);
        } finally {
            await run.cleanup();
        }
    });
});
