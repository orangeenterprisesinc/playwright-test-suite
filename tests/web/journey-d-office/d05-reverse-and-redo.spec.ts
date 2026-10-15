/**
 * Catalog workflow D5 — Reverse and redo: a wrong transfer is reversed from Job Cards, the Time Out is corrected on the time card, and the day is re-transferred as one clean card.
 * Data: src/data/journey-d/d05-reverse-and-redo.json · Plan: test-plans/journey-d/d05-reverse-and-redo.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyD5ReverseCaseSchema } from '@data/schemas/journeyDScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    clock,
    guardReversibleRun,
    journeyD5TimeoutMs,
    prepareJourneyD5,
    readAfterReverse,
    readJobCards,
    readRedo,
    readSeedTimeCards,
    reanalyzeOwnDay,
    remainingPickerTimeCards,
    seedOnScreenDay,
    transferOwnDay,
} from '@utils/journeys/journeyDFlow';

test.describe('D5 · Reverse and redo', { tag: ['@JourneyD', '@D5'] }, () => {

    test('[Transfer] Reverse a wrong transfer, correct the Time Out and re-transfer one clean job card.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'D5' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        test.slow();
        test.setTimeout(journeyD5TimeoutMs(testInfo));

        const scenario = await loadScenario(JourneyD5ReverseCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };
        const run = await prepareJourneyD5(scenario, deps);
        const { expected, timeIn, wrongTimeOut, correctedTimeOut } = run.scenario;
        const transfer = pages.transferToJobCards;
        const view = pages.viewJobCards;
        const grossCell = (hours: number) => new RegExp(`^${hours}(\\.0+)?$`);

        // Setup: the Time In (07:00) and the deliberately wrong Time Out (11:00), both on screen.
        const seed = await seedOnScreenDay(run, deps);
        expect(seed.timeCardCounters, 'exactly the two on-screen cards exist').toHaveLength(expected.timeCards);

        // First transfer: one 4 h card, and the app lands on Job Cards with this run's id.
        const first = await transferOwnDay(run, deps, seed, expected.firstTransfer.jobCards);
        expect(first.toastSeen, 'first transfer writes one card').toBe(true);
        await view.waitForTransferLanding();
        expect(view.transferRunParam(), 'the app navigated with this transfer\'s run id').toBe(first.transferRunCounter);
        const crewRows = view.rowsForCrew(run.crew.name);
        await expect(crewRows, 'the grid shows one row for the crew').toHaveCount(expected.firstTransfer.jobCards);
        await expect(await view.cellByHeader(crewRows.first(), expected.grossHeader), 'the wrong card reads 4 h on screen').toHaveText(grossCell(expected.firstTransfer.grossHours));
        expect(first.jobCardCounters, 'the first transfer wrote exactly one job card').toHaveLength(expected.firstTransfer.jobCards);
        const [wrong] = await readJobCards({ sessionApi }, first.jobCardCounters);
        expect(String(wrong.dateTimeIn), 'the wrong card starts at the Time In').toContain(`T${clock(timeIn)}`);
        expect(String(wrong.dateTimeOut), 'the wrong card ends at the wrong Time Out').toContain(`T${clock(wrongTimeOut)}`);
        expect(wrong.grossTime, 'the wrong card is 07:00–11:00, 4 h').toBe(expected.firstTransfer.grossHours);

        // Guard and open Reverse: refuses unless the run on screen is this test's own.
        await guardReversibleRun(run, deps, first);
        await view.openReverse();
        await expect(view.reverseDialog, 'reverse confirm title').toContainText(expected.reverseDialog.title);
        await expect(view.reverseDialog, 'reverse confirm text').toContainText(expected.reverseDialog.text);

        // Catalog step 1: confirm the reverse; the card is deleted and the time cards are un-transferred.
        const reversedRun = await view.confirmReverse();
        expect(reversedRun, 'the reverse targeted this run').toBe(first.transferRunCounter);
        await expect(transfer.pageRoot, 'the app returns to Transfer to Job Cards').toBeVisible();
        await expect(transfer.reversedToast, 'reverse confirmed').toBeVisible();
        const afterReverse = await readAfterReverse(run, deps, seed, { runId: reversedRun, jobCardIds: first.jobCardCounters });
        for (const id of first.jobCardCounters) expect(afterReverse.dayJobCardIds, 'the reversed job card is gone').not.toContain(id);
        expect(afterReverse.timeCards, 'both own time cards are still there').toHaveLength(expected.timeCards);
        expect(afterReverse.timeCards.every((c) => c.transferred === false), 'both time cards are un-transferred again').toBe(true);
        expect(afterReverse.runStillActive, 'the reversed run is no longer active').toBe(false);
        // Dropped only now, so a failed absence assertion leaves the id for the teardown.
        run.jobCardIds.splice(0, run.jobCardIds.length, ...run.jobCardIds.filter((id) => !first.jobCardCounters.includes(id)));

        // Re-analyse: the same two References are offered and read Ready.
        await reanalyzeOwnDay(run, { pages }, seed, expected.redo.workCards);
        for (const id of seed.timeCardCounters) {
            await expect(transfer.rowStatus(id), 'both cards are eligible again').toHaveText(expected.status);
        }
        await expect.poll(() => transfer.readyCount(), { message: 'the Ready pill counts both own cards' }).toBe(expected.timeCards);

        // Catalog step 2: correct the Time Out on the time card, not the job card.
        await transfer.openRow(seed.timeOutId, 'Time Out');
        await transfer.setPanelDateTime(transfer.timeOutPanel, run.day, clock(correctedTimeOut));
        await transfer.saveTimeOutPanel();
        await expect(transfer.recordToast(expected.toasts.timeOutSaved), 'the Time Out edit must save').toBeVisible();
        await transfer.waitForReanalyze(transfer.timeOutPanel);
        const corrected = await readSeedTimeCards(run, { sessionApi }, seed);
        const timeOutNow = corrected.find((c) => c.timeCardCounter === seed.timeOutId);
        const timeInNow = corrected.find((c) => c.timeCardCounter === seed.timeInId);
        expect(String(timeOutNow?.dateTime), 'the correction lives on the time card').toContain(`T${clock(correctedTimeOut)}`);
        expect(String(timeInNow?.dateTime), 'the Time In is unchanged').toContain(`T${clock(timeIn)}`);
        // WEBPET-3823: the preview is requested before the save commits and never refreshed, so reopen the screen first.
        await reanalyzeOwnDay(run, { pages }, seed, expected.redo.workCards);
        await transfer.openJobCardsTab();
        await expect.poll(
            async () => (await transfer.previewSegments()).filter((s) => s.job === run.job.name).map((s) => Number(s.grossTime)),
            { message: 'the preview shows one 8 h segment for the job' },
        ).toEqual([expected.redo.grossHours]);
        await transfer.openTimeCardsTab();

        // Catalog step 3: re-transfer.
        const second = await transferOwnDay(run, deps, seed, expected.redo.workCards);
        expect(second.toastSeen, 'the re-transfer writes one card').toBe(true);
        await view.waitForTransferLanding();
        expect(view.transferRunParam(), 'the re-transfer is a new run').not.toBe(first.transferRunCounter);
        expect(view.transferRunParam(), 'the landing URL carries the re-transfer\'s run id').toBe(second.transferRunCounter);

        const redo = await readRedo(run, deps, seed);
        expect(redo.work, 'one clean work card').toHaveLength(expected.redo.workCards);
        const [work] = redo.work;
        expect(work.jobCardCounter, 'the redo card is a new card').not.toBe(first.jobCardCounters[0]);
        expect(String(work.dateTimeIn), 'the redo card starts at the Time In').toContain(`T${clock(timeIn)}`);
        expect(String(work.dateTimeOut), 'the redo card ends at the corrected Time Out').toContain(`T${clock(correctedTimeOut)}`);
        expect(work.grossTime, 'one clean 8 h work card: gross').toBe(expected.redo.grossHours);
        expect(work.netTime, 'one clean 8 h work card: net').toBe(expected.redo.netHours);
        for (const card of [...redo.work, ...redo.penalty, ...redo.other]) {
            expect(String(card.dateTimeOut), 'no card keeps the wrong Time Out').not.toContain(`T${clock(wrongTimeOut)}`);
        }
        expect(redo.other, 'no card other than the work card and a tolerated meal penalty').toHaveLength(0);
        if (redo.penalty.length) {
            testInfo.annotations.push({ type: 'meal-penalty-card', description: `tolerated non-labor card(s): ${redo.penalty.map((c) => c.jobCardCounter).join(', ')}` });
        }
        const penaltyForCrew = redo.penalty.filter((c) => Number(c.crewCounter) === run.crew.id).length;
        const finalRows = view.rowsForCrew(run.crew.name);
        await expect(finalRows, 'the grid shows the work card and any crew penalty rows').toHaveCount(redo.work.length + penaltyForCrew);
        await expect(
            await view.cellByHeader(finalRows.filter({ hasText: run.job.name }).first(), expected.grossHeader),
            'the work card reads 8 h on screen',
        ).toHaveText(grossCell(expected.redo.grossHours));

        await run.cleanup();
        expect(await remainingPickerTimeCards(run, { sessionApi }), 'cleanup must leave no time card for the picker on the fixture day').toHaveLength(0);
    });

});
