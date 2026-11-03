/**
 * WEBPET-3503 — File ▸ Administration ▸ Reports: the For filter shows only reports for exactly the chosen module.
 * Data: src/data/client-feedback/webpet-3503-reports-hub-for-filter.json · Plan: test-plans/client-feedback/webpet-3503-reports-hub-for-filter.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { ReportsHubForFilterCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';

test.describe('WEBPET-3503 · Reports hub: For filter is exact', { tag: ['@ClientFeedback', '@WEBPET-3503'] }, () => {
    test("The Reports hub 'For' filter shows only reports for exactly the chosen module", {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3503' }],
    }, async ({ pages }, testInfo) => {
        const s = await loadScenario(ReportsHubForFilterCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const hub = pages.reportsHub;

        // 1. File > Administration > Reports.
        await hub.openFromMenu();

        for (const check of s.expected.filters) {
            // 2. For = the module; the filtered view is small enough to render every row.
            await hub.clearModuleFilter();
            await hub.filterByModule(check.module);
            const total = await hub.expectFullyRendered();
            expect(total, `For = ${check.module} lists reports`).toBeGreaterThan(0);

            // 3. Every row's For is exactly the module; none of the look-alike modules appear.
            const modules = (await hub.rowsForCells()).map((r) => r.module);
            expect(modules.filter((m) => m !== check.module), `every For is exactly ${check.module}`).toEqual([]);
            for (const other of check.absent) expect(modules, `no ${other} row under ${check.module}`).not.toContain(other);
        }
    });
});
