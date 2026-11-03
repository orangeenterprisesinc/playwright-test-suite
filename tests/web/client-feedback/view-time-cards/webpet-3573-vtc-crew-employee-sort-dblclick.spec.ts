/**
 * WEBPET-3573 — View ▸ Time Cards sorts by Crew then Employee, shows a + button on each row, and a double-click opens the record.
 * Data: src/data/client-feedback/webpet-3573-vtc-crew-employee-sort-dblclick.json · Plan: test-plans/client-feedback/webpet-3573-vtc-crew-employee-sort-dblclick.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VtcSortPlusDblClickCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ownCard, ownReferences, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3573 · View Time Cards: default sort, + button, double-click', { tag: ['@ClientFeedback', '@WEBPET-3573'] }, () => {
    test('View > Time Cards sorts by Crew then Employee, shows a + button on each row, and a double-click opens the record', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3573' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(VtcSortPlusDblClickCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const view = pages.viewTimeCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then its day seeded on screen (TWO entered before ONE).
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);

        // 1. Open View > Time Cards, scope the day and the Time Card Crew, apply.
        await view.openFromMenu();
        await view.scopeToDay(run.day);
        await view.scopeToTimeCardCrew(run.crew.name);
        await view.applyFilter();
        expect(await view.totalRows(), 'the crew-day loads its own cards').toBe(s.expected.rows);

        // 2. With no header click the rows run crew, then employee, then time.
        const employees = await view.cardGrid.columnValues('Employee');
        const times = await view.cardGrid.columnValues('Time');
        const names = { one: run.employees[0].name, two: run.employees[1].name };
        expect(employees, 'every loaded row has an Employee').toHaveLength(s.expected.order.length);
        for (const [i, want] of s.expected.order.entries()) {
            expect(employees[i].endsWith(names[want.employee]), `row ${i + 1} belongs to employee ${want.employee}`).toBe(true);
            expect(times[i], `row ${i + 1} time`).toBe(want.time);
        }
        expect([...new Set(await view.cardGrid.columnValues('Work Crew'))], 'every row is the fixture crew').toEqual([run.crew.name]);

        // 3. Every row has a + button and no 25,000 banner is shown.
        for (const reference of ownReferences(run)) {
            await expect(view.rowAddButton(reference), `${reference} has a + button`).toBeVisible();
        }
        await expect(view.textOnScreen(s.expected.absentBanner), 'no 25,000 banner').toHaveCount(0);

        // 4. A double-click opens the record.
        const first = ownCard(run, 'one', 'timeIn');
        await view.openRecordByDoubleClick(first.reference);
        await expect(view.recordDialog(s.expected.sheetTitle), 'the Edit Time In sheet opens').toBeVisible();
        const record = await view.readRecord();
        expect(record.dateTime, 'the sheet carries the double-clicked card').toBe(`${run.day}T${s.expected.openTime}`);
        expect(record.employee, 'the sheet is the double-clicked employee').toContain(run.employees[0].name);
        await view.closeRecord();
    });
});
