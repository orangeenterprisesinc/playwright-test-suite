/**
 * Catalog workflow A5 — Employee setup.
 * Data: src/data/journey-a/a05-employee-setup.json · Plan: test-plans/journey-a/a05-employee-setup.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EmployeeSetupCaseSchema } from '@data/schemas/journeyAScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareEmployeeSetup } from '@utils/journeys/journeyAFlow';

test.describe('A5 · Employee setup', { tag: ['@JourneyA', '@A5'] }, () => {

    test('[Employee Setup] End-to-end: create an employee with identity, pay, time-card defaults, badges and meal waivers, and verify it persists.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5' },
        ],
    }, async ({ pages }, testInfo) => {
        const scenario = await loadScenario(EmployeeSetupCaseSchema, testInfo);
        const run = prepareEmployeeSetup(scenario, testInfo);
        const { employee } = run;
        const { expected } = run.scenario;

        // Catalog steps 1-4: identity, pay, time-card defaults, badges and meal waivers on one form.
        const outcome = await pages.employee.createEmployee(employee);
        expect(outcome, 'the New Employee form should save').toBe('created');
        const employeeId = pages.employee.savedIdFromUrl();
        await expect(pages.employee.createdToast).toBeVisible();
        await expect(pages.employee.editHeading(employee.name)).toBeVisible();
        const hireDateShown = await pages.employee.readHireDate();

        // A full reload proves the screen stored what it showed.
        await pages.employee.gotoEditById(employeeId, employee.name);
        const form = await pages.employee.readEmployeeForm();
        expect(form, 'the reloaded form should hold every saved value').toMatchObject({
            name: employee.name,
            code: employee.code,
            exportIdentifier: employee.exportIdentifier,
            lastName: employee.lastName,
            department: employee.department,
            crew: employee.crew,
            payPeriod: expected.payPeriod,
            hourlyRate: employee.hourlyRate,
            hireDate: hireDateShown,
            gender: employee.gender,
            dateOfBirth: employee.dateOfBirth,
            defaultRanch: employee.defaultRanch,
            defaultField: employee.defaultField,
            defaultJob: employee.defaultJob,
            nfcCode: employee.nfcCode,
            rfidCode: employee.rfidCode,
            waivedFirstMeal: employee.waivedFirstMeal,
            waivedSecondMeal: employee.waivedSecondMeal,
        });
        expect(form.hireDate, 'Hire Date defaults to a date without being typed').not.toBe('');
        expect(form.active, 'a new employee is Active').toBe(true);
    });

});
