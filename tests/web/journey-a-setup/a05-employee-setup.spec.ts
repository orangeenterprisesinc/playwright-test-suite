/**
 * Catalog workflow A5 — Employee setup.
 * Data: src/data/journey-a/a05-employee-setup.json · Plan: test-plans/journey-a/a05-employee-setup.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EmployeeSetupCaseSchema } from '@data/schemas/journeyAScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { employeeInExport } from '@utils/export/setupExportXml';
import { prepareEmployeeSetup, readEmployee, readSetupExportSend } from '@utils/journeys/journeyAFlow';

test.describe('A5 · Employee setup', { tag: ['@JourneyA', '@A5'] }, () => {

    test('[Employee Setup] End-to-end: create an employee with identity, pay, time-card defaults, badges and meal waivers, verify it persists, and push it to a scan device.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5' },
        ],
    }, async ({ pages, sessionApi }, testInfo) => {
        // The device push alone takes ~22 s.
        test.slow();
        const scenario = await loadScenario(EmployeeSetupCaseSchema, testInfo);
        const run = await prepareEmployeeSetup(scenario, sessionApi, testInfo);
        const { employee, device } = run;
        const { expected } = run.scenario;

        // Catalog steps 1-4: identity, pay, time-card defaults, badges and meal waivers on one form.
        const outcome = await pages.employee.createEmployee(employee);
        expect(outcome, 'the New Employee form should save').toBe('created');
        // Recorded before any assertion so teardown knows the id even when one fails.
        const employeeId = pages.employee.savedIdFromUrl();
        run.recordEmployeeId(employeeId);
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

        // Read-back: the wire holds the same record.
        const today = await pages.employee.browserToday();
        const stored = await readEmployee(sessionApi, employeeId);
        expect(stored, 'GET employees/{id} should return what the screen saved').toMatchObject({
            name: employee.name,
            code: employee.code,
            exportIdentifier: employee.exportIdentifier,
            lastName: employee.lastName,
            nfcCode: employee.nfcCode,
            rfidCode: employee.rfidCode,
            rate: expected.wire.rate,
            payPeriod: expected.wire.payPeriod,
            gender: expected.wire.gender,
            dateOfBirth: employee.dateOfBirth,
            hireDate: today,
            releaseDate: null,
            waivedFirstMeal: employee.waivedFirstMeal,
            waivedSecondMeal: employee.waivedSecondMeal,
            active: true,
        });
        for (const key of expected.wire.nonNullKeys) {
            expect(stored[key], `${key} should be set`).toEqual(expect.any(Number));
        }

        // Catalog step 6: add the employee to a scan device and save, on screen. The device
        // form is loaded immediately before the edit so a concurrent push cannot make it stale.
        await pages.scanDevice.gotoEdit(device.id);
        await pages.scanDevice.waitForEditReady();
        await pages.scanDevice.addEmployee(run.employeeLabel);
        await expect(pages.scanDevice.employeeRow(run.employeeLabel)).toBeVisible();
        await pages.scanDevice.save(device.id);
        await expect(pages.scanDevice.savedToast).toBeVisible();

        // Push to Device. The form is stale afterwards (the push bumps the row version), so no second Save.
        const { destination, runId } = await pages.scanDevice.pushToDevice();
        await expect(pages.scanDevice.pushSucceeded).toBeVisible();
        expect(destination, 'Push to Device should name its destination').not.toBe('');
        expect(runId, 'the push should return its export run id').toBeGreaterThan(0);

        // The setup file the push produced carries the new employee.
        const { xml } = await readSetupExportSend(sessionApi, runId, device.id);
        await testInfo.attach('setup-export.xml', { body: xml, contentType: 'text/xml' });
        const exported = employeeInExport(xml, employee.code, expected.export.section);
        expect(exported, `the setup export should carry employee ${employee.code}`).toBeDefined();
        expect(exported, 'the exported employee record').toMatchObject({
            Code: employee.code,
            Name: employee.name,
            ExportIdentifier: employee.exportIdentifier,
            LastName: employee.lastName,
            RfidCode: employee.rfidCode,
            Crew: expected.export.crew,
            DefaultJob: expected.export.defaultJob,
        });
    });

});
