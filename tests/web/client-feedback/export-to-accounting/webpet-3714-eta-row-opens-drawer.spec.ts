/**
 * WEBPET-3714 — Clicking a row on Export to Accounting opens the job card in a right-side drawer.
 * Data: src/data/client-feedback/webpet-3714-eta-row-opens-drawer.json · Plan: test-plans/client-feedback/webpet-3714-eta-row-opens-drawer.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EtaRowDrawerCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay, transferCrewDay, withCrewEta } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3714 · Export to Accounting: row opens a drawer', { tag: ['@ClientFeedback', '@WEBPET-3714'] }, () => {
    test('Clicking a row on Export to Accounting opens the job card in a right-side drawer', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3714' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(EtaRowDrawerCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const eta = pages.exportToAccounting;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's day seeded on screen and transferred (teardown deletes the own job cards and time cards by id).
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);
        const transfer = await transferCrewDay(run, deps, seed, s.expected.jobCards);

        // 1. Export to Accounting scoped to the crew-day, Refresh, open a row's drawer, then close it with X.
        await withCrewEta(run, deps, async () => {
            const dates = await eta.datesButton.innerText();
            await eta.openRowDrawer(transfer.jobCardCounters[0]);
            await expect(eta.rowDrawer).toHaveAttribute('data-side', s.expected.side);
            await expect(eta.screenRoot, 'the screen stays behind the drawer').toBeVisible();
            for (const label of s.expected.fieldLabels) await expect(eta.rowDrawer.getByText(label, { exact: true }), label).toBeVisible();
            await expect(eta.rowDrawer.getByRole('combobox', { name: 'Crew' })).toHaveValue(s.expected.crew);
            await eta.closeRowDrawer(); // X only; never Save or Delete
            await expect(eta.datesButton).toHaveText(dates);
            await expect(eta.matchedCount).toHaveText(s.expected.matched);
            expect(await eta.candidates()).toHaveLength(s.expected.jobCards);
        });
    });
});
