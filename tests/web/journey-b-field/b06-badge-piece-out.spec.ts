/**
 * Catalog workflow B6 — Badge piece-out (PET-12644 / WEBPET-1525).
 * Data: src/data/journey-b/b06-badge-piece-out.json · Plan: test-plans/journey-b/b06-badge-piece-out.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { cardOf, cardsForEmployee, openTransferGridRow, referencePart, runJourneyBScenario } from '@utils/journeys/journeyBFlow';

test.describe('B6 · Badge piece-out', { tag: ['@JourneyB', '@B6'] }, () => {
    test('Deliver a badge piece-out export and verify the office records one piece against the scanned employee', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B6-001' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const run = await runJourneyBScenario(scenario, { sessionApi, pages, testInfo });
        const { records, expected } = scenario;
        const want = expected.envelope!;
        const [record] = records;
        expect(run.envelope.sections).toEqual(want.sections);
        expect(run.envelope.referenceParts).toEqual(want.referenceParts);
        expect(run.envelope.pieceCounts).toEqual(want.pieceCounts);
        expect(run.envelope.employeeSources, 'exactly one BarcodeBadge employee-source tag').toEqual(want.employeeSources);
        for (const tag of want.absentTags!) {
            expect(
                run.envelope.tagNames,
                'sample fidelity: PieceOut derives from PieceOutDate+PieceOutTime, no CardType tag',
            ).not.toContain(tag);
        }
        expect(run.envelope.references).toHaveLength(records.length);
        expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);

        expect(run.cards, 'the imported piece-out card').toHaveLength(expected.cards.length);
        const badge = cardOf(run, 0);
        // Ids, never merely "not null": an unresolved code walks a nine-rung fallback ladder
        // that can land on a same-named or Undefined employee.
        expect(badge.card.employeeCounter, 'B6-R1').toBe(badge.bound.employeeId);
        expect(Number(badge.card.numOfPieces), 'B6-R2').toBe(badge.expected.pieces);
        expect(badge.card.cardType, 'B6-R3').toBe(badge.expected.cardType);
        expect(badge.card.reference, 'B6-R4').toBe(run.recordReferences[badge.index]);
        expect(referencePart(String(badge.card.reference))).toBe(record.part);
        // The office's own rendering of EmployeeSource, confirmed against dev 2026-08-27 and
        // matching the recording's grid cell (kf 127).
        expect(String(badge.card.employeeSourceText ?? ''), 'B6-R5').toBe(badge.expected.employeeSourceText);
        await testInfo.attach('employee-source-text-B6.txt', {
            body: String(badge.card.employeeSourceText ?? ''),
            contentType: 'text/plain',
        });
        expect(badge.card.crewCounter, 'B6-R6 crew').toBe(run.office.crew.id);
        expect(badge.card.jobCounter, 'B6-R6 job').toBe(run.office.job.id);
        expect(String(badge.card.gpsReading ?? ''), 'B6-R7').toBe(record.gps);

        // WEBPET-1409 cannot fire without a bound Field; asserted so a later preference or
        // envelope change cannot leave an orphan behind.
        const synthesized = await cardsForEmployee(run, badge.expected.employeeCode, expected.absentCardType!);
        expect(synthesized, 'no synthesized Time-In for the scanned employee').toHaveLength(0);

        // ── The grid half of B6-R3/B6-R5 ──
        const [typeText, employeeSelectionText] = expected.grid!.texts!;
        const row = await openTransferGridRow(pages, run, badge.index);
        if (row) {
            await expect(row, 'B6-R3: grid Type column').toContainText(typeText);
            await expect(row, 'B6-R5: grid Employee Selection column').toContainText(employeeSelectionText);
        }
    });
});
