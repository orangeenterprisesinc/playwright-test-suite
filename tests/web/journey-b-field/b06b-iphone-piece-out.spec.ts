/**
 * Journey B6b — iPhone piece-out import (PET-12946).
 * Data: src/data/journey-b/b06b-iphone-piece-out.json · Plan: test-plans/journey-b/b06b-iphone-piece-out.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { assertImportedRows, cardOf, displayedStamp, importLogRowFor, recordStamp, runJourneyBScenario } from '@utils/journeys/journeyBFlow';

test.describe('B6b · iPhone piece-out', { tag: ['@JourneyB', '@B6b'] }, () => {
    test('Deliver an iPhone piece-out export and verify every row imports with the sent time', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B6b' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        // 1. Relay push, then the on-screen Internet import
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const run = await runJourneyBScenario(scenario, { sessionApi, pages, testInfo });
        const { records, expected } = scenario;
        const want = expected.envelope!;
        expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);

        // 2. The envelope is the iOS shape: one bare DateTime per PieceOut row, in the sample's order
        expect(run.envelope.sections).toEqual(want.sections);
        expect(run.envelope.referenceParts).toEqual(want.referenceParts);
        expect(run.envelope.sectionTags['PieceOut']).toEqual(want.sectionTags!['PieceOut']);
        for (const tag of want.absentInSection!['PieceOut']) {
            expect(
                run.envelope.sectionTags['PieceOut'],
                'iPhone fidelity: a PieceOut row carries one bare DateTime, never the Android PieceOutDate/PieceOutTime pair',
            ).not.toContain(tag);
        }
        expect(run.envelope.sectionLookups).toEqual(want.sectionLookups);
        expect(run.envelope.pieceCounts).toEqual(want.pieceCounts);
        expect(run.envelope.employeeSources).toEqual(want.employeeSources);
        expect(run.envelope.references).toHaveLength(records.length);

        // 3. Transfer to Job Cards shows every row with its expected fields
        expect(run.cards, 'the imported cards').toHaveLength(expected.cards.length);
        await assertImportedRows(pages, run);

        // 4. Each row shows the Date/Time that was sent — the office derived the NOT NULL DateTime from the bare tag
        for (const index of records.keys()) {
            expect(displayedStamp(cardOf(run, index).row), `record ${index} Date/Time on the grid`).toBe(recordStamp(run, index).slice(0, 16));
        }

        // 5. The Internet Import Log shows the file completed with no declined record
        const log = await importLogRowFor(pages, run.deliveries[0]);
        const wantLog = expected.importLog!;
        expect(log.status.toLowerCase(), `Import Log row: ${JSON.stringify(log)}`).toBe(wantLog.status);
        expect(log.recordsImported, `Import Log row: ${JSON.stringify(log)}`).toBe(wantLog.recordsImported);
        expect(log.recordsFailed, `Import Log row: ${JSON.stringify(log)}`).toBe(wantLog.recordsFailed);

        // 6. Teardown runs through the scenario cleanup step the flow registered
    });
});
