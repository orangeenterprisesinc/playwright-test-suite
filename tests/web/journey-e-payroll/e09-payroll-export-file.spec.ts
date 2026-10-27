/**
 * Catalog workflow E9 — Payroll export file (Test File a two-job crew day, fix the missing earning code, export it, read the file).
 * Data: src/data/journey-e/e09-payroll-export-file.json · Plan: test-plans/journey-e/e09-payroll-export-file.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyE9PayrollExportFileCaseSchema } from '@data/schemas/journeyEScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    assertFileRecords,
    assertOwnCards,
    confirmCrewExport,
    fixEarningCode,
    openCrewExport,
    prepareJourneyE9,
    readRecentExportFile,
    seedJobChangeDay,
    testFileOnExport,
    transferExportDay,
} from '@utils/journeys/journeyEFlow';

test.describe('E9 · Payroll export file', { tag: ['@JourneyE', '@E9'] }, () => {
    test('[Payroll] Test-file a two-job crew day, fix the missing earning code, export it and read the file.', {
        tag: ['@Regression', '@Demo'],
        annotation: [{ type: 'testCaseId', description: 'E9' }],
    }, async ({ sessionApi, pages }, testInfo) => {
        // Two jobs x three Job-form saves, a transfer, two Test Files, an export and a download.
        test.setTimeout(900_000);

        const scenario = await loadScenario(JourneyE9PayrollExportFileCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };
        const { expected } = scenario;

        // 1. Arrange: export-residue heal, fixture rows, both jobs' rule, rate and earning code (NOCODE cleared), gates, sweeps.
        const run = await prepareJourneyE9(scenario, deps);
        try {
            const cards = (exported: boolean) => ({
                label: scenario.label,
                exported,
                exportedCell: exported ? expected.exportedYes : expected.exportedNo,
                rows: (['coded', 'nocode'] as const).map((key) => ({ job: run.jobs[key].name, ...pick(expected.perJob[key]) })),
            });

            // 2. Seed on screen: crew time-in 06:00 on CODED, 10:00 on NOCODE, crew time-out 14:00.
            const seed = await seedJobChangeDay(run, deps, scenario.segments, scenario.timeOut);
            expect(seed.timeCardCounters, `${scenario.label}: the own time cards are seeded`).toHaveLength(expected.timeCards);

            // 3. Transfer the crew day and land on View > Job Cards with this run's id.
            await transferExportDay(run, deps, scenario, seed);

            // 4. Both cards: hours, amount, Exported No. Returns the employee token the file must carry.
            const { employeeToken } = await assertOwnCards(run, deps, cards(false));

            // 5. Export to Accounting: Payroll, the day, the crew, Refresh. The gap may raise a Flag, so Flags are evidence here.
            await openCrewExport(run, deps, scenario, 'first', { requireNoFlags: false });

            // 6. Test File before the fix: 1 ready, 1 cannot export, the earning-code failure.
            await testFileOnExport(deps, { label: scenario.label, jobCards: expected.jobCards, soft: true, ...expected.testFileBefore });

            // 7. Fix the gap on the Job form.
            await fixEarningCode(run, deps, { label: scenario.label, job: scenario.fix.job, earningCodes: scenario.fix.earningCodes });

            // 8. Re-open the export page and Test File again: 2 ready, 0 cannot export.
            await openCrewExport(run, deps, scenario, 'second', { requireNoFlags: true });
            await testFileOnExport(deps, { label: scenario.label, jobCards: expected.jobCards, soft: true, ...expected.testFileAfter });

            // 9. Export both cards and confirm.
            const exported = await confirmCrewExport(run, deps, scenario, 'second', { testFileEvidence: false });

            // 10. Recent Exports: the own run's row, then its file.
            const file = await readRecentExportFile(deps, {
                label: scenario.label,
                runId: exported.exportedRunId,
                recordsWritten: expected.recordsWritten,
                fileName: 'e09-export.txt',
                noStoredFile: scenario.export.noStoredFile,
            });

            // 11. The file holds exactly the two records, each carrying the employee token.
            assertFileRecords(file.text, deps, {
                label: scenario.label,
                recordLine: scenario.file.recordLine,
                expectedRecords: expected.recordsWritten,
                employeeToken,
            });

            // 12. View > Job Cards with Include Exported: both cards read Exported Yes.
            await assertOwnCards(run, deps, cards(true));
        } finally {
            await run.cleanup();
        }
    });
});

function pick(b: { regular: number; overtime: number; amount: number }): { regular: number; overtime: number; amount: number } {
    return { regular: b.regular, overtime: b.overtime, amount: b.amount };
}
