/**
 * Catalog workflow A6 — Biometric enrollment.
 * Data: src/data/journey-a/a06-biometric-enrollment.json · Plan: test-plans/journey-a/a06-biometric-enrollment.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { BiometricEnrollmentCaseSchema } from '@data/schemas/journeyAScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    prepareBiometricEnrollment,
    readPushedEmployee,
    writeBiometricDeviceFile,
} from '@utils/journeys/journeyAFlow';

test.describe('A6 · Biometric enrollment', { tag: ['@JourneyA', '@A6'] }, () => {

    test('[Biometric Enrollment] End-to-end: import an IrisID enrollment for a new employee, confirm it on the employee, issue an RFID fallback and push both to the IrisID device.', {
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'A6' },
        ],
    }, async ({ page, pages, sessionApi }, testInfo) => {
        // 1. Load the scenario and mint the run's identifiers.
        const scenario = await loadScenario(BiometricEnrollmentCaseSchema, testInfo);
        const run = await prepareBiometricEnrollment(scenario, sessionApi, testInfo);
        const { employee, device } = run;
        const { expected } = run.scenario;
        const identifiers = [employee.code, employee.exportIdentifier, run.rfidCode];
        expect(new Set(identifiers).size, 'Barcode, Export Identifier and RFID code should be distinct').toBe(identifiers.length);

        const notEnrolledIris = Object.fromEntries(
            [...expected.irisEnrolled, ...expected.irisNotEnrolled].map((label) => [label, expected.notEnrolled]),
        );
        const enrolledIris = {
            ...Object.fromEntries(expected.irisEnrolled.map((label) => [label, expected.enrolled])),
            ...Object.fromEntries(expected.irisNotEnrolled.map((label) => [label, expected.notEnrolled])),
        };
        const chips = (status: string) => Object.fromEntries(expected.faceIrisSlots.map((slot) => [slot, status]));

        // 2. Create the employee on screen.
        const outcome = await pages.employee.createEmployee(employee);
        expect(outcome, 'the New Employee form should save').toBe('created');
        const employeeId = pages.employee.savedIdFromUrl();
        await expect(pages.employee.createdToast).toBeVisible();

        // 3. Create the IrisID scan device on screen.
        const deviceId = await pages.scanDevice.createDevice(device, run.deviceType);
        expect(deviceId, 'the device create should return its counter').toBeTruthy();

        // 4. Baseline: nothing is enrolled and there is no photo yet.
        await pages.employee.gotoEditById(employeeId, employee.name);
        const before = await pages.employee.readProfileSummary();
        await expect.poll(() => pages.employee.readFaceIrisChips(expected.faceIrisSlots), {
            message: 'the Face-Iris Template chips should all read Not enrolled before the import',
            timeout: 60_000,
        }).toEqual(chips(expected.notEnrolled));
        expect(await pages.employee.readIrisEnrollment(), 'the Iris section should list every slot as Not enrolled').toMatchObject(notEnrolledIris);
        await expect(pages.employee.photoClearButton, 'a new employee has no photo to clear').toBeDisabled();

        // 5. Build the reader's own export file.
        const file = await writeBiometricDeviceFile(run, page, testInfo);
        const lengths = Object.fromEntries(Object.entries(file.templates).map(([key, value]) => [key, value.length]));
        expect(lengths, 'the templates should have the lengths of a real IrisID file').toEqual(expected.base64Lengths);

        // 6. Catalog step 1: import the file through Connectivity > Import > Single Folder.
        await pages.importSingleFolder.goto();
        await pages.importSingleFolder.selectFiles([file.path]);
        await expect(pages.importSingleFolder.importButton).toBeEnabled();
        const { runId } = await pages.importSingleFolder.importSelected();
        const result = await pages.importSingleFolder.waitForResult(file.fileName);
        expect(result, 'the import should complete').toContain(expected.importStatus);
        expect(result, 'the import should report one record').toContain(expected.importSummary);

        // 7. The Internet Import Log records the upload.
        await pages.importLog.goto();
        await pages.importLog.filterBySource(expected.log.source);
        await pages.importLog.filterByFile(file.fileName);
        const logRow = await pages.importLog.readRow(file.fileName);
        expect(logRow, 'the import log row should describe the upload').toMatchObject({
            source: expected.log.source,
            status: expected.log.status,
            recordsImported: expected.log.recordsImported,
            recordsFailed: expected.log.recordsFailed,
            run: String(runId),
        });

        // 8. Catalog step 2: the employee shows the enrollment after a full reload.
        await pages.employee.gotoEditById(employeeId, employee.name);
        await expect.poll(() => pages.employee.readFaceIrisChips(expected.faceIrisSlots), {
            message: 'the Face-Iris Template chips should all read Enrolled after the import',
            timeout: 60_000,
        }).toEqual(chips(expected.enrolled));
        await expect(pages.employee.clearTemplateButton).toBeVisible();
        expect(await pages.employee.readPhotoSize(), 'the photo should be the picture from the device file').toEqual(file.picture);
        await expect(pages.employee.photoClearButton).toBeEnabled();
        await expect.poll(() => pages.employee.readIrisEnrollment(), {
            message: 'the Iris section should show the three iris templates enrolled and Face not',
        }).toMatchObject(enrolledIris);
        const after = await pages.employee.readProfileSummary();
        const { name, code, crew, payPeriod, hireDate } = before;
        expect(after, 'the import should leave the employee profile unchanged').toMatchObject({ name, code, crew, payPeriod, hireDate });

        // 9. Catalog step 3: issue the RFID code as the card fallback.
        await pages.employee.setRfidCode(run.rfidCode);
        await pages.employee.gotoEditById(employeeId, employee.name);
        await expect(pages.employee.rfidCodeInput).toHaveValue(run.rfidCode);
        await expect.poll(() => pages.employee.readIrisEnrollment(), {
            message: 'the RFID save should not disturb the iris enrollment',
        }).toMatchObject(enrolledIris);

        // 10. Add the employee to the device.
        await pages.scanDevice.gotoEdit(deviceId, device.name);
        await pages.scanDevice.waitForEditReady();
        await pages.scanDevice.setIncludeEmployee();
        await pages.scanDevice.addEmployee(run.deviceLabel);
        await expect(pages.scanDevice.includeEmployeeSwitch).toBeChecked();
        await expect(pages.scanDevice.employeeRow(run.deviceLabel)).toBeVisible();
        await pages.scanDevice.save(deviceId);
        await expect(pages.scanDevice.savedToast).toBeVisible();

        // 11. Catalog step 4 (substitute): push the setup to the device.
        const { destination, runId: pushRunId } = await pages.scanDevice.pushToDevice();
        await expect(pages.scanDevice.pushSucceeded).toBeVisible();
        expect(destination, 'the push should target the run device mailbox').toContain(device.webMailAddress);
        await expect(pages.scanDevice.pushDownloadFile).toBeVisible();
        expect(pushRunId, 'the push should create an export run').toBeTruthy();

        // 12. The pushed file carries the employee with the RFID code and the imported templates.
        const pushed = await readPushedEmployee(sessionApi, testInfo, pushRunId, deviceId, employee.code);
        expect(pushed, 'the pushed file should carry the employee with the RFID code and the imported templates').toMatchObject({
            name: employee.name,
            rfidCode: run.rfidCode,
            templates: file.templates,
        });
    });

});
