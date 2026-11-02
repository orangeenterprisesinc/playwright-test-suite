/**
 * WEBPET-3713 — On Export to Accounting the row checkboxes are disabled until Multi Edit is switched on.
 * Data: src/data/client-feedback/webpet-3713-eta-multi-edit-checkboxes.json · Plan: test-plans/client-feedback/webpet-3713-eta-multi-edit-checkboxes.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EtaMultiEditCheckboxesCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay, transferCrewDay, withCrewEta } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3713 · Export to Accounting: Multi Edit checkboxes', { tag: ['@ClientFeedback', '@WEBPET-3713'] }, () => {
    test('On Export to Accounting the row checkboxes are disabled until Multi Edit is switched on', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3713' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(EtaMultiEditCheckboxesCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const eta = pages.exportToAccounting;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's day seeded on screen and transferred (teardown deletes the own job cards and time cards by id).
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);
        const transfer = await transferCrewDay(run, deps, seed, s.expected.jobCards);

        // 1. Export to Accounting scoped to the crew-day, Refresh, then the checkboxes before, during and after Multi Edit.
        await withCrewEta(run, deps, async () => {
            const own = transfer.jobCardCounters[0];
            await expect(eta.rowCheckboxes()).toHaveCount(s.expected.jobCards);
            for (const box of await eta.rowCheckboxes().all()) await expect(box, 'read-only before Multi Edit').toBeDisabled();
            await eta.setMultiEdit(true);
            for (const box of await eta.rowCheckboxes().all()) await expect(box, 'enabled in Multi Edit').toBeEnabled();
            await eta.setRowTicked(own, true);
            await expect(eta.updateRecordsButton).toHaveText(s.expected.updateLabel);
            // Never run the update: untick, then leave Multi Edit.
            await eta.setRowTicked(own, false);
            await eta.setMultiEdit(false);
            for (const box of await eta.rowCheckboxes().all()) await expect(box, 'read-only again').toBeDisabled();
        });
    });
});
