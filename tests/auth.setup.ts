/**
 * @fileoverview Authentication setup — runs once before the browser projects.
 *
 * Logs into PET Tiger with the configured credentials and persists the
 * session to `.auth/user.json`, which every browser project loads as its
 * storageState so authenticated tests skip the login UI.
 *
 * Ported from the original demo framework's global.setup.ts — the redirect
 * wait and sidebar landmark assertion below were debugged against the real
 * app; keep their ordering.
 */
import { expect, test as setup } from '../src/fixtures/base.fixture';

setup('Global setup for Auto Login', async ({ page, loginPage, leftNavigationPage }) => {

    const userName = process.env.USER_NAME!;
    const password = process.env.PASSWORD!;

    await loginPage.gotoPetTiger();
    await loginPage.loginPetTiger(userName, password);

    // Wait for the redirect out of /login into the authenticated app shell,
    // then confirm a post-login landmark before persisting the session.
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 20000 });
    await expect(leftNavigationPage.searchMenu).toBeVisible({ timeout: 20000 });

    await page.context().storageState({ path: '.auth/user.json' });
});
