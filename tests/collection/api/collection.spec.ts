import { test } from '../../../src/fixtures/base.fixture';
import { expect } from '@playwright/test';
import { withAnnotation } from '../../../src/annotations';
import { CategoryType } from '../../../src/enums/categoryType';
import { executeWithAuthRetry } from '../../../src/auth/requestBuilder';
import { isStatusCodeEqualTo, verifyJsonKeyValues } from '../../../src/utils/apiResponseUtils';
import { retrieveRowData } from '../../../src/utils/databaseQueryExecutor';
import { generateRandomAlphaNumericSpecialString } from '@utils/randomUtils';

const NOTE_TEXT = generateRandomAlphaNumericSpecialString(20);
const UPDATE_NOTE_TEXT = generateRandomAlphaNumericSpecialString(20);
let id : string;

test.describe.serial('verifyUserCanCreateGuarantorAccountNoteInAPI_AndValidateInAPI', () => {

    let guarantorId: string;

    test.beforeAll(async () => {
        const row = await retrieveRowData("SELECT * FROM guarantor_account where guarantor_id is not null and financial_status is not null and assigned_staff_id is not null order by created_date desc limit 1 ;");
        guarantorId = row.guarantor_id;
    });

    test.describe('Create a new guarantor account note via API and validate the response', () => {
        test.use({ testCaseId: 'API-001' });
        test('Create a new guarantor account note via API and validate the response', async ({ testCaseData, apiRequest }, testInfo) => {
            withAnnotation(testInfo, {
                authors: ['Vicky'],
                categories: [CategoryType.REGRESSION, CategoryType.API],
                description: testCaseData.testDescription ?? '',
            });
            const response = await executeWithAuthRetry( apiRequest, 'POST',`./guarantor/${guarantorId}/note`, { data: { note: NOTE_TEXT } },testInfo,);
            expect(isStatusCodeEqualTo(response, 200), `Expected status code to be 200`).toBeTruthy();
            const json = await response.json();
            id = json.id;
        });
    });

    test.describe('Verify the created note exists via GET call', () => {
        test.use({ testCaseId: 'API-002' });
        test('Verify the created note exists via GET call', async ({ testCaseData, apiRequest }, testInfo) => {
            withAnnotation(testInfo, {
                authors: ['Vicky'],
                categories: [CategoryType.REGRESSION, CategoryType.API],
                description: testCaseData.testDescription ?? '',
            });
            const response = await executeWithAuthRetry( apiRequest, 'GET',`./guarantor/${guarantorId}/notes?page=1&pageSize=1&order=DESC&sort=createdDate`, {},testInfo,);
            expect(await verifyJsonKeyValues(response, { accountNote: NOTE_TEXT }), `Expected accountNote to contain "${NOTE_TEXT}"`).toBeTruthy();
            
        });
    });

    test.describe('Update the guarantor account note via PUT call', () => {
        test.use({ testCaseId: 'API-003' });
        test('Update the guarantor account note via PUT call', async ({ testCaseData, apiRequest }, testInfo) => {
            withAnnotation(testInfo, {
                authors: ['Vicky'],
                categories: [CategoryType.REGRESSION, CategoryType.API],
                description: testCaseData.testDescription ?? '',
            });
            const response = await executeWithAuthRetry( apiRequest, 'PUT',`./guarantor/note/${id}`, { data: { note: UPDATE_NOTE_TEXT } },testInfo,);
            expect(isStatusCodeEqualTo(response, 200), `Expected status code to be 200`).toBeTruthy();
        });
    });

    test.describe('Verify the updated note exists via GET call', () => {
        test.use({ testCaseId: 'API-004' });
        test('Verify the updated note exists via GET call', async ({ testCaseData, apiRequest }, testInfo) => {
            withAnnotation(testInfo, {
                authors: ['Vicky'],
                categories: [CategoryType.REGRESSION, CategoryType.API],
                description: testCaseData.testDescription ?? '',
            });
            const response = await executeWithAuthRetry( apiRequest, 'GET',`./guarantor/${guarantorId}/notes?page=1&pageSize=1&order=DESC&sort=createdDate`, {},testInfo,);
            expect(await verifyJsonKeyValues(response, { accountNote: UPDATE_NOTE_TEXT }), `Expected accountNote to contain "${UPDATE_NOTE_TEXT}"`).toBeTruthy();
        });
    });
});