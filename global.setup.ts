import { test } from './fixtures/commonFixture';
import { expect } from '@playwright/test';

test('Global setup for Auto Login', async ({ page, loginPage, leftNavigationPage }) => {

    const userName = process.env.USER_NAME!;
    const password = process.env.PASSWORD!;

    await loginPage.gotoPetTiger();
    await loginPage.loginPetTiger(userName, password);

    // Wait for the redirect out of /login into the authenticated app shell,
    // then confirm a post-login landmark before persisting the session.
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 20000 });
    await expect(leftNavigationPage.searchMenu).toBeVisible({ timeout: 20000 });

    await page.context().storageState({ path: './playwright/.auth/storageState.json' });
});
