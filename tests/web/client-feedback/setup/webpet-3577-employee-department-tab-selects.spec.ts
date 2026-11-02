/**
 * WEBPET-3577 — Tab in a dropdown after typing a single match selects that value (Setup ▸ Employee ▸ Department). Never saved.
 * Data: src/data/client-feedback/webpet-3577-employee-department-tab-selects.json · Plan: test-plans/client-feedback/webpet-3577-employee-department-tab-selects.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { SetupEmployeeTabSelectsCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ensureCfFixtures } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3577 · Setup Employee: Tab selects the single match', { tag: ['@ClientFeedback', '@WEBPET-3577'] }, () => {
    test('Pressing Tab in a dropdown after typing a single match selects that value', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3577' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(SetupEmployeeTabSelectsCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const employees = pages.employee;

        // 0. Arrange: the crew's fixture rows; this employee is edited and left unsaved.
        const f = await ensureCfFixtures({ sessionApi, testInfo, pages }, s.fixtureCrew);
        const who = f.employees[s.employee === 'one' ? 0 : 1];

        // 1. Setup > Employee from the menu, open the employee.
        await employees.gotoEditById(who.id, who.name);

        // 2. Type the start of a department with exactly one match.
        const options = await employees.typeDepartment(s.department.typed);
        expect(options, `'${s.department.typed}' matches one department`).toEqual([s.department.match]);

        // 3. Tab keeps the match and moves on.
        await employees.departmentCombobox.press('Tab');
        await expect(employees.departmentCombobox, 'Department holds the match').toHaveValue(s.department.match);
        await expect(employees.crewCombobox, 'focus moved to the next field (Crew)').toBeFocused();

        // 4. Leave without saving; the grid still shows no department for the employee.
        await employees.leaveWithoutSaving();
        await employees.grid.filterByName(who.name);
        expect(await employees.grid.columnValues('Department'), 'nothing was saved').toEqual([s.expected.departmentAfterLeave]);
    });
});
