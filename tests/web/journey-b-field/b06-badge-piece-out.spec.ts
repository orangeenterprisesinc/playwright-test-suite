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
            { type: 'testCaseId', description: 'B6' },
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
        expect(badge.card.employeeCounter).toBe(badge.bound.employeeId);
        expect(Number(badge.card.numOfPieces)).toBe(badge.expected.pieces);
        expect(badge.card.cardType).toBe(badge.expected.cardType);
        expect(badge.card.reference).toBe(run.recordReferences[badge.index]);
        expect(referencePart(String(badge.card.reference))).toBe(record.part);
        // The office's own rendering of EmployeeSource, confirmed against dev 2026-08-27 and
        // matching the recording's grid cell (kf 127).
        expect(String(badge.card.employeeSourceText ?? '')).toBe(badge.expected.employeeSourceText);
        await testInfo.attach('employee-source-text-B6.txt', {
            body: String(badge.card.employeeSourceText ?? ''),
            contentType: 'text/plain',
        });
        expect(badge.card.crewCounter, 'crew').toBe(run.office.crew.id);
        expect(badge.card.jobCounter, 'job').toBe(run.office.job.id);
        expect(String(badge.card.gpsReading ?? '')).toBe(record.gps);

        // WEBPET-1409 cannot fire without a bound Field; asserted so a later preference or
        // envelope change cannot leave an orphan behind.
        const synthesized = await cardsForEmployee(run, badge.expected.employeeCode, expected.absentCardType!);
        expect(synthesized, 'no synthesized Time-In for the scanned employee').toHaveLength(0);

        // ── The grid half: card type and employee source as the Transfer grid renders them ──
        const [typeText, employeeSelectionText] = expected.grid!.texts!;
        const row = await openTransferGridRow(pages, run, badge.index);
        if (row) {
            await expect(row, 'grid Type column').toContainText(typeText);
            await expect(row, 'grid Employee Selection column').toContainText(employeeSelectionText);
        }
    });
});
