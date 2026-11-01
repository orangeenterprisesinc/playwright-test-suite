/**
 * WEBPET-3889 — View ▸ Time Cards: several checked time cards can be deleted together.
 * Data: src/data/client-feedback/webpet-3889-vtc-multi-delete.json · Plan: test-plans/client-feedback/webpet-3889-vtc-multi-delete.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VtcMultiDeleteCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { forgetCards, ownCard, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3889 · View Time Cards: delete several checked cards', { tag: ['@ClientFeedback', '@WEBPET-3889'] }, () => {
    test('several checked time cards can be deleted together on View > Time Cards', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3889' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(VtcMultiDeleteCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const view = pages.viewTimeCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then one employee's Time In and Time Out seeded on screen.
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);

        // 1. Open View > Time Cards, scope the day and the Time Card Crew, apply.
        await view.openFromMenu();
        await view.scopeToDay(run.day);
        await view.scopeToTimeCardCrew(run.crew.name);
        await view.applyFilter();
        expect(await view.totalRows(), 'the crew-day loads its own cards').toBe(s.expected.rows);

        // 2. Delete is greyed out until rows are ticked.
        const cards = [ownCard(run, 'one', 'timeIn'), ownCard(run, 'one', 'timeOut')];
        await expect(view.deleteButton, 'Delete is greyed out with nothing ticked').toBeDisabled();
        await view.cardGrid.selectRows(cards.map((c) => c.reference));
        await expect(view.deleteButton, 'Delete is enabled with the rows ticked').toBeEnabled();

        // 3. Delete and confirm.
        await view.deleteButton.click();
        await view.confirmDelete(s.expected.confirmHeading, s.expected.confirmText);
        forgetCards(run, cards.map((c) => c.id));

        // 4. The toast reports the count and the rows are gone.
        await expect(view.toast(s.expected.toast), 'the delete is reported').toBeVisible({ timeout: 15_000 });
        for (const card of cards) {
            await expect(view.row(card.reference), `${card.reference} left the grid`).toHaveCount(0);
        }
        await expect(view.emptyState, 'nothing is left in the grid').toBeVisible();
    });
});
