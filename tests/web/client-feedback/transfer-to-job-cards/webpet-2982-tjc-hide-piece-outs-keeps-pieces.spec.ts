/**
 * WEBPET-2982 — Transfer to Job Cards: Hide piece-outs hides the piece-out rows but the Pieces total stays the same.
 * Data: src/data/client-feedback/webpet-2982-tjc-hide-piece-outs-keeps-pieces.json · Plan: test-plans/client-feedback/webpet-2982-tjc-hide-piece-outs-keeps-pieces.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcHidePieceOutsCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-2982 · Transfer to Job Cards: hide piece-outs keeps the pieces total', { tag: ['@ClientFeedback', '@WEBPET-2982'] }, () => {
    test('Hide piece-outs removes the piece-out rows and leaves the Pieces total unchanged', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-2982' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcHidePieceOutsCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then a piece-job day (crew piece-out included) seeded on screen.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);

        // 1. Open Transfer to Job Cards, scope the day and the crew, analyze.
        await tjc.openFromMenu();
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: seed.timeCardCounters.length });

        // 2. The analyzed grid shows the piece-out row and the Pieces total.
        await expect(tjc.totalsCaption, 'the analyzed caption').toHaveText(s.expected.analyzedCaption);
        await expect.poll(() => tjc.totalsNumber('Pieces'), { message: 'Pieces total before hiding' }).toBe(s.expected.pieces);
        const pieceOuts = await tjc.rowsOfType(s.expected.pieceOutType);
        expect(pieceOuts, 'the piece-out rows before hiding').toHaveLength(s.expected.pieceOutRows);
        const pieceOutReference = pieceOuts[0].reference;

        // 3. Tick Hide piece-outs: the piece-out row goes, the Pieces total stays, no new analyze is sent.
        const analyzes = tjc.countAnalyzeRequests();
        await tjc.setHidePieceOuts(true);
        await expect(tjc.totalsCaption, 'the caption counts the cards without the piece-out').toHaveText(s.expected.hiddenCaption);
        await expect.poll(() => tjc.totalsNumber('Pieces'), { message: 'Pieces total with piece-outs hidden' }).toBe(s.expected.pieces);
        await expect.poll(() => tjc.candidateReferences(), { message: 'the piece-out row is hidden' }).not.toContain(pieceOutReference);
        expect(analyzes.count(), 'hiding piece-outs is a display lens and sends no analyze').toBe(s.expected.analyzeRequestsOnToggle);
        analyzes.stop();

        // 4. Untick: the piece-out row and the caption come back, the Pieces total is still the same.
        await tjc.setHidePieceOuts(false);
        await expect(tjc.totalsCaption, 'the caption is back').toHaveText(s.expected.analyzedCaption);
        await expect.poll(() => tjc.totalsNumber('Pieces'), { message: 'Pieces total after unhiding' }).toBe(s.expected.pieces);
        await expect.poll(() => tjc.candidateReferences(), { message: 'the piece-out row is back' }).toContain(pieceOutReference);
    });
});
