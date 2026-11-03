/**
 * WEBPET-3133 — View ▸ Time Cards: an employee's punches read oldest first when sorted by Employee.
 * Data: src/data/client-feedback/webpet-3133-vtc-punches-oldest-first.json · Plan: test-plans/client-feedback/webpet-3133-vtc-punches-oldest-first.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VtcPunchOrderCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3133 · View Time Cards: punches oldest first', { tag: ['@ClientFeedback', '@WEBPET-3133'] }, () => {
    test("an employee's punches read oldest first (Time In first, Time Out last) when sorted by Employee", {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3133' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(VtcPunchOrderCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const view = pages.viewTimeCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then its day of punches seeded on screen.
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);

        // 1. Open View > Time Cards, scope the day and the Time Card Crew, apply.
        await view.openFromMenu();
        await view.scopeToDay(run.day);
        await view.scopeToTimeCardCrew(run.crew.name);
        await view.applyFilter();
        expect(await view.totalRows(), 'the crew-day loads its own cards').toBe(s.expected.rows);

        // 2. Sort by Employee.
        await view.cardGrid.sortBy(s.expected.sortColumn, 'ascending');

        // 3. Each employee's rows read oldest first.
        const employees = await view.cardGrid.columnValues('Employee');
        const times = await view.cardGrid.columnValues('Time');
        const types = await view.cardGrid.columnValues('Type');
        for (const employee of run.employees) {
            const at = employees.map((_, i) => i).filter((i) => employees[i].endsWith(employee.name));
            expect(at.map((i) => ({ time: times[i], type: types[i] })), `${employee.name}'s punches read oldest first`).toEqual(s.expected.sequence);
        }
    });
});
