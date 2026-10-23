/**
 * Catalog workflow D5 — Reverse and redo: a wrong transfer is reversed from Job Cards, the Time Out is corrected on the time card, and the day is re-transferred as one clean card.
 * Data: src/data/journey-d/d05-reverse-and-redo.json · Plan: test-plans/journey-d/d05-reverse-and-redo.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyD5ReverseCaseSchema } from '@data/schemas/journeyDScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    assertTransferredOnScreen,
    clock,
    clockCell,
    guardReversibleRun,
    isOwnD5JobCard,
    journeyD5TimeoutMs,
    openViewJobCardsForDay,
    prepareJourneyD5,
    reanalyzeOwnDay,
    recordOwnJobCardIds,
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
        await view.waitForTransferLanding();
        expect(view.transferRunParam(), 'the app navigated with this transfer\'s run id').toBe(first.transferRunCounter);
        const crewRows = view.rowsForCrew(run.crew.name);
        await expect(crewRows, 'the grid shows one row for the crew').toHaveCount(expected.firstTransfer.jobCards);
        const wrongRow = crewRows.first();
        await expect(await view.cellByHeader(wrongRow, expected.grossHeader), 'the wrong card reads 4 h on screen').toHaveText(grossCell(expected.firstTransfer.grossHours));
        expect(await view.readClock(wrongRow, 'Time In'), 'the wrong card starts at the Time In').toBe(clock(timeIn));
        expect(await view.readClock(wrongRow, 'Time Out'), 'the wrong card ends at the wrong Time Out').toBe(clock(wrongTimeOut));
        const wrongReference = await view.referenceOf(wrongRow);

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
        await openViewJobCardsForDay(pages, run.day);
        await expect(view.rowsForCrew(run.crew.name), 'the reversed job card is gone from View ▸ Job Cards').toHaveCount(0);
        await assertTransferredOnScreen(pages, run.day, [seed.timeInReference, seed.timeOutReference], 'No', run.scenario.label);
        // Dropped only now, so a failed absence assertion leaves the id for the teardown.
        run.jobCardIds.splice(0, run.jobCardIds.length, ...run.jobCardIds.filter((id) => !first.jobCardCounters.includes(id)));

        // Re-analyse: the same two References are offered and read Ready (the re-offer is the proof the run is no longer active).
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
        await expect(transfer.rowTime(seed.timeOutId), 'the correction lives on the time card').toHaveText(clockCell(correctedTimeOut));
        await expect(transfer.rowTime(seed.timeInId), 'the Time In is unchanged').toHaveText(clockCell(timeIn));
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
        await view.waitForTransferLanding();
        expect(view.transferRunParam(), 'the re-transfer is a new run').not.toBe(first.transferRunCounter);
        expect(view.transferRunParam(), 'the landing URL carries the re-transfer\'s run id').toBe(second.transferRunCounter);
        await recordOwnJobCardIds(run, deps, (card) => isOwnD5JobCard(run, card));

        const workRows = view.rowsForCrewAndJob(run.crew.name, run.job.name);
        await expect(workRows, 'one clean work card').toHaveCount(expected.redo.workCards);
        const work = workRows.first();
        expect(await view.referenceOf(work), 'the redo card is a new card').not.toBe(wrongReference);
        expect(await view.readClock(work, 'Time In'), 'the redo card starts at the Time In').toBe(clock(timeIn));
        expect(await view.readClock(work, 'Time Out'), 'the redo card ends at the corrected Time Out').toBe(clock(correctedTimeOut));
        await expect(await view.cellByHeader(work, expected.grossHeader), 'the work card reads 8 h on screen').toHaveText(grossCell(expected.redo.grossHours));
        expect(await view.readNumber(work, 'Net Time'), 'one clean 8 h work card: net').toBe(expected.redo.netHours);

        // Every crew row: none keeps the wrong Time Out, and anything beyond the work card must be a meal penalty.
        const allRows = view.rowsForCrew(run.crew.name);
        const penalty: string[] = [];
        for (let i = 0; i < (await allRows.count()); i += 1) {
            const row = allRows.nth(i);
            expect(await view.readClock(row, 'Time Out'), 'no card keeps the wrong Time Out').not.toBe(clock(wrongTimeOut));
            const job = await view.readCell(row, 'Job');
            if (job === run.job.name) continue;
            expect(job, `'${job}' is neither the work job nor a tolerated meal-penalty card`).toMatch(/meal penalty/i);
            penalty.push(await view.referenceOf(row));
        }
        if (penalty.length) {
            testInfo.annotations.push({ type: 'meal-penalty-card', description: `tolerated non-labor card(s): ${penalty.join(', ')}` });
        }

        await run.cleanup();
        expect(await remainingPickerTimeCards(run, { sessionApi }), 'cleanup must leave no time card for the picker on the fixture day').toHaveLength(0);
    });

});
