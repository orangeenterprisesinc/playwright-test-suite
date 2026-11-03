/**
 * WEBPET-3425 — Setup ▸ Employee ▸ Add fields shows the caption 'Rate', not a raw form.field… key.
 * Data: src/data/client-feedback/webpet-3425-employee-add-fields-rate-caption.json · Plan: test-plans/client-feedback/webpet-3425-employee-add-fields-rate-caption.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { SetupEmployeeAddFieldsCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';

test.describe('WEBPET-3425 · Setup Employee: Add fields captions', { tag: ['@ClientFeedback', '@WEBPET-3425'] }, () => {
    test("The Add fields picker on Setup > Employee shows a real caption 'Rate' instead of a raw key", {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3425' }],
    }, async ({ pages }, testInfo) => {
        const s = await loadScenario(SetupEmployeeAddFieldsCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const employees = pages.employee;

        // 1. Open Setup > Employee from the menu; no rows are needed.
        await employees.gotoList();

        // 2. Add fields lists Rate and no raw translation key.
        const captions = await employees.addFieldsCaptions();
        expect(captions, 'Add fields lists Rate').toContain(s.expected.caption);
        expect(captions.filter((c) => c.includes(s.expected.rawKeyMarker)), 'no raw form.field… key').toEqual([]);
    });
});
