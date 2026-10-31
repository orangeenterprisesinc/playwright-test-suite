/**
 * WEBPET-2906 — Deleting job cards makes the transferred Piece Out time cards available again on Transfer to Job Cards.
 * Data: src/data/client-feedback/webpet-2906-tjc-delete-job-cards-untransfers-piece-outs.json · Plan: test-plans/client-feedback/webpet-2906-tjc-delete-job-cards-untransfers-piece-outs.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcDeleteUntransfersCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { deleteOwnJobCards, prepareCfRun, seedCrewDay, transferCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-2906 · Transfer to Job Cards: deleting job cards untransfers piece-outs', { tag: ['@ClientFeedback', '@WEBPET-2906'] }, () => {
    test('after the job cards are deleted the transferred Piece Out time cards are available again', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-2906' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(TjcDeleteUntransfersCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const view = pages.viewJobCards;
        const deps = { sessionApi, testInfo, pages };
        const e = s.expected;

        // 0. Arrange: the crew's fixture rows, then a piece-job day seeded on screen with a crew piece-out and an individual piece-out.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);

        // 1. Transfer the crew's day; the app lands on View > Job Cards with this run.
        const transfer = await transferCrewDay(run, deps, seed, e.jobCards);

        // 2. Delete each of this transfer's own job cards (Delete Selected, one row at a time); the grid ends empty.
        const deleted = await deleteOwnJobCards(run, deps, transfer, e.deleteConfirmSuffix);
        expect(deleted, 'one delete per job card the transfer wrote').toHaveLength(e.jobCards);
        await expect(view.rowsForCrew(run.crew.name).first(), 'no job card of the crew is left').toBeHidden();

        // 3. Back on Transfer, analyze the day again.
        await tjc.openFromMenu();
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: seed.timeCardCounters.length });

        // 4. Every Piece Out row is listed again, is not transferred, and the Pieces total is whole.
        const pieceOuts = await tjc.rowsOfType(e.pieceOutType);
        const byEmployee = (a: { employee: string }, b: { employee: string }) => a.employee.localeCompare(b.employee);
        expect(
            pieceOuts.map((r) => ({ employee: r.employee, pieces: r.pieces })).sort(byEmployee),
            'both piece-outs are back with their pieces',
        ).toEqual([...e.pieceOuts].sort(byEmployee));
        for (const row of pieceOuts) {
            expect(await tjc.rowTransferred(row.reference), `${row.reference} is not transferred`).toBe(e.transferred);
        }
        await expect.poll(() => tjc.totalsNumber('Pieces'), { message: 'Pieces total counts both piece-outs' }).toBe(e.pieces);
    });
});
