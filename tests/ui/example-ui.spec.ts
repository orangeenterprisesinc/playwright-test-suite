/**
 * @fileoverview UI e2e test TEMPLATE (PET Tiger).
 *
 * Category: **UI**. Pure browser journeys driven through Page Objects. Import
 * { test, expect } from the base.fixture. Follows repo conventions: standard
 * test.describe/test with tags, Page Object Model, and the locator priority
 * (CSS id → getByRole → data-testid → getByText).
 *
 * This is a TEMPLATE: replace with real page objects/steps and remove `.fixme`.
 *
 * @see src/fixtures/base.fixture.ts
 * @see tests/ui/login/login-module.spec.ts   (a real, working UI spec to copy from)
 */
import { test, expect } from '../../src/fixtures/base.fixture';

test.describe('UI — <module> journey', { tag: ['@UI'] }, () => {

    test.fixme('user reaches the authenticated shell', async ({ loginPage, leftNavigationPage }) => {
        await loginPage.gotoPetTiger();
        await loginPage.loginPetTiger(process.env.USER_NAME!, process.env.PASSWORD!);
        await expect(leftNavigationPage.searchMenu).toBeVisible();
        // TODO: continue the journey with a Page Object for the target module.
    });

    // Data-driven variant — link the test to an external data row (JSON or CSV)
    // by id; the testCaseData fixture auto-loads and validates it.
    test.describe('data-driven', () => {
        test.use({ testCaseId: 'TC-UI-001' });

        test.fixme('runs from an external data row', async ({ testCaseData }) => {
            // testCaseData comes DIRECTLY from the configured source (runnerManager.json / .csv).
            expect(testCaseData.enabled).toBeTruthy();
            // TODO: use testCaseData fields (testTitle, expectedCount, …) to drive the UI.
        });
    });
});
