/**
 * Catalog workflow C6 — Sub-crew ("tables") capture, office half (kiosk capture is device-only).
 * Data: src/data/journey-c/c06-sub-crew-tables-capture.json · Plan: test-plans/journey-c/c06-sub-crew-tables-capture.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { CrewTableCaseSchema } from '@data/schemas/journeyCScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    captureByTable,
    countCrewRowsOnScreen,
    prepareJourneyC,
    readCapturedPunchesOnScreen,
} from '@utils/journeys/journeyCFlow';

test.describe('C6 · Sub-crew ("tables") capture', { tag: ['@JourneyC', '@C6'] }, () => {

    test('[Capture by table] Clock a table of three in and roll the day up to the crew.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'C6' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        test.setTimeout(240_000);
        const scenario = await loadScenario(CrewTableCaseSchema, testInfo);
        const run = await prepareJourneyC(scenario, { sessionApi, testInfo, pages });

        const want = scenario.expected!;
        await captureByTable(run, { sessionApi, testInfo, pages });

        // The four edit pages give the partition: Table, Crew and the ticked employees per punch.
        const punches = await readCapturedPunchesOnScreen(run, pages);
        const onTable = punches.filter((p) => p.table !== '');
        const offTable = punches.filter((p) => p.table === '');
        expect(onTable, 'punches saved with the table').toHaveLength(want.cardsOnTable);
        for (const punch of onTable) expect(punch.table, `table on ${punch.reference}`).toBe(run.tableName);
        expect(offTable, 'punches saved with no table').toHaveLength(want.cardsOffTable);
        for (const punch of punches) expect(punch.crew, `crew on ${punch.reference}`).toBe(run.office.crew.name);
        expect(new Set(onTable.flatMap((p) => p.employees))).toEqual(new Set(run.workers.map((w) => w.name)));
        expect(new Set(offTable.flatMap((p) => p.employees))).toEqual(new Set(run.offTable.map((w) => w.name)));

        // View > Time Cards has no Table column, so the list proves only that the crew's day holds every punch.
        expect(
            await countCrewRowsOnScreen(run, pages),
            'a table groups the crew day, it does not lose or duplicate cards',
        ).toBe(want.cardsOnTable + want.cardsOffTable);

        await run.cleanup();
    });

});
