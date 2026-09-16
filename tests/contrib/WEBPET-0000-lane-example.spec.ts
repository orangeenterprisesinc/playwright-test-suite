/**
 * Worked example for the developer-contribution lane — and its only permanent
 * resident. `WEBPET-0000` is not a real ticket; this file exists so the lane's
 * own machinery (fixture, gate, row sync, project isolation) is exercised even
 * when no contribution is in flight, and so a contributor has something to copy.
 *
 * It asserts the least interesting thing that is still true: the Crop list
 * screen loads for an authenticated session. A contributed spec should assert
 * the behaviour its ticket changed — see `docs/DEV-E2E-CONTRIBUTION.md`.
 *
 * The four things this lane requires, all visible below:
 *   1. filename `<TICKET-KEY>-<slug>.spec.ts`
 *   2. the import is `@fixtures/contrib.fixture` — any other fixture resolves
 *      ids against the wrong row source and skips green
 *   3. describe tags exactly `@Contrib` + `@<TICKET-KEY>`
 *   4. every test carries one `@wp-ui`/`@wp-api`, one tier tag, and a
 *      `testCaseId` of `<TICKET-KEY>-<nn>`
 */
import { expect, test } from '@fixtures/contrib.fixture';

test.describe('Contrib lane example', { tag: ['@Contrib', '@WEBPET-0000'] }, () => {
    test('[Crop] Verify that the crop list screen loads.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-0000-01' }],
    }, async ({ pages }) => {
        await pages.cropList.goto();
        await expect(pages.cropList.heading).toBeVisible();
    });
});
