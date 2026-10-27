/**
 * Login — the gate every journey starts behind (UI-001…UI-004).
 * Data: src/data/system/login-module.json · Plan: test-plans/system/login.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { ConfigProperties, getConfigValue } from '@config/configProperties';
import { LoginCaseSchema, type LoginCase } from '@data/schemas/systemScenario';
import type { LoginPage } from '@pages/shell/LoginPage';
import { loadScenario } from '@utils/data/scenarioLoader';

// The valid pair is environment (env files / CI secrets), read per test so a test.use override still applies.
const validUserName = (): string => getConfigValue(ConfigProperties.USER_NAME);
const validPassword = (): string => getConfigValue(ConfigProperties.PASSWORD);

// The login module must always start from a logged-out state.
test.use({
    storageState: {
        cookies: [],
        origins: []
    }
});

// UI-R2/UI-R3: a rejected login shows the one invalid-credentials message and leaves the user on the form.
async function expectLoginRejected(loginPage: LoginPage, username: string, password: string, scenario: LoginCase): Promise<void> {
    await loginPage.loginPetTiger(username, password);
    await expect(loginPage.invalidCredentialsErrorMessage).toHaveText(scenario.invalidCredentialsErrorMessage);
    await expect(loginPage.emailInput).toBeVisible();
}

test.describe('Login', { tag: ['@System'] }, () => {

    test('[Login] Verify that the user can log in with valid username and password.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'UI-001' },
        ],
    }, async ({ gotoUrl: _gotoUrl, loginPage, leftNavigationPage }) => {
        await loginPage.loginPetTiger(validUserName(), validPassword());
        await expect(leftNavigationPage.searchMenu).toBeVisible();
        await expect(leftNavigationPage.welcomeBack).toBeVisible();
    });

    test('[Login] Verify that the user cannot log on with an invalid password.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'UI-002' },
        ],
    }, async ({ gotoUrl: _gotoUrl, loginPage }, testInfo) => {
        const scenario = await loadScenario(LoginCaseSchema, testInfo);
        await expectLoginRejected(loginPage, validUserName(), scenario.wrongPassword!, scenario);
    });

    test('[Login] Verify that the user cannot log on with an invalid username.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'UI-003' },
        ],
    }, async ({ gotoUrl: _gotoUrl, loginPage }, testInfo) => {
        const scenario = await loadScenario(LoginCaseSchema, testInfo);
        await expectLoginRejected(loginPage, scenario.wrongUsername!, validPassword(), scenario);
    });

    test('[Login] Verify that the user cannot log on with an invalid username and password.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'UI-004' },
        ],
    }, async ({ gotoUrl: _gotoUrl, loginPage }, testInfo) => {
        const scenario = await loadScenario(LoginCaseSchema, testInfo);
        await expectLoginRejected(loginPage, scenario.wrongUsername!, scenario.wrongPassword!, scenario);
    });

});
