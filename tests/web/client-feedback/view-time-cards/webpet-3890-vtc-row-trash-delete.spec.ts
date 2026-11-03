/**
 * WEBPET-3890 — View ▸ Time Cards: each row has a trash bin icon that deletes that one time card.
 * Data: src/data/client-feedback/webpet-3890-vtc-row-trash-delete.json · Plan: test-plans/client-feedback/webpet-3890-vtc-row-trash-delete.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VtcRowTrashCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { forgetCards, ownCard, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3890 · View Time Cards: row trash icon', { tag: ['@ClientFeedback', '@WEBPET-3890'] }, () => {
    test('each row on View > Time Cards has a trash bin icon that deletes that one time card', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3890' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(VtcRowTrashCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const view = pages.viewTimeCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then one Time In seeded on screen.
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);

        // 1. Open View > Time Cards, scope the day and the Time Card Crew, apply.
        await view.openFromMenu();
        await view.scopeToDay(run.day);
        await view.scopeToTimeCardCrew(run.crew.name);
        await view.applyFilter();
        expect(await view.totalRows(), 'the crew-day loads its own card').toBe(s.expected.rows);

        // 2. The row carries + then the trash icon, left of the Work Crew / Employee cells.
        const card = ownCard(run, 'one', 'timeIn');
        const add = await view.leftEdge(view.rowAddButton(card.reference));
        const trash = await view.leftEdge(view.rowTrashButton(card.reference));
        const employee = await view.leftEdge(await view.cellByHeader(view.row(card.reference), 'Employee'));
        expect(add, 'the + button is left of the trash icon').toBeLessThan(trash);
        expect(trash, 'the trash icon is left of the data cells').toBeLessThan(employee);

        // 3. Click the trash icon and confirm.
        await view.rowTrashButton(card.reference).click();
        await view.confirmDelete(s.expected.confirmHeading.replace('{reference}', card.reference), s.expected.confirmText);
        forgetCards(run, [card.id]);

        // 4. The toast confirms and the row is gone.
        await expect(view.toast(s.expected.toast), 'the delete is reported').toBeVisible({ timeout: 15_000 });
        await expect(view.row(card.reference), 'the card left the grid').toHaveCount(0);
        await expect(view.emptyState, 'nothing is left in the grid').toBeVisible();
    });
});
