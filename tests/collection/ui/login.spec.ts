import { test } from '../../../src/fixtures/base.fixture';
import { withAnnotation } from '../../../src/annotations';
import { CategoryType } from '../../../src/enums/categoryType';
import { ConfigProperties, getConfigValue } from '../../../src/enums/configProperties';
import { LoginPage } from '@pages/LoginPage';
import { generateRandomNumericString } from '@utils/randomUtils';

test.describe('Login page loads with all form elements', () => {
    test.use({ testCaseId: 'UI-001' });
    test('Login page loads with all form elements', async ({ page, testCaseData }, testInfo) => {
        withAnnotation(testInfo, {
            authors: ['Vicky'],
            categories: [CategoryType.REGRESSION, CategoryType.UI],
            description: testCaseData.testDescription ?? 'Verifies Keycloak login page renders heading, username, password fields and Sign In button',
        });
        const loginPage = new LoginPage(page);
        await loginPage.navigate();
        await loginPage.assertLoginPageLoaded();
        await loginPage.login(
            getConfigValue(ConfigProperties.APP_USERNAME),
            getConfigValue(ConfigProperties.APP_PASSWORD),
        );
        await loginPage.assertLoginSuccess();
    });
});

test.describe('Login fails with invalid credentials', () => {
    test.use({ testCaseId: 'UI-002' });
    test('Login fails with invalid credentials', async ({ page, testCaseData }, testInfo) => {
        withAnnotation(testInfo, {
            authors: ['Vicky'],
            categories: [CategoryType.REGRESSION, CategoryType.UI],
            description: testCaseData.testDescription ?? 'Verifies login fails with invalid credentials and error message is shown',
        });
        const loginPage = new LoginPage(page);
        await loginPage.navigate();
        await loginPage.assertLoginPageLoaded();
        await loginPage.login(generateRandomNumericString(10), generateRandomNumericString(10));
        await loginPage.assertLoginFailed();
    });
});
