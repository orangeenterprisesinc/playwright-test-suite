/**
 * Catalog workflow D3 — Add missing time-in and correct time card: a blocking device Time In is fixed on the time card, not the job card.
 * Data: src/data/journey-d/d03-add-missing-time-in-and-correct-time-card.json · Plan: test-plans/journey-d/d03-add-missing-time-in-and-correct-time-card.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyD3CorrectionCaseSchema } from '@data/schemas/journeyDScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { jobCardEmployeesOnScreen } from '@utils/journeys/journeyBFlow';
import {
    captureOwnRows,
    journeyD3TimeoutMs,
    openScopedCandidates,
    prepareJourneyD3,
    readCorrectionOnScreen,
    recordOwnJobCardIds,
    remainingOwnTimeCards,
    seedBlockingTimeInDay,
} from '@utils/journeys/journeyDFlow';

test.describe('D3 · Add missing time-in and correct time card', { tag: ['@JourneyD', '@D3'] }, () => {

    test('[Transfer] Correct a blocking device Time In on the time card and see it re-analyse to Ready.', {
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'D3' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        test.setTimeout(journeyD3TimeoutMs(testInfo));

        const scenario = await loadScenario(JourneyD3CorrectionCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };
        const run = await prepareJourneyD3(scenario, deps);
        const { expected } = run.scenario;
        const transfer = pages.transferToJobCards;

        const seed = await seedBlockingTimeInDay(run, deps);

        // Catalog step 1: the context-less Time In analyses as Blocking.
        const candidates = await openScopedCandidates(run, { pages, crew: run.crew.name }, seed);
        expect(candidates, 'the crew-scoped grid must offer exactly the run\'s own time cards').toHaveLength(expected.timeCards);
        await expect(transfer.rowStatus(seed.timeInId), 'the imported Time In must analyse as Blocking').toHaveText(expected.statusBefore);
        await expect(transfer.rowField(seed.timeInId), 'the Time In carries no Field').toHaveText(expected.emptyCell);
        await expect(transfer.rowJob(seed.timeInId), 'the Time In carries no Job').toHaveText(expected.emptyCell);
        await expect(transfer.rowRanch(seed.timeInId), 'the Time In carries no Ranch').toHaveText(expected.emptyCell);
        await expect.poll(() => transfer.blockingCount(), { message: 'the Blocking pill must count the Time In\'s issues' }).toBeGreaterThanOrEqual(expected.blockingIssuesFixed);
        const blockingBefore = await transfer.blockingCount();
        const readyBefore = await transfer.readyCount();
        await expect(transfer.blockingBannerFor(blockingBefore), 'the footer banner must state the Blocking count').toBeVisible();
        const before = await captureOwnRows(run, deps, seed, 'before');

        // Open the record: no Ranch, so the Field is locked behind it, and no Phase. The panel is read
        // here, before the fix, so the correction can be shown to leave employee, crew and punch time alone.
        await transfer.openRow(seed.timeInId);
        const panelBefore = await transfer.readTimeInPanel();
        await expect(transfer.panelFieldNeedsRanch, 'the Field must wait for a Ranch before the fix').toBeVisible();
        await expect(transfer.panelFieldValue, 'the Field must be locked before the fix').toBeDisabled();
        await expect(transfer.panelPhaseValue, 'the Phase must be empty before the fix').toHaveValue('');

        // Catalog step 3: set Ranch, Field and Phase, then save.
        await transfer.correctTimeIn({ ranch: run.ranch.name, field: run.field.name, phase: run.job.name });
        await expect(transfer.panelSaveButton, 'Save must be enabled once the three values are set').toBeEnabled();
        await expect(transfer.panelErrorChip, 'no error chip once the three values are set').toBeHidden();
        await transfer.savePanel();
        await expect(transfer.savedToast, 'the save must be confirmed').toBeVisible();

        // Catalog step 4: the grid re-analyses by itself and the exception clears.
        await transfer.waitForReanalyze();
        await expect.poll(() => transfer.rowStatusText(seed.timeInId), { message: 'the corrected Time In must re-analyse to Ready' }).toBe(expected.statusAfter);
        await expect(transfer.rowManuallyEdited(seed.timeInId), 'the corrected Time In must be marked Manually edited').toBeVisible();
        await expect(transfer.rowField(seed.timeInId), 'the Field cell').toHaveText(run.field.name);
        await expect(transfer.rowJob(seed.timeInId), 'the Job cell').toHaveText(run.job.name);
        await expect(transfer.rowRanch(seed.timeInId), 'the Ranch cell').toHaveText(run.ranch.name);
        const blockingAfter = blockingBefore - expected.blockingIssuesFixed;
        await expect.poll(() => transfer.blockingCount(), { message: 'the Blocking pill must drop by exactly the fixed issues' }).toBe(blockingAfter);
        const after = await captureOwnRows(run, deps, seed, 'after');
        const turnedReady = seed.timeCardCounters.filter((id) => before[id] !== expected.statusAfter && after[id] === expected.statusAfter).length;
        expect(turnedReady, 'at least the Time In must have turned Ready').toBeGreaterThanOrEqual(1);
        await expect.poll(async () => (await transfer.readyCount()) - readyBefore, { message: 'the Ready pill must rise by the own rows that turned Ready' }).toBe(turnedReady);
        if (blockingAfter > 0) {
            await expect(transfer.blockingBannerFor(blockingAfter), 'the footer banner must state the remaining Blocking count').toBeVisible();
        } else {
            await expect(transfer.blockingBanner, 'no blocking banner once nothing blocks').toBeHidden();
        }

        // Still on Transfer: the header select-all was never used (View ▸ Job Cards has no such control).
        await expect(transfer.selectAllRowsCheckbox, 'the header select-all must stay untouched').not.toBeChecked();

        // The correction lives on the time card, read back from its panel; no job card was written.
        const written = await readCorrectionOnScreen(pages, seed);
        expect(written.panel.ranch, 'Ranch on the time card').toContain(run.ranch.name);
        expect(written.panel.field, 'Field on the time card').toBe(run.field.name);
        expect(written.panel.phase, 'Phase on the time card').toBe(run.job.name);
        expect(written.panel.employee, 'the employee must be unchanged').toBe(panelBefore.employee);
        expect(written.panel.workCrew, 'the crew must be unchanged').toBe(panelBefore.workCrew);
        expect(written.panel.dateTime, 'the punch time must be unchanged').toBe(panelBefore.dateTime);
        // The untransferred text was not measured ("No" or an empty cell); the first run calibrates it.
        expect(written.transferred, 'nothing was transferred').toMatch(/^(No)?$/);
        // Plumbing: own job-card ids recorded for cleanup BEFORE the screen is asserted; never the proof.
        await recordOwnJobCardIds(run, { sessionApi, testInfo });
        const jobCards = await jobCardEmployeesOnScreen(pages, run.day, run.crew.name);
        expect(jobCards.shown, 'a time-card correction writes no job card').toBe(expected.jobCards);

        await run.cleanup();
        expect(await remainingOwnTimeCards(run, { sessionApi }), 'cleanup must leave no time card on the crew\'s fixture day').toHaveLength(0);
    });

});
