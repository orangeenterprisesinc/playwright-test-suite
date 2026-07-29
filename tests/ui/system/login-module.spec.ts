import { expect, test } from '@fixtures/base.fixture';
import { loginModuleData } from '@data/system/loginModuleData';

// The login module must always start from a logged-out state, so discard any
// stored authentication for every test in this file.
test.use({
    storageState: {
        cookies: [],
        origins: []
    }
});

// Login is not a catalog workflow — it is the gate every journey starts behind
// (catalog A1 step 5, "Verify login"), so it lives under tests/ui/system/ and
// carries `@System` rather than a journey tag.
test.describe('Login Tests', { tag: ['@System', '@login'] }, () => {

    test('[Login] Verify that the user cannot log on with an invalid password.', {
        tag: ['@UI', '@Local'],
        annotation: { type: 'testCaseId', description: 'UI-002' }
    }, async ({ gotoUrl: _gotoUrl, loginPage }) => {
        await loginPage.loginPetTiger(process.env.USER_NAME!, loginModuleData.wrong_password);
        await expect(loginPage.invalidCredentialsErrorMessage).toHaveText(loginModuleData.invalid_credentials_error_message);
        await expect(loginPage.emailInput).toBeVisible();
    });

    test('[Login] Verify that the user cannot log on with an invalid username.', {
        tag: ['@UI', '@Local'],
        annotation: { type: 'testCaseId', description: 'UI-003' }
    }, async ({ gotoUrl: _gotoUrl, loginPage }) => {
        await loginPage.loginPetTiger(loginModuleData.wrong_username, process.env.PASSWORD!);
        await expect(loginPage.invalidCredentialsErrorMessage).toHaveText(loginModuleData.invalid_credentials_error_message);
        await expect(loginPage.emailInput).toBeVisible();
    });

    test('[Login] Verify that the user cannot log on with an invalid username and password.', {
        tag: ['@UI', '@Local'],
        annotation: { type: 'testCaseId', description: 'UI-004' }
    }, async ({ gotoUrl: _gotoUrl, loginPage }) => {
        await loginPage.loginPetTiger(loginModuleData.wrong_username, loginModuleData.wrong_password);
        await expect(loginPage.invalidCredentialsErrorMessage).toHaveText(loginModuleData.invalid_credentials_error_message);
        await expect(loginPage.emailInput).toBeVisible();
    });

    test('[Login] Verify that the user can log in with valid username and password.', {
        tag: ['@Smoke', '@Local'],
        annotation: { type: 'testCaseId', description: 'UI-001' }
    }, async ({ gotoUrl: _gotoUrl, loginPage, leftNavigationPage }) => {
        await loginPage.loginPetTiger(process.env.USER_NAME!, process.env.PASSWORD!);
        await expect(leftNavigationPage.searchMenu).toBeVisible();
        await expect(leftNavigationPage.welcomeBack).toBeVisible();
    });

});
