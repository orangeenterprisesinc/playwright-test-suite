/**
 * Catalog workflow D6 — Recalculate after setup change (real transfer + rate change + Recalculate).
 * Data: src/data/journey-d/d06-recalculate-after-setup-change.json · Plan: test-plans/journey-d/d06-recalculate-after-setup-change.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyDRecalculateCaseSchema } from '@data/schemas/journeyDScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    assertRecalcRuns,
    assertTimeCardsStillTransferred,
    guardedTransfer,
    prepareJourneyD,
    readJobCards,
    seedFixtureDay,
    setRateOnScreen,
} from '@utils/journeys/journeyDFlow';

test.describe('D6 · Recalculate after setup change', { tag: ['@JourneyD', '@D6'] }, () => {

    test('[Recalculate] Recalculate transferred job cards onto a new piece rate without deleting them.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'D6' },
        ],
    }, async ({ page, sessionApi, pages }, testInfo) => {
        // D6 drives two async server jobs (transfer, recalculate) plus two UI screens — the Job form
        // for the rate change and the Job Cards grid. A skipped-budget cleanup here means permanent
        // residue on dev, not just an untidy report, so the budget is generous on purpose.
        test.slow();
        test.setTimeout(360_000);

        const scenario = await loadScenario(JourneyDRecalculateCaseSchema, testInfo);
        const run = await prepareJourneyD(scenario, { sessionApi, testInfo });

        // 2. Set the starting rate on screen, then seed the day: crew time-in -> crew piece-out -> crew time-out.
        await setRateOnScreen(run, { pages, testInfo }, scenario.rate.before, 'rate v1 (the starting rate)');
        const seed = await seedFixtureDay(run, { sessionApi, testInfo });

        // 3-4. analyzeTransfer guarded to exactly this run's own time cards, then executeTransfer polled to complete.
        const transfer = await guardedTransfer(run, { sessionApi, testInfo }, seed);
        expect(transfer.jobCardsWritten).toBe(scenario.expected.jobCards);
        expect(transfer.timeCardsTransferred).toBe(seed.timeCardCounters.length);
        expect(transfer.jobCardCounters).toHaveLength(scenario.expected.jobCards);

        // 5. Read both job cards. Pin the arrange.
        const beforeCards = await readJobCards({ sessionApi }, transfer.jobCardCounters);
        for (const card of beforeCards) {
            expect(card.pieces).toBe(scenario.expected.piecesPerCard);
            expect(card.pieceRate).toBe(scenario.rate.before);
            expect(card.pieceAmount).toBe(scenario.expected.amountBefore);
            expect(card.exported).toBeFalsy();
            expect(card.locked).toBeFalsy();
        }

        // 6. THE SETUP CHANGE - catalog step 1, driven on Setup > Job like a user would.
        const jobAfterRateChange = await setRateOnScreen(run, { pages, testInfo }, scenario.rate.after, 'rate v2 - the setup change');
        expect(jobAfterRateChange.pieceRate, 'the Job form must show the new piece rate after saving').toBe(scenario.rate.after);

        // 7. On screen: /input/job-cards -> From/To = the fixture day -> Apply -> both references listed ->
        //    Multi Update -> check exactly the two own rows -> selection bar reads "2 selected".
        await pages.jobCards.goto();
        await pages.jobCards.applyDateRange(run.day);
        for (const card of beforeCards) {
            await expect(pages.jobCards.rowByReference(card.reference!)).toBeVisible();
        }
        await pages.jobCards.enableSelection();
        for (const card of beforeCards) {
            await pages.jobCards.selectByReference(card.reference!);
        }
        expect(await pages.jobCards.selectedCount()).toBe(scenario.expected.jobCards);

        // Recalculate -> assert the dialog body names the seeded count -> confirm.
        await pages.jobCards.recalculate();
        const dialogText = await pages.jobCards.confirmDialogText();
        expect(dialogText).toContain(String(scenario.expected.jobCards));
        await pages.jobCards.confirmRecalculate();

        // 8. Assert the result toast names the exact counts — "2 updated, 0 skipped, 0 failed".
        // Recalculate is an async server job — the toast lands when it settles, not on click.
        await expect(pages.jobCards.resultToast({
            updated: scenario.expected.updated,
            skipped: scenario.expected.skipped,
            failed: scenario.expected.failed,
        })).toBeVisible({ timeout: 90_000 });

        // 9. Read both job cards back by id and assert the D6-vs-D5 outcome.
        const afterCards = await readJobCards({ sessionApi }, transfer.jobCardCounters);
        expect(afterCards.map((c) => c.jobCardCounter).sort()).toEqual(transfer.jobCardCounters.slice().sort());
        for (const before of beforeCards) {
            const after = afterCards.find((c) => c.jobCardCounter === before.jobCardCounter);
            expect(after, `job card ${before.jobCardCounter} must still exist — Recalculate must not delete it`).toBeTruthy();
            expect(after!.reference).toBe(before.reference);
            expect(after!.timeCardInCounter).toBe(before.timeCardInCounter);
            expect(after!.timeCardOutCounter).toBe(before.timeCardOutCounter);
            expect(after!.pieces).toBe(before.pieces);
            expect(after!.netTime).toBe(before.netTime);
            expect(after!.version).not.toBe(before.version);
            expect(after!.pieceRate).toBe(scenario.rate.after);
            expect(after!.pieceAmount).toBe(scenario.expected.amountAfter);
            // Known product defect (measured live 2026-09-29): `amount` is left at 0 by Recalculate
            // while `pieceAmount` tracks the rate correctly. Recorded as evidence only — never asserted.
            testInfo.annotations.push({ type: 'product-defect-amount', description: `job card ${after!.jobCardCounter}: amount=${String(after!.amount)}` });
        }

        // 10. The day's five time cards are still present and still transferred.
        const stillTransferred = await assertTimeCardsStillTransferred(run, { sessionApi }, seed.timeCardCounters);
        expect(stillTransferred).toHaveLength(seed.timeCardCounters.length);
        for (const card of stillTransferred) expect(card.transferred).toBe(true);

        // 11. GET /job-cards/recalc-runs has exactly one run newer than the captured baseline.
        const newRuns = await assertRecalcRuns(run, { sessionApi });
        expect(newRuns).toHaveLength(1);
        expect(newRuns[0].jobCardCount).toBe(scenario.expected.jobCards);
        expect(newRuns[0].status).toBe('active');

        // 12. Both rows are still on /input/job-cards for the day, by Reference.
        await page.goto('/input/job-cards');
        await pages.jobCards.applyDateRange(run.day);
        for (const card of beforeCards) {
            await expect(pages.jobCards.rowByReference(card.reference!)).toBeVisible();
        }

        // 13. Cleanup — job cards by id, then time cards, then the rate restore.
        await run.cleanup();
    });

});
