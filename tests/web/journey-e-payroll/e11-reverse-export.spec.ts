/**
 * Catalog workflow E11 — Reverse export (one crew day exported, the export reversed, the card corrected, exported again).
 * Data: src/data/journey-e/e11-reverse-export.json · Plan: test-plans/journey-e/e11-reverse-export.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyE11ReverseExportCaseSchema } from '@data/schemas/journeyEScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    assertCardState,
    assertRunListed,
    assertTransferLandingGate,
    correctCardField,
    exportCrewDay,
    prepareJourneyE11,
    reverseOwnExport,
    seedLongWorkday,
    transferE11Day,
} from '@utils/journeys/journeyEFlow';

test.describe('E11 · Reverse export', { tag: ['@JourneyE', '@E11'] }, () => {
    test('[Payroll] Export a crew day, reverse the export, correct the card and export it again.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E11' }],
    }, async ({ sessionApi, pages }, testInfo) => {
        // E2's setup path, a transfer, two exports, a reverse and a card edit, each with per-action screenshots.
        test.setTimeout(720_000);

        const scenario = await loadScenario(JourneyE11ReverseExportCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };
        const { expected } = scenario;

        // 1. Arrange: export-residue heal, fixture rows, E11 JOB rule + rate + earning codes, gates, before-phase sweep.
        const run = await prepareJourneyE11(scenario, deps);
        try {
            await assertTransferLandingGate(run, deps);

            // 2. Seed on screen: crew time-in at 06:00 on E11 JOB, crew time-out at 14:00.
            const seed = await seedLongWorkday(run, deps);
            expect(seed.timeCardCounters, `${scenario.label}: both own time cards are seeded`).toHaveLength(expected.timeCards);

            // 3. Transfer the crew day and land on View > Job Cards with this run's id.
            await transferE11Day(run, deps, scenario, seed);

            // 4. The fresh card: its hours and amount, Exported No.
            const { reference } = await assertCardState(run, deps, scenario, { exported: false });

            // 5. Catalog step 0: export the crew's card for Payroll.
            const first = await exportCrewDay(run, deps, scenario, 'first');

            // 6. The card reads Exported Yes.
            await assertCardState(run, deps, scenario, { exported: true });

            // 7. Catalog steps 1-2: reverse exactly that run on the Reverse page.
            await reverseOwnExport(run, deps, scenario, first.runId);

            // 8. The card reads Exported No again.
            await assertCardState(run, deps, scenario, { exported: false });

            // 9. Catalog step 3: correct the card's Field on Input > Job Card.
            await correctCardField(run, deps, scenario, reference);

            // 10. Export again: a new run, the same card count.
            const second = await exportCrewDay(run, deps, scenario, 'second');
            expect(second.runId, `${scenario.label}: the re-export is a new run`).not.toBe(first.runId);

            // 11. The card reads Exported Yes with the corrected Field, and the Reverse page lists the new run.
            await assertCardState(run, deps, scenario, { exported: true, field: 'toField' });
            await assertRunListed(run, deps, scenario);
        } finally {
            await run.cleanup();
        }
    });
});
