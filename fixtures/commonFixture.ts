import { test as baseTest, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { LeftNavigationPage } from '../pages/LeftNavigationpage';

type PomFixtureType = {
    loginPage: LoginPage;
    leftNavigationPage: LeftNavigationPage;
};

export const test = baseTest.extend<PomFixtureType>({

    loginPage: async ({ page }, use) => {
        await use(new LoginPage(page));
    },

    leftNavigationPage: async ({ page }, use) => {
        await use(new LeftNavigationPage(page));
    },

});

export { expect };
