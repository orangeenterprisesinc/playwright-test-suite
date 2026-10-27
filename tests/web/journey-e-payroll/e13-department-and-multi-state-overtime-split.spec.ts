/**
 * Catalog workflow E13 — Department and multi-state overtime split (two jobs on two wage-order overtime rules;
 * a ten-hour crew day reads 6 + 4 regular hours, no overtime, instead of the pooled 8 + 2).
 * Data: src/data/journey-e/e13-department-and-multi-state-overtime-split.json · Plan: test-plans/journey-e/e13-department-and-multi-state-overtime-split.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyE13WageOrderSplitCaseSchema } from '@data/schemas/journeyEScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    assertWageOrderGates,
    confirmSplitPreview,
    ensureE13Rules,
    prepareJourneyE13,
    recordWageOrderEvidence,
    seedJobChangeDay,
    transferAndReadSplit,
} from '@utils/journeys/journeyEFlow';

test.describe('E13 · Department and multi-state overtime split', { tag: ['@JourneyE', '@E13'] }, () => {
    test('[Payroll] Two jobs on two wage-order rules split a ten-hour day into 6 + 4 regular hours with no overtime.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E13' }],
    }, async ({ sessionApi, pages }, testInfo) => {
        // Rules and jobs on screen, three punches, the Transfer screen twice, View > Job Cards; each with per-action screenshots.
        test.setTimeout(600_000);

        const scenario = await loadScenario(JourneyE13WageOrderSplitCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };

        // 1. Setup ▸ Over-Time-Rule: the two wage-order rules exist and read back as the fixture says.
        await ensureE13Rules(scenario, deps);

        // 2. Arrange: fixture rows, rule + rate on each Job form, before-phase sweep.
        const run = await prepareJourneyE13(scenario, deps);
        try {
            // 3. Gates: Group Overtime by Wage Order = Yes on its screen; no rule on the field or employee.
            await assertWageOrderGates(run, deps, scenario);

            // 4. Seed on screen: crew time-in on Job A at 06:00, on Job B at 12:00, crew time-out at 16:00.
            const seed = await seedJobChangeDay(run, deps, scenario.segments.map((s) => ({ job: s.job, start: s.start })), scenario.timeOut);
            expect(seed.timeCardCounters, `${scenario.label}: all own time cards are seeded`).toHaveLength(scenario.expected.timeCards);

            // 5. Catalog step 2 before the commit: the preview already splits 6 + 4 with no overtime.
            const candidates = await confirmSplitPreview(run, deps, scenario, seed);

            // 6. Commit, then View ▸ Job Cards: each job's row and the Totals bar carry no overtime.
            await transferAndReadSplit(run, deps, scenario, seed, candidates);

            // 7. Evidence no screen shows, and the deferred / out-of-scope reasons.
            await recordWageOrderEvidence(run, deps, scenario);
        } finally {
            await run.cleanup();
        }
    });
});
