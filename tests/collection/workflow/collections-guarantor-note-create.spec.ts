import { test } from '../../../src/fixtures/base.fixture';
import { expect } from '@playwright/test';
import { withAnnotation } from '../../../src/annotations';
import { CategoryType } from '../../../src/enums/categoryType';
import { ConfigProperties, getConfigValue } from '../../../src/enums/configProperties';
import { LoginPage } from '@pages/LoginPage';
import { AccountReviewPage } from '@pages/AccountReviewPage';
import { executeWithAuthRetry } from '../../../src/auth/requestBuilder';
import { verifyJsonKeyValues } from '../../../src/utils/apiResponseUtils';
import { retrieveRowData } from '../../../src/utils/databaseQueryExecutor';

const NOTE_TEXT = 'test';

test.describe('Guarantor Account Note - UI to API Validation', () => {
    test.use({ testCaseId: 'WF-001' });
    test('verifyUserCanCreateGuarantorAccountNote_AndValidateInAPI', async ({ page, testCaseData, apiRequest }, testInfo) => {
        const row = await retrieveRowData("SELECT * FROM guarantor_account where guarantor_id is not null and financial_status is not null and assigned_staff_id is not null order by created_date desc limit 1 ;");
        let guarantorId: string = row.guarantor_id;
        withAnnotation(testInfo, {
            authors: ['Vicky'],
            categories: [CategoryType.REGRESSION, CategoryType.UI],
            description: testCaseData.testDescription ?? `Search guarantor ${guarantorId}, add account note "${NOTE_TEXT}", and verify it appears in History`,
        });
        const loginPage = new LoginPage(page);
        const accountReviewPage = new AccountReviewPage(page);
        await loginPage.navigate();
        await loginPage.assertLoginPageLoaded();
        await loginPage.login(
            getConfigValue(ConfigProperties.APP_USERNAME),
            getConfigValue(ConfigProperties.APP_PASSWORD),
        );
        await accountReviewPage.assertTabIsActive();
        await accountReviewPage.searchGuarantor(guarantorId);
        await accountReviewPage.assertTextareaNotEditable();
        await accountReviewPage.selectRow();
        await accountReviewPage.assertTextareaEditable();
        await accountReviewPage.fillNote(NOTE_TEXT);
        await accountReviewPage.clickSave();
        await accountReviewPage.confirmSave();
        await accountReviewPage.assertSaveNotification();
        await accountReviewPage.assertNoteInHistory(NOTE_TEXT);

        // ── API Validation: verify the note exists via REST API ──
        const response = await executeWithAuthRetry( apiRequest, 'GET',`./guarantor/${guarantorId}/notes?page=1&pageSize=1&order=DESC&sort=createdDate`, {},testInfo,);
        expect(await verifyJsonKeyValues(response, { accountNote: NOTE_TEXT }), `Expected accountNote to contain "${NOTE_TEXT}"`).toBeTruthy();
    });
});