/**
 * Catalog workflow D6 — Recalculate after setup change (real transfer + rate change + Recalculate).
 * Data: src/data/journey-d/d06-recalculate-after-setup-change.json · Plan: test-plans/journey-d/d06-recalculate-after-setup-change.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyDRecalculateCaseSchema } from '@data/schemas/journeyDScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    FRESH_EXPORTED_CELL,
    assertRecalcRuns,
    assertTransferredOnScreen,
    guardedTransfer,
    openViewJobCardsForDay,
    prepareJourneyD,
    seedFixtureDay,
    setRateOnScreen,
    viewJobCardRow,
} from '@utils/journeys/journeyDFlow';

test.describe('D6 · Recalculate after setup change', { tag: ['@JourneyD', '@D6'] }, () => {

    test('[Recalculate] Recalculate transferred job cards onto a new piece rate without deleting them.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'D6' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        // D6 drives two async server jobs (transfer, recalculate) plus two UI screens — the Job form
        // for the rate change and the Job Cards grid. A skipped-budget cleanup here means permanent
        // residue on dev, not just an untidy report, so the budget is generous on purpose.
        test.setTimeout(360_000);

        const scenario = await loadScenario(JourneyDRecalculateCaseSchema, testInfo);
        const run = await prepareJourneyD(scenario, { sessionApi, testInfo, pages });
        const { expected, rate } = scenario;
        const view = pages.viewJobCards;

        // 2. Set the starting rate on screen, then seed the day: crew time-in -> crew piece-out -> crew time-out.
        await setRateOnScreen(run, { pages, testInfo }, rate.before, 'rate v1 (the starting rate)');
        const seed = await seedFixtureDay(run, { sessionApi, testInfo, pages });

        // 3-4. The roster guard, then the commit; the "Transfer complete" toast is asserted inside.
        // Scoped to the crew: the sliding fixture day picks up other people's untransferred rows on dev.
        const transfer = await guardedTransfer(run, { sessionApi, testInfo, pages, crew: run.crew.name }, seed);
        expect(transfer.jobCardCounters).toHaveLength(expected.jobCards);

        // 5. The transfer lands on View ▸ Job Cards: pin the arrange on screen and capture each card's Reference.
        await view.waitForTransferLanding();
        const landed = view.rowsForCrew(run.crew.name);
        await expect(landed, 'the landing grid shows exactly this run\'s job cards').toHaveCount(expected.jobCards);
        const references: string[] = [];
        const netBefore = new Map<string, string>();
        for (let i = 0; i < expected.jobCards; i += 1) {
            const row = landed.nth(i);
            const reference = await view.referenceOf(row);
            references.push(reference);
            expect(await view.readNumber(row, 'Pieces'), `${reference} pieces`).toBe(expected.piecesPerCard);
            expect(await view.readNumber(row, 'Piece Rate'), `${reference} piece rate`).toBe(rate.before);
            expect(await view.readNumber(row, 'Piece Amount'), `${reference} piece amount`).toBe(expected.amountBefore);
            expect(await view.readCell(row, 'Exported'), `${reference} is not exported`).toBe(FRESH_EXPORTED_CELL);
            netBefore.set(reference, await view.readCell(row, 'Net Time'));
        }

        // 6. THE SETUP CHANGE - catalog step 1, driven on Setup > Job like a user would.
        const jobAfterRateChange = await setRateOnScreen(run, { pages, testInfo }, rate.after, 'rate v2 - the setup change');
        expect(jobAfterRateChange.pieceRate, 'the Job form must show the new piece rate after saving').toBe(rate.after);

        // 7. On screen: /input/job-cards -> From/To = the fixture day -> Apply -> both references listed.
        await pages.jobCards.goto();
        await pages.jobCards.applyDateRange(run.day);
        for (const reference of references) {
            await expect(pages.jobCards.rowByReference(reference)).toBeVisible();
        }

        // Recalculate wizard: step 1 scopes to this run's crew (empty criteria would target every card on
        // the tenant), step 2 must report exactly the seeded count before Execute.
        await pages.jobCards.openRecalculateWizard();
        await pages.jobCards.scopeToCrew(run.crew.name);
        expect(await pages.jobCards.continueToReview(), 'the review step must list exactly this run\'s job cards').toBe(expected.jobCards);
        await pages.jobCards.executeRecalculate();

        // 8. Assert the result toast names the exact counts — "2 updated, 0 skipped, 0 failed".
        // Recalculate is an async server job — the toast lands when it settles, not on click.
        await expect(pages.jobCards.resultToast({
            updated: expected.updated,
            skipped: expected.skipped,
            failed: expected.failed,
        })).toBeVisible({ timeout: 90_000 });

        // 9. View ▸ Job Cards again: the same cards, on the new rate. Amount is asserted too (PET-12846, fixed on dev 2026-10-21).
        await openViewJobCardsForDay(pages, run.day);
        for (const reference of references) {
            const row = viewJobCardRow(pages, reference);
            await expect(row, `job card ${reference} must still exist — Recalculate must not delete it`).toBeVisible();
            expect(await view.readNumber(row, 'Pieces'), `${reference} pieces`).toBe(expected.piecesPerCard);
            expect(await view.readCell(row, 'Net Time'), `${reference} net time is unchanged`).toBe(netBefore.get(reference));
            expect(await view.readNumber(row, 'Piece Rate'), `${reference} piece rate`).toBe(rate.after);
            expect(await view.readNumber(row, 'Piece Amount'), `${reference} piece amount`).toBe(expected.amountAfter);
            expect(await view.readNumber(row, 'Amount'), `${reference} amount`).toBe(expected.amountAfter);
        }

        // 10. The day's five time cards are still present and still transferred.
        await assertTransferredOnScreen(pages, run.day, (run.ctx.cards ?? []).map((c) => String(c.reference)), 'Yes', scenario.label);

        // 11. No screen lists recalc runs, so the audit rows are evidence only.
        const newRuns = await assertRecalcRuns(run, { sessionApi });
        testInfo.annotations.push({
            type: 'recalc-run-evidence',
            description: `${newRuns.length} recalc run(s) newer than baseline ${run.recalcBaseline}: ${JSON.stringify(newRuns.map((r) => ({ id: r.recalcRunCounter, jobCardCount: r.jobCardCount, status: r.status })))}`,
        });

        // 12. Both rows are still on /input/job-cards for the day, by Reference.
        await pages.jobCards.goto();
        await pages.jobCards.applyDateRange(run.day);
        for (const reference of references) {
            await expect(pages.jobCards.rowByReference(reference)).toBeVisible();
        }

        // 13. Cleanup — job cards by id, then time cards, then the rate restore.
        await run.cleanup();
    });

});
