/**
 * Catalog workflow E10 — Export-identifier matching (export by the Job's identifier, reverse, correct the identifier, export again).
 * Data: src/data/journey-e/e10-export-identifier-matching.json · Plan: test-plans/journey-e/e10-export-identifier-matching.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyE10ExportIdentifierCaseSchema } from '@data/schemas/journeyEScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    assertFileIdentifier,
    assertJobIdentifier,
    assertOwnCards,
    confirmCrewExport,
    exportCrewDay,
    openCrewExport,
    prepareJourneyE10,
    readRecentExportFile,
    reverseOwnExport,
    seedJobChangeDay,
    setJobExportIdentifier,
    testFileOnExport,
    transferExportDay,
} from '@utils/journeys/journeyEFlow';

test.describe('E10 · Export-identifier matching', { tag: ['@JourneyE', '@E10'] }, () => {
    test('[Payroll] Export a job by its export identifier, reverse it, correct the identifier and export it again.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E10' }],
    }, async ({ sessionApi, pages }, testInfo) => {
        // A transfer, two exports with two downloads, a reverse and two Job-form identifier saves.
        test.setTimeout(900_000);

        const scenario = await loadScenario(JourneyE10ExportIdentifierCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };
        const { expected, identifiers } = scenario;

        // 1. Arrange: export-residue heal, fixture rows, E10 JOB rule + rate + earning code + Export Identifier E10PH1, gates, sweeps.
        const run = await prepareJourneyE10(scenario, deps);
        try {
            const cards = (exported: boolean) => ({
                label: scenario.label,
                exported,
                exportedCell: exported ? expected.exportedYes : expected.exportedNo,
                rows: [{ job: run.jobs.job.name, regular: expected.regularHours, overtime: expected.overtimeHours, amount: expected.totalAmount }],
            });

            // 2. Catalog step 1: the Job form shows an identifier that is not the name.
            await assertJobIdentifier(run, deps, { label: scenario.label, job: 'job', identifier: identifiers.initial });

            // 3. Seed on screen: crew time-in 06:00 on E10 JOB, crew time-out 14:00; transfer the day.
            const seed = await seedJobChangeDay(run, deps, [{ job: 'job', start: scenario.capture.timeIn }], scenario.capture.timeOut);
            expect(seed.timeCardCounters, `${scenario.label}: the own time cards are seeded`).toHaveLength(expected.timeCards);
            await transferExportDay(run, deps, scenario, seed);

            // 4. The fresh card: hours, amount, Exported No.
            await assertOwnCards(run, deps, cards(false));

            // 5. Export the crew's card.
            const first = await exportCrewDay(run, deps, scenario, 'first');

            // 6. Recent Exports: the own run's file carries E10PH1, not the job name.
            const firstFile = await readRecentExportFile(deps, {
                label: scenario.label,
                runId: first.exportedRunId,
                recordsWritten: expected.recordsWritten,
                fileName: 'e10-export-first.txt',
                noStoredFile: scenario.export.noStoredFile,
            });
            assertFileIdentifier(firstFile.text, deps, { label: scenario.label, pass: 'first', identifiers, jobName: run.jobs.job.name });

            // 7. The accounting system's rejection happens in Famous; E10 acts on it.
            testInfo.annotations.push({ type: 'not-automatable', description: 'accounting rejection happens in Famous; E10 acts on it' });

            // 8. Catalog step 2: reverse exactly that run on the Reverse page; the card reads Exported No again.
            await reverseOwnExport(run, deps, scenario, first.exportedRunId);
            await assertOwnCards(run, deps, cards(false));

            // 9. Fix the identifier on the Job form.
            await setJobExportIdentifier(run, deps, { label: scenario.label, job: 'job', identifier: identifiers.corrected });

            // 10. Catalog step 3: Test File again before re-exporting.
            await openCrewExport(run, deps, scenario, 'second', { requireNoFlags: true });
            await testFileOnExport(deps, { label: scenario.label, jobCards: expected.jobCards, soft: false, ...expected.testFileAfterFix });

            // 11. Export again: a new run whose file carries E10PH2 and neither E10PH1 nor the name.
            const second = await confirmCrewExport(run, deps, scenario, 'second', { testFileEvidence: false });
            expect(second.exportedRunId, `${scenario.label}: the re-export is a new run`).not.toBe(first.exportedRunId);
            const secondFile = await readRecentExportFile(deps, {
                label: scenario.label,
                runId: second.exportedRunId,
                recordsWritten: expected.recordsWritten,
                fileName: 'e10-export-second.txt',
                noStoredFile: scenario.export.noStoredFile,
            });
            assertFileIdentifier(secondFile.text, deps, { label: scenario.label, pass: 'second', identifiers, jobName: run.jobs.job.name });

            // 12. The card reads Exported Yes.
            await assertOwnCards(run, deps, cards(true));
        } finally {
            await run.cleanup();
        }
    });
});
