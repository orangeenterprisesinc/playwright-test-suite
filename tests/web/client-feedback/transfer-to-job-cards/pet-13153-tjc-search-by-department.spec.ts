/**
 * PET-13153 — Transfer to Job Cards: Search by Department scopes the analyze to that department's employees.
 * Data: src/data/client-feedback/pet-13153-tjc-search-by-department.json · Plan: test-plans/client-feedback/pet-13153-tjc-search-by-department.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcSearchByDepartmentCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    createCfEmployeeOnScreen,
    ensureCfDepartment,
    fillTemplate,
    mintQuickAddEmployee,
    prepareCfRun,
    seedCrewDay,
} from '@utils/client-feedback/clientFeedbackFlow';

test.describe('PET-13153 · Transfer to Job Cards: Search by Department', { tag: ['@ClientFeedback', '@PET-13153'] }, () => {
    test("Search by Department scopes the Transfer to Job Cards analyze to that department's employees", {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'PET-13153' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcSearchByDepartmentCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };
        const x = s.expected;

        // 0. Arrange: two run-minted employees (teardown registered first) put in CF DEPARTMENT; the fixture crew's own employees are the control.
        const m1 = mintQuickAddEmployee(deps, s.ticket);
        const m2 = mintQuickAddEmployee(deps, s.ticket);
        const run = await prepareCfRun(s, deps);
        const dept = await ensureCfDepartment(deps);
        const e = {
            one: await createCfEmployeeOnScreen(run, deps, m1, { ...s.employees.one, department: dept.name }),
            two: await createCfEmployeeOnScreen(run, deps, m2, { ...s.employees.two, department: dept.name }),
        };
        for (const who of ['one', 'two'] as const) {
            expect(e[who].department, `${who}: the employee saved Department ${dept.name}`).toBe(dept.name);
        }
        await seedCrewDay(run, deps, s.seed);
        await seedCrewDay(run, deps, s.departmentSeed, { crew: run.crew, employees: [{ ...e.one, name: e.one.rosterName }, { ...e.two, name: e.two.rosterName }], day: run.day });

        // 1. Open Transfer to Job Cards from the left menu.
        await tjc.openFromMenu();

        // 2. Scope the day.
        await tjc.scopeToDay(run.day);

        // 3. Search by lists Employee, Department, Employee Home Crew and Time Card Crew.
        expect(await tjc.searchByOptions(), 'Search by lists the four dimensions').toEqual(x.searchByOptions);

        // 4. Search by Department, Match Selected, pick the department.
        await tjc.scopeBySearch('department', dept.name);
        await expect(tjc.searchMatch, 'Match reads Selected').toHaveText(x.match);
        await expect(tjc.criterionSentence('department'), 'the criterion line names the department').toHaveText(
            fillTemplate(x.sentenceTemplate, { department: dept.name }),
        );

        // 5. Analyze with no Time Card Crew criterion.
        await tjc.analyzeCandidates({ expected: x.analyzed });

        // 6. Every row is a department employee; the control crew employees are excluded.
        const label = (who: 'one' | 'two'): string => fillTemplate(x.labelTemplate, { exportId: s.employees[who].exportIdentifier, name: e[who].name });
        const employeeColumn = await tjc.cardGrid.columnValues('Employee');
        expect(employeeColumn, 'one row per analyzed time card').toHaveLength(x.analyzed);
        expect([...new Set(employeeColumn)].sort(), "only the department's two employees are listed").toEqual([label('one'), label('two')].sort());

        // 7. The footer and totals count only those cards.
        await expect(tjc.gridCaption).toHaveText(x.caption);
        for (const [totalLabel, value] of Object.entries(x.totals)) {
            await expect.poll(() => tjc.totalsNumber(totalLabel), { message: `the ${totalLabel} total counts only the department's cards` }).toBe(value);
        }
    });
});
