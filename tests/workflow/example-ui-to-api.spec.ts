/**
 * @fileoverview Workflow (UI + API hybrid) test TEMPLATE (PET Tiger).
 *
 * Category: **Workflow**. Perform a business action in the UI, then verify the
 * result via the API in the same test — the strongest form of end-to-end proof.
 * Import { test, expect } from the base.fixture (gives page objects + apiRequest);
 * verify with executeWithAuthRetry + verifyJsonKeyValues.
 *
 * This is a TEMPLATE: replace the UI steps and API endpoint with real ones and
 * remove `.fixme` to activate.
 *
 * @see src/fixtures/base.fixture.ts
 * @see src/auth/requestBuilder.ts       (executeWithAuthRetry)
 * @see src/utils/apiResponseUtils.ts    (verifyJsonKeyValues)
 */
import { test, expect } from '../../src/fixtures/base.fixture';
import { executeWithAuthRetry } from '../../src/auth/requestBuilder';
import { verifyJsonKeyValues } from '../../src/utils/apiResponseUtils';

const NOTE_TEXT = 'workflow-template-note';

test.describe('Workflow — create in UI, verify via API', { tag: ['@Workflow'] }, () => {

    test.fixme('user creates a record in the UI and it is present via the API',
        async ({ apiRequest, loginPage }, testInfo) => {
            // 1) UI — log in and perform the action.
            await loginPage.gotoPetTiger();
            await loginPage.loginPetTiger(process.env.USER_NAME!, process.env.PASSWORD!);
            // TODO: drive the real page via a Page Object, e.g.:
            //   await accountReviewPage.searchGuarantor(guarantorId);
            //   await accountReviewPage.fillNote(NOTE_TEXT);
            //   await accountReviewPage.clickSave();
            //   await accountReviewPage.assertSaveNotification();

            // 2) API — verify the same data via REST (auth-retry + JSON key check).
            // TODO: resolve the id by name at runtime — never hardcode ids in real specs.
            const guarantorId = '28114';
            const response = await executeWithAuthRetry(
                apiRequest, 'GET',
                `guarantor/${guarantorId}/notes?page=1&pageSize=1&order=DESC&sort=createdDate`,
                {}, testInfo,
            );
            expect(response.status()).toBe(200);
            expect(
                await verifyJsonKeyValues(response, { accountNote: NOTE_TEXT }),
                `Expected accountNote to contain "${NOTE_TEXT}"`,
            ).toBeTruthy();
        });
});
