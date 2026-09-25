/**
 * Catalog workflow C6 — Sub-crew ("tables") capture, office half (kiosk capture is device-only).
 * Data: src/data/journey-c/c06-sub-crew-tables-capture.json · Plan: test-plans/journey-c/c06-sub-crew-tables-capture.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { CrewTableCaseSchema } from '@data/schemas/journeyCScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { captureByTable, lookupTable, prepareJourneyC, rollUpByTable } from '@utils/journeys/journeyCFlow';

test.describe('C6 · Sub-crew ("tables") capture', { tag: ['@JourneyC', '@C6'] }, () => {

    test('[Setup ▸ Table] Create a table under a crew with a supervisor.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'C6-001' },
        ],
    }, async ({ pages, sessionApi }, testInfo) => {
        const scenario = await loadScenario(CrewTableCaseSchema, testInfo);
        const run = await prepareJourneyC(scenario, { sessionApi, testInfo });

        const outcome = await pages.crewTable.createTable({
            name: run.tableName,
            crew: run.office.crew.name,
            supervisor: run.supervisor.name,
        });
        expect(outcome, scenario.screen!.messages.tableCreated).toBe('created');
        await expect(pages.crewTable.tableCreatedToast).toBeVisible();
        expect(pages.crewTable.savedTableId()).toBeGreaterThan(0);

        await pages.crewTable.gotoTablesList();
        await pages.crewTable.expectListedUnderCrew(run.tableName, run.office.crew.name);

        const table = await lookupTable(run, sessionApi);
        expect(table, `GET /crew-tables should list the created table '${run.tableName}'`).not.toBeNull();
        expect(table!.crewCounter).toBe(run.office.crew.id);
        expect(table!.supervisorCounter).toBe(run.supervisor.id);
        expect(table!.active).toBe(true);

        await run.cleanup();
    });

    test('[Capture by table] Clock a table of three in and roll the day up to the crew.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'C6-002' },
        ],
    }, async ({ page, sessionApi }, testInfo) => {
        const scenario = await loadScenario(CrewTableCaseSchema, testInfo);
        const run = await prepareJourneyC(scenario, { sessionApi, testInfo });

        const capture = await captureByTable(run, { sessionApi, testInfo });
        expect(capture.onTable).toHaveLength(scenario.expected!.cardsOnTable);
        for (const row of capture.onTable) {
            expect(row.crewTableCounter).toBe(run.table!.crewTableCounter);
            expect(row.crewTableName).toBe(run.tableName);
            expect(row.crewCounter).toBe(run.office.crew.id);
        }
        expect(new Set(capture.onTable.map((r) => r.employeeCounter))).toEqual(new Set(run.workers.map((w) => w.id)));

        expect(capture.offTable).toHaveLength(scenario.expected!.cardsOffTable);
        for (const row of capture.offTable) {
            expect(row.crewTableCounter ?? 0).toBeFalsy();
        }

        const rollUp = await rollUpByTable(run, sessionApi);
        expect(rollUp.onTable.length).toBe(scenario.expected!.cardsOnTable);
        expect(rollUp.offTable.length).toBe(scenario.expected!.cardsOffTable);
        expect(
            rollUp.onTable.length + rollUp.offTable.length,
            'a table groups the crew day, it does not lose or duplicate cards',
        ).toBe(rollUp.crewRows.length);

        await page.goto(`/input/crew-time-in/${capture.onTable[0].timeCardCounter}`);
        await expect(page.getByRole('combobox', { name: 'Table' })).toHaveValue(run.tableName);
        await expect(page.getByRole('combobox', { name: 'Crew *' })).toHaveValue(run.office.crew.name);

        await run.cleanup();
    });

});
