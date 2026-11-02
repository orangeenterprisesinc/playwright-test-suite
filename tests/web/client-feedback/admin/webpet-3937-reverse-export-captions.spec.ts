/**
 * WEBPET-3937 — File ▸ Restore or Reverse: the reverse export items use the legacy captions.
 * Data: src/data/client-feedback/webpet-3937-reverse-export-captions.json · Plan: test-plans/client-feedback/webpet-3937-reverse-export-captions.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { RestoreReverseCaptionsCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';

test.describe('WEBPET-3937 · File ▸ Restore or Reverse: legacy reverse-export captions', { tag: ['@ClientFeedback', '@WEBPET-3937'] }, () => {
    test("The reverse export items read 'Reverse Export to Accounting (Cost Accounting)' and '(Payroll)'", {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3937' }],
    }, async ({ pages }, testInfo) => {
        const s = await loadScenario(RestoreReverseCaptionsCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);

        // 1. Fresh app load, then File ▸ Restore or Reverse.
        const items = await pages.fileMenu.restoreOrReverseItems();

        // 2. The new captions are there, as menu entries.
        for (const caption of s.expected.captions) {
            expect(items, `'${caption}' is listed`).toContain(caption);
            await expect(pages.fileMenu.restoreOrReverseLink(caption), `'${caption}' is a menu entry`).toBeVisible();
        }

        // 3. The old captions are gone.
        for (const old of s.expected.oldCaptions) expect(items, `'${old}' is gone`).not.toContain(old);
    });
});
