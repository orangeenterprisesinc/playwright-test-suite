/**
 * Catalog workflow E8 — Finalize gross pay (one crew day transferred cleanly, its gross pay reconciled on View > Job Cards,
 * the Payroll Summary run for it, and the read-only Test File check).
 * Data: src/data/journey-e/e08-finalize-gross-pay.json · Plan: test-plans/journey-e/e08-finalize-gross-pay.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyE8FinalizeCaseSchema } from '@data/schemas/journeyEScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    assertTransferLandingGate,
    confirmCrewDayClean,
    confirmNothingLeft,
    prepareJourneyE2,
    readDailyOvertime,
    reviewPayrollTotals,
    runPayrollSummary,
    seedLongWorkday,
    testFileIsReadOnly,
    transferCrewDay,
} from '@utils/journeys/journeyEFlow';

test.describe('E8 · Finalize gross pay', { tag: ['@JourneyE', '@E8'] }, () => {
    test('[Payroll] Transfer a crew day cleanly, reconcile its gross pay on View ▸ Job Cards and run the Payroll Summary.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E8' }],
    }, async ({ sessionApi, pages }, testInfo) => {
        // E2's setup path, the Transfer screen twice, View > Job Cards, two report runs and a Test File sheet,
        // each with per-action screenshots; a skipped-budget outcome would leave residue on a shared environment.
        test.slow();
        test.setTimeout(480_000);

        const scenario = await loadScenario(JourneyE8FinalizeCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };
        const { expected } = scenario;

        // 1. Arrange: fixture rows, rule + rate on the Job form, gates, before-phase sweep; then the transfer-landing gate.
        const run = await prepareJourneyE2(scenario, deps);
        try {
            await assertTransferLandingGate(run, deps);

            // 2. Seed on screen: crew time-in at 06:00 on E2 JOB, crew time-out at 19:00.
            const seed = await seedLongWorkday(run, deps);
            expect(seed.timeCardCounters, `${scenario.label}: both own time cards are seeded`).toHaveLength(expected.timeCards);

            // 3 + 4. Catalog step 1 before the commit: own rows Ready, no blocking exception, then the preview.
            const { candidates, previewSums } = await confirmCrewDayClean(run, deps, scenario, seed);

            // 5. Commit and land on View > Job Cards with this run's id.
            await transferCrewDay(run, deps, scenario, seed, candidates);

            // 6. Catalog step 2: the Totals bar and the crew row, reconciled with each other, the preview and the scenario.
            await reviewPayrollTotals(run, deps, scenario, previewSums);

            // 7. Catalog step 2: the Payroll Summary report, Excel and PDF.
            await runPayrollSummary(run, deps, scenario);

            // 8. Catalog step 3: Test File is read-only and changes nothing.
            await testFileIsReadOnly(run, deps, scenario);

            // 9. Catalog step 1 after the commit, back on Transfer: nothing of the crew is left to transfer.
            await confirmNothingLeft(run, deps, scenario);

            // 10. Read-back over the GET.
            const { cards } = await readDailyOvertime(run, deps);
            expect(cards, `${scenario.label}: one committed job card`).toHaveLength(expected.jobCards);
            expect.soft(Boolean(cards[0]?.exported), `${scenario.label}: the card is still not exported`).toBe(false);
        } finally {
            await run.cleanup();
        }
    });
});
