import { expect, test } from '../fixtures/hooks-fixture';
import loginModuleData from '../data/login-module-data.json';

// The login module must always start from a logged-out state, so discard any
// stored authentication for every test in this file.
test.use({
    storageState: {
        cookies: [],
        origins: []
    }
});

test.describe("Login Tests", {
    tag: '@login',
    annotation: {
        type: 'Story link:',
        description: 'Verify PET Tiger login behaviour for valid and invalid credentials.'
    }
}, () => {

    test('[Login] Verify that the user cannot log on with an invalid password.', {
        tag: ['@UI', '@Local'],
        annotation: {
            type: 'Test case Link', description: 'Verify that the user cannot log on with an invalid password.'
        }
    }, async ({ gotoUrl, loginPage }) => {
        await loginPage.loginPetTiger(process.env.USER_NAME!, loginModuleData.wrong_password);
        await expect(loginPage.invalidCredentialsErrorMessage).toHaveText(loginModuleData.invalid_credentials_error_message);
        await expect(loginPage.emailInput).toBeVisible();
    });

    test('[Login] Verify that the user cannot log on with an invalid username.', {
        tag: ['@UI', '@Local']
    }, async ({ gotoUrl, loginPage }) => {
        await loginPage.loginPetTiger(loginModuleData.wrong_username, process.env.PASSWORD!);
        await expect(loginPage.invalidCredentialsErrorMessage).toHaveText(loginModuleData.invalid_credentials_error_message);
        await expect(loginPage.emailInput).toBeVisible();
    });

    test('[Login] Verify that the user cannot log on with an invalid username and password.', {
        tag: ["@UI", "@Local"]
    }, async ({ gotoUrl, loginPage }) => {
        await loginPage.loginPetTiger(loginModuleData.wrong_username, loginModuleData.wrong_password);
        await expect(loginPage.invalidCredentialsErrorMessage).toHaveText(loginModuleData.invalid_credentials_error_message);
        await expect(loginPage.emailInput).toBeVisible();
    });

    test('[Login] Verify that the user can log in with valid username and password.', {
        tag: ['@Smoke', '@Local'],
        annotation: {
            type: 'test case Link',
            description: 'Verify that the user can log in with valid username and password.'
        }
    }, async ({ gotoUrl, loginPage, leftNavigationPage }) => {
        await loginPage.loginPetTiger(process.env.USER_NAME!, process.env.PASSWORD!);
        await expect(leftNavigationPage.searchMenu).toBeVisible();
        await expect(leftNavigationPage.welcomeBack).toBeVisible();
    });

});
