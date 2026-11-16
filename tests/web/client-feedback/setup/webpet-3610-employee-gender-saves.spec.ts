/**
 * WEBPET-3610 — Setup ▸ Employee: the Gender select saves Male and shows Male again after reopening; restored on screen.
 * Data: src/data/client-feedback/webpet-3610-employee-gender-saves.json · Plan: test-plans/client-feedback/webpet-3610-employee-gender-saves.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EmployeeGenderCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ensureCfFixtures, resetCfEmployeeGender } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3610 · Setup Employee: Gender saves', { tag: ['@ClientFeedback', '@WEBPET-3610'] }, () => {
    test('The Employee Gender select saves Male and shows Male again after reopening', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3610' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(EmployeeGenderCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const employees = pages.employee;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows; Gender on this employee is unset (a killed run's leftover is cleared, teardown clears it too).
        const f = await ensureCfFixtures(deps, s.fixtureCrew);
        const who = f.employees[s.employee === 'one' ? 0 : 1];
        await resetCfEmployeeGender(deps, who, s.ticket);

        // 1. Setup > Employee, open the employee: Gender starts unset.
        await employees.gotoEditById(who.id, who.name);
        await expect(employees.genderSelect, 'Gender starts unset').toHaveText('');

        // 2. The Gender list is exactly Male, Female, Non-Binary.
        const options = await employees.genderOptions();
        expect(options, 'the Gender options').toEqual(s.expected.options);
        expect(options, 'no Unspecified option').not.toContain(s.expected.absent);

        // 3. Choose Male and Save.
        await employees.chooseGender(s.pick);
        await expect(employees.genderSelect).toHaveText(s.pick);
        await employees.saveEdit();

        // 4. Back to the list and reopen: Gender reads Male.
        await employees.gotoList();
        await employees.gotoEditById(who.id, who.name);
        await expect(employees.genderSelect, 'Gender after reopening').toHaveText(s.pick);

        // 5. Restore on screen: Clear selection, Save; Gender reads empty again.
        await employees.clearGender();
        await employees.saveEdit();
        await expect(employees.genderSelect, 'Gender restored to unset').toHaveText('');
    });
});
