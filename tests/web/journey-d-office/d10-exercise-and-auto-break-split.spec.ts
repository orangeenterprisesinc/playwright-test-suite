/**
 * Catalog workflow D10 — Exercise and auto-break split (one worker's day carved into exercise, work, break and the return to work).
 * Data: src/data/journey-d/d10-exercise-and-auto-break-split.json · Plan: test-plans/journey-d/d10-exercise-and-auto-break-split.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyD10SegmentCaseSchema } from '@data/schemas/journeyDScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    FRESH_EXPORTED_CELL,
    READY_STATUS,
    assertTransferredOnScreen,
    clock,
    commitTransfer,
    designatePaidBreakJob,
    openScopedCandidates,
    openViewJobCardsForDay,
    prepareJourneyD10,
    previewClock,
    recordOwnJobCardIds,
    seedExerciseAndBreakDay,
} from '@utils/journeys/journeyDFlow';

test.describe('D10 · Exercise and auto-break split', { tag: ['@JourneyD', '@D10'] }, () => {

    test('[Transfer] Split one worker\'s day into exercise, work, break and the return to work.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'D10' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        // A skipped-budget cleanup here would leave a shared tenant preference set as well as residue.
        test.slow();
        test.setTimeout(360_000);

        // 1. Fixture rows and the crew rule on screen, preference gate, before-phase sweep.
        const scenario = await loadScenario(JourneyD10SegmentCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };
        const run = await prepareJourneyD10(scenario, deps);
        const { capture, expected } = run.scenario;
        const transfer = pages.transferToJobCards;
        const view = pages.viewJobCards;
        const jobNames = expected.segments.map((s) => run.jobs[s.job].name);
        const segmentAmounts = expected.segments.map((s) => s.amount);

        // 2. Three time cards on screen: time-in, break start with no return punch, time-out.
        const seed = await seedExerciseAndBreakDay(run, deps);
        expect(seed.timeCardCounters, 'the day must be seeded with exactly the three punches').toHaveLength(expected.timeCards);

        // 3. Designate the paid-break job as late as possible; cleanup owns the restore from here on.
        await designatePaidBreakJob(run, { sessionApi, pages });

        // 4-5. Scope the day, analyze, narrow to the crew, guard the roster — nothing has committed.
        const candidates = await openScopedCandidates(run, { pages, crew: run.crew.name }, seed);
        expect(candidates, 'the crew-scoped grid must offer exactly the run\'s own time cards').toHaveLength(expected.timeCards);
        await expect(transfer.selectAllRowsCheckbox, 'the header select-all must stay untouched').not.toBeChecked();
        for (const id of seed.timeCardCounters) {
            expect(await transfer.rowStatusText(id), `time card ${id} must read ${READY_STATUS} before the commit`).toBe(READY_STATUS);
        }
        await expect.poll(() => transfer.blockingCount(), { message: 'nothing may block the day' }).toBe(0);
        expect(await transfer.readyCount(), 'the Ready pill counts all three time cards').toBe(expected.timeCards);

        // 6. The pre-commit preview: three time cards become four job cards.
        await transfer.openJobCardsTab();
        await expect.poll(async () => (await transfer.previewSegments()).length, { message: 'the preview must propose the four split job cards' }).toBe(expected.jobCards);
        const preview = await transfer.previewSegments();
        expect(preview.map((row) => row.job), 'the previewed jobs, in chronological order').toEqual(jobNames);
        expect(preview.map((row) => row.amount), 'the previewed amounts are the segment lengths in decimal hours').toEqual(segmentAmounts);
        await expect.poll(() => transfer.previewTotals(), { message: 'the preview totals bar' }).toEqual({
            pieces: expected.pieces,
            jobCards: expected.jobCards,
            employees: expected.employees,
        });

        // The segment boundaries as clock times, read from the preview grid itself.
        const boundaries = previewClock(preview);
        expect(
            boundaries.map(({ start, end, grossMinutes, netMinutes }) => ({ start, end, grossMinutes, netMinutes })),
            'the segment boundaries, contiguous from the time-in to the time-out',
        ).toEqual(expected.segments.map((s) => ({ start: clock(s.start), end: clock(s.end), grossMinutes: s.minutes, netMinutes: s.minutes })));
        expect(boundaries[0].start, 'the first segment starts at the time-in').toBe(clock(capture.timeIn));
        expect(boundaries[boundaries.length - 1].end, 'the last segment ends at the time-out').toBe(clock(capture.timeOut));
        expect(boundaries.reduce((sum, b) => sum + b.grossMinutes, 0), 'the split neither creates nor loses a minute').toBe(expected.totalMinutes);
        await transfer.openTimeCardsTab();

        // 7. Commit: tick each own Reference, never the header checkbox. The toast is asserted inside.
        await commitTransfer(run, deps, seed, candidates, { jobCards: expected.jobCards, timeCards: expected.timeCards });
        await recordOwnJobCardIds(run, deps);

        // 8. The committed cards on View ▸ Job Card, counted for the crew only.
        await pages.jobCards.goto();
        await pages.jobCards.applyDateRange(run.day);
        await expect(pages.jobCards.rowsForCrew(run.crew.name), 'the crew must end the day with exactly the four split job cards').toHaveCount(expected.jobCards);
        expect((await pages.jobCards.jobsForCrew(run.crew.name)).sort(), 'the listed jobs').toEqual([...jobNames].sort());
        const listed = await pages.jobCards.amountsForCrew(run.crew.name);
        expect(listed.reduce((sum, amount) => sum + amount, 0), 'the listed amounts add up to the day').toBeCloseTo(expected.totalAmount, 2);

        // 9. View ▸ Job Cards: the job multiset and not-exported, per row.
        await openViewJobCardsForDay(pages, run.day);
        const rows = view.rowsForCrew(run.crew.name);
        await expect(rows, 'the crew must have the four split job cards on View ▸ Job Cards').toHaveCount(expected.jobCards);
        const jobs: string[] = [];
        for (let i = 0; i < expected.jobCards; i += 1) {
            const row = rows.nth(i);
            jobs.push(await view.readCell(row, 'Job'));
            expect(await view.readCell(row, 'Exported'), `job card ${await view.referenceOf(row)} is not exported`).toBe(FRESH_EXPORTED_CELL);
        }
        expect(jobs.sort(), 'the written job multiset').toEqual([...jobNames].sort());

        // 10. The transfer splits the day into segments; it does not rewrite the capture.
        await assertTransferredOnScreen(pages, run.day, (run.ctx.cards ?? []).map((c) => String(c.reference)), 'Yes', run.scenario.label);

        // 11. Cleanup — preference first, then job cards by id, then the time cards, then the crew-scoped sweep.
        await run.cleanup();
    });

});
