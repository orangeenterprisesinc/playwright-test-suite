/**
 * WEBPET-3715 — Export to Accounting no longer has the Scope Adjustments panel or the Include re-export candidates toggle.
 * Data: src/data/client-feedback/webpet-3715-eta-no-scope-adjustments.json · Plan: test-plans/client-feedback/webpet-3715-eta-no-scope-adjustments.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EtaNoScopeAdjustmentsCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';

test.describe('WEBPET-3715 · Export to Accounting: no Scope Adjustments', { tag: ['@ClientFeedback', '@WEBPET-3715'] }, () => {
    test('Export to Accounting no longer has the Scope Adjustments panel or the Include re-export candidates toggle', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3715' }],
    }, async ({ pages }, testInfo) => {
        const s = await loadScenario(EtaNoScopeAdjustmentsCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const eta = pages.exportToAccounting;

        // 1. Open Export to Accounting from the menu; no rows are needed.
        await eta.openFromMenu();

        // 2. Neither the panel nor the toggle is on the screen.
        for (const t of s.expected.absent) await expect(eta.screenText(t), `${t} is gone`).toHaveCount(0);

        // 3. The first items under the step bar are Refine, Dates, Search by.
        const labels = await eta.labelsUnderStepBar();
        expect(labels[0], 'Refine is first under the step bar').toBe(s.expected.firstItems[0]);
        expect(labels.filter((l) => s.expected.firstItems.includes(l)).slice(0, 3)).toEqual(s.expected.firstItems);
    });
});
