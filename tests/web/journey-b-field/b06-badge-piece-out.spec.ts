/**
 * Catalog workflow B6 — Badge piece-out (PET-12644 / WEBPET-1525).
 * Data: src/data/journey-b/b06-badge-piece-out.json · Plan: test-plans/journey-b/b06-badge-piece-out.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { assertImportedRows, cardOf, referencePart, runJourneyBScenario } from '@utils/journeys/journeyBFlow';

// cardType → the Transfer grid's Type text, for the card type the fixture day must not hold.
const TYPE_TEXT: Record<number, string> = { 1: 'Time In' };

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
                'Android fidelity (AndroidPET PieceOutRecord.java): PieceOut carries PieceOutDate+PieceOutTime, no CardType; the iPhone <DateTime> shape is B6b',
            ).not.toContain(tag);
        }
        expect(run.envelope.references).toHaveLength(records.length);
        expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);

        expect(run.cards, 'the imported piece-out card').toHaveLength(expected.cards.length);
        // Employee, crew, job, pieces, type, source and traceability are compared on the grid row; the GPS
        // fix has no screen (the flow annotates gps-not-rendered-in-panel).
        await assertImportedRows(pages, run);
        const badge = cardOf(run, 0);
        expect(badge.row.reference).toBe(run.recordReferences[badge.index]);
        expect(referencePart(badge.row.reference)).toBe(record.part);
        // The office's own rendering of EmployeeSource, matching the recording's grid cell (kf 127).
        await testInfo.attach('employee-source-text-B6.txt', { body: badge.row.employeeSelection, contentType: 'text/plain' });
        const [typeText, employeeSelectionText] = expected.grid!.texts!;
        expect(badge.row.type, 'grid Type column').toContain(typeText);
        expect(badge.row.employeeSelection, 'grid Employee Selection column').toContain(employeeSelectionText);

        // WEBPET-1409 cannot fire without a bound Field; asserted so a later preference or envelope
        // change cannot leave an orphan behind. The crew-scoped grid offers the piece-out and nothing else.
        const transfer = pages.transferToJobCards;
        expect(await transfer.candidateReferences(), 'the crew-scoped grid offers exactly the badge piece-out').toEqual([badge.reference]);
        const absentType = TYPE_TEXT[expected.absentCardType!];
        expect(absentType, `absentCardType ${String(expected.absentCardType)} has no Transfer Type text`).toBeDefined();
        const synthesized = (await transfer.rowsOfType(absentType)).filter((row) => row.employee.includes(badge.bound.employeeName!));
        expect(synthesized, `no synthesized ${absentType} for the scanned employee`).toHaveLength(0);
    });
});
