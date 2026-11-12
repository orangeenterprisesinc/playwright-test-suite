/**
 * PET-12961 — Transfer to Job Cards: the grid is sorted by Export ID by default, then by date and time, like legacy and the Employee dropdown.
 * Data: src/data/client-feedback/pet-12961-tjc-export-id-default-order.json · Plan: test-plans/client-feedback/pet-12961-tjc-export-id-default-order.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcExportIdOrderCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { createCfEmployeeOnScreen, fillTemplate, mintQuickAddEmployee, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('PET-12961 · Transfer to Job Cards: default Export ID order', { tag: ['@ClientFeedback', '@PET-12961'] }, () => {
    test('The Transfer to Job Cards grid is sorted by Export ID by default, then by date and time, like legacy and the Employee dropdown', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'PET-12961' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcExportIdOrderCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the two run-minted employees (teardown registered first), created on screen in the crew, then punched in reverse order.
        const m1 = mintQuickAddEmployee(deps, s.ticket);
        const m2 = mintQuickAddEmployee(deps, s.ticket);
        const run = await prepareCfRun(s, deps);
        const e = {
            one: await createCfEmployeeOnScreen(run, deps, m1, s.employees.one),
            two: await createCfEmployeeOnScreen(run, deps, m2, s.employees.two),
        };
        for (const who of ['one', 'two'] as const) {
            expect(e[who].exportIdentifier, `${who}: the employee saved Export ID ${s.employees[who].exportIdentifier}`).toBe(s.employees[who].exportIdentifier);
            expect(e[who].crew, `${who}: the employee's home crew`).toBe(run.crew.name);
        }
        // Punched on Crew Time In, whose roster names them by First + Last.
        await seedCrewDay(run, deps, s.seed, { crew: run.crew, employees: [{ ...e.one, name: e.one.rosterName }, { ...e.two, name: e.two.rosterName }], day: run.day });

        // 1. Open Transfer to Job Cards from the left menu.
        await tjc.openFromMenu();

        // 2. Scope the day and Time Card Crew, then analyze.
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: s.expected.analyzed });

        // 3. No header is clicked: the Export ID column is shown, and the default order is Export ID text order, then time.
        await tjc.openColumnPicker();
        await tjc.ensureColumnShown(s.expected.exportIdColumn, testInfo);
        await tjc.closeColumnPicker();
        const label = (who: 'one' | 'two'): string => fillTemplate(s.expected.labelTemplate, { exportId: s.employees[who].exportIdentifier, name: e[who].name });
        const { rows } = s.expected;
        expect(await tjc.cardGrid.columnValues(s.expected.exportIdColumn), "38161's rows come first (text order) though 4243 punched first").toEqual(
            rows.map((r) => s.employees[r.employee].exportIdentifier),
        );
        const employeeColumn = await tjc.cardGrid.columnValues('Employee');
        expect(employeeColumn, "each employee's rows sit together in Export ID order").toEqual(rows.map((r) => label(r.employee)));
        expect(await tjc.cardGrid.columnValues('time'), "each employee's rows run in date and time order").toEqual(rows.map((r) => r.time));

        // 4. The Employee filter lists the same order as the grid.
        const options = await tjc.gridFilterOptions('Employee');
        expect(options, 'the Employee filter lists 38161 before 4243').toEqual(s.expected.filterOrder.map(label));
        expect([...new Set(employeeColumn)], 'the grid order matches the Employee filter list').toEqual(options);
    });
});
