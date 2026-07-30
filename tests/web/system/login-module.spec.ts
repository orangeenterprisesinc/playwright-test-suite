/**
 * Login — the gate every journey starts behind.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/system/login.md` |
 * | Runner rows | `src/data/runner/system.csv` → `UI-001`…`UI-004` |
 *
 * Not a catalog workflow (it is catalog A1 step 5, "Verify login"), so it lives
 * under `tests/web/system/` with `UI-00X` ids and a `@System` describe tag rather
 * than a journey tag.
 */
import { expect, test } from '@fixtures/base.fixture';
import { loginModuleData } from '@data/static/system/loginModuleData';
import type { LoginPage } from '@pages/shell/LoginPage';

// The login module must always start from a logged-out state, so discard any
// stored authentication for every test in this file.
test.use({
    storageState: {
        cookies: [],
        origins: []
    }
});

/**
 * The whole of `UI-R2`/`UI-R3`: a rejected login shows the invalid-credentials
 * message and leaves the user on the form.
 *
 * `UI-002`, `UI-003` and `UI-004` are one requirement with three input
 * combinations, so the assertion lives here once. They stay three separate
 * `test()` calls rather than a loop because `runner:check` resolves a spec's
 * claim on a row by matching a **literal** id in the `testCaseId` annotation
 * (`scripts/lib/runner-data.js` → `specClaims`); a generated
 * `description: testCase.id` matches nothing and all three rows would be
 * reported as "enabled but no spec claims it".
 *
 * All three assert the *same* constant, which is what collectively proves
 * `UI-R3` — the app must not reveal which field was wrong.
 */
async function expectLoginRejected(
    loginPage: LoginPage,
    username: string,
    password: string,
): Promise<void> {
    await loginPage.loginPetTiger(username, password);
    await expect(loginPage.invalidCredentialsErrorMessage)
        .toHaveText(loginModuleData.invalid_credentials_error_message);
    await expect(loginPage.emailInput).toBeVisible();
}

test.describe('Login', { tag: ['@System'] }, () => {

    test('[Login] Verify that the user can log in with valid username and password.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'UI-001' },
            { type: 'requirement', description: 'UI-R1' },
        ],
    }, async ({ gotoUrl: _gotoUrl, loginPage, leftNavigationPage }) => {
        await loginPage.loginPetTiger(process.env.USER_NAME!, process.env.PASSWORD!);
        await expect(leftNavigationPage.searchMenu).toBeVisible();
        await expect(leftNavigationPage.welcomeBack).toBeVisible();
    });

    test('[Login] Verify that the user cannot log on with an invalid password.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'UI-002' },
            { type: 'requirement', description: 'UI-R2|UI-R3' },
        ],
    }, async ({ gotoUrl: _gotoUrl, loginPage }) => {
        await expectLoginRejected(loginPage, process.env.USER_NAME!, loginModuleData.wrong_password);
    });

    test('[Login] Verify that the user cannot log on with an invalid username.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'UI-003' },
            { type: 'requirement', description: 'UI-R2|UI-R3' },
        ],
    }, async ({ gotoUrl: _gotoUrl, loginPage }) => {
        await expectLoginRejected(loginPage, loginModuleData.wrong_username, process.env.PASSWORD!);
    });

    test('[Login] Verify that the user cannot log on with an invalid username and password.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'UI-004' },
            { type: 'requirement', description: 'UI-R2|UI-R3' },
        ],
    }, async ({ gotoUrl: _gotoUrl, loginPage }) => {
        await expectLoginRejected(loginPage, loginModuleData.wrong_username, loginModuleData.wrong_password);
    });

});
