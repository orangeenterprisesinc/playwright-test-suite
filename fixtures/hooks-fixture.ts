import { test as baseTest, expect } from './commonFixture';

type HooksFixtureType = {
    gotoUrl: void;
};

export const test = baseTest.extend<HooksFixtureType>({

    gotoUrl: async ({ loginPage }, use) => {
        await loginPage.gotoPetTiger();
        await use();
    }

});

export { expect } from '@playwright/test';
