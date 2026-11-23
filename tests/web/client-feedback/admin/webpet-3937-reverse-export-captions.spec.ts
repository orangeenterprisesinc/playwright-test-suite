/**
 * WEBPET-3937 — Reverse Export to Accounting keeps the legacy caption (new shell: one card on the Export hub).
 * Data: src/data/client-feedback/webpet-3937-reverse-export-captions.json · Plan: test-plans/client-feedback/webpet-3937-reverse-export-captions.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { RestoreReverseCaptionsCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';

test.describe('WEBPET-3937 · Export hub: legacy reverse-export caption', { tag: ['@ClientFeedback', '@WEBPET-3937'] }, () => {
    test("The reverse export card reads 'Reverse Export to Accounting (Payroll / Cost Accounting)'", {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3937' }],
    }, async ({ pages, page }, testInfo) => {
        const s = await loadScenario(RestoreReverseCaptionsCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);

        // 1. Export hub: the reverse card carries the legacy caption.
        await pages.leftNav.openHub(s.hub);
        await expect(pages.leftNav.hubCard(s.card.route), `the '${s.card.title}' card`).toContainText(s.card.title);

        // 2. The old captions are gone from the hub.
        for (const old of s.expected.oldCaptions) await expect(page.getByText(old), `'${old}' is gone`).toHaveCount(0);
    });
});
