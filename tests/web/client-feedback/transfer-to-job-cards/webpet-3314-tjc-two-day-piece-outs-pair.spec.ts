/**
 * WEBPET-3314 — Transfer to Job Cards: individual and crew piece-outs across two days (an overnight shift) all pair and show no unpaired warnings.
 * Data: src/data/client-feedback/webpet-3314-tjc-two-day-piece-outs-pair.json · Plan: test-plans/client-feedback/webpet-3314-tjc-two-day-piece-outs-pair.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcTwoDayPieceOutsCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { createOwnJob, mintOwnJob, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3314 · Transfer to Job Cards: two-day piece-outs pair', { tag: ['@ClientFeedback', '@WEBPET-3314'] }, () => {
    test('Individual and crew piece-outs across two days all pair and show no unpaired warnings', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3314' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcTwoDayPieceOutsCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the run's own Time & Piece job (its delete is registered first, so it runs after the cards are gone), then the overnight shift.
        const minted = mintOwnJob(deps, s.ticket, s.ownJob.noun);
        const run = await prepareCfRun(s, deps);
        const job = await createOwnJob(run, deps, minted, s.ownJob);
        expect(Number(job.hourlyRate), 'precondition: the job saved its hourly rate').toBe(s.ownJob.hourlyRate);
        expect(Number(job.pieceRate), 'precondition: the job saved its piece rate').toBe(s.ownJob.pieceRate);
        await seedCrewDay(run, deps, s.seed);

        // 1. Open Transfer to Job Cards from the left menu.
        await tjc.openFromMenu();

        // 2. Scope both days and the Time Card Crew.
        await tjc.scopeToRange(run.day, run.extra[0].day);
        await tjc.scopeToTimeCardCrew(run.crew.name);

        // 3. Analyze: every card of the two days loads.
        await tjc.analyzeCandidates({ expected: s.expected.analyzed });
        await expect(tjc.totalsCaption, 'the analyzed count is shown').toHaveText(s.expected.analyzedCaption);

        // 4. Every record is Ready: no blocking, no unpaired warning, and the footer says all of them transfer.
        await expect.poll(() => tjc.readyCount(), { message: 'every record is Ready' }).toBe(s.expected.ready);
        await expect.poll(() => tjc.blockingCount(), { message: 'no Blocking record' }).toBe(s.expected.blocking);
        await expect.poll(() => tjc.warningsPillCount(), { message: 'no unpaired / warning record' }).toBe(s.expected.warnings);
        expect(new Set(await tjc.visibleStatuses()), 'every row, the next-day piece-outs included, reads Ready').toEqual(new Set([s.expected.status]));
        await expect(tjc.scopeHint, 'the footer says all eligible records transfer').toHaveText(s.expected.footer);
    });
});
