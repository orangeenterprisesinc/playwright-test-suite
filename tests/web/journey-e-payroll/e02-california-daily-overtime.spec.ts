/**
 * Catalog workflow E2 — California daily overtime (one thirteen-hour crew day split into eight regular hours,
 * four at time-and-a-half and one at double time, on the regular rate).
 * Data: src/data/journey-e/e02-california-daily-overtime.json · Plan: test-plans/journey-e/e02-california-daily-overtime.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyE2DailyOvertimeCaseSchema } from '@data/schemas/journeyEScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    FRESH_EXPORTED_CELL,
    READY_STATUS,
    assertTransferredOnScreen,
    clock,
    commitTransfer,
    openScopedCandidates,
    openViewJobCardsForDay,
    prepareJourneyE2,
    previewClock,
    recordOwnJobCardIds,
    seedLongWorkday,
} from '@utils/journeys/journeyEFlow';

test.describe('E2 · California daily overtime', { tag: ['@JourneyE', '@E2'] }, () => {
    test('[Payroll] Split a thirteen-hour day into eight regular hours, four at time-and-a-half and one at double time.', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'E2' }],
    }, async ({ sessionApi, pages }, testInfo) => {
        // Up to five Setup forms, a Job saved three times, two Batch forms and two Transfer tabs — and a
        // skipped-budget outcome here would leave residue on a shared environment.
        test.slow();
        test.setTimeout(360_000);

        const scenario = await loadScenario(JourneyE2DailyOvertimeCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };
        const { expected, capture } = scenario;
        const transfer = pages.transferToJobCards;
        const view = pages.viewJobCards;

        // 1. Fixture rows + the rule/rate on screen, the gates, the before-phase sweep and restore snapshot.
        const run = await prepareJourneyE2(scenario, deps);
        try {
            // 2. Seed the day on screen: crew time-in at 06:00 on E2 JOB, crew time-out at 19:00.
            const seed = await seedLongWorkday(run, deps);

            // 3 + 4. Scope to the day, analyze, narrow to the crew (never the Employee filter — WEBPET-3397),
            // and refuse to transfer anything but this run's own two references.
            const candidates = await openScopedCandidates(run, { pages, crew: run.crew.name }, seed);
            await expect(transfer.selectAllRowsCheckbox, 'the header select-all-across-filter must never be used').not.toBeChecked();
            for (const id of seed.timeCardCounters) {
                expect.soft(await transfer.rowStatusText(id), `${scenario.label}: time card ${id} must read ${READY_STATUS} before the commit`).toBe(READY_STATUS);
            }
            await expect.poll(() => transfer.blockingCount(), { message: `${scenario.label}: nothing may block the day` }).toBe(0);
            expect.soft(await transfer.readyCount(), `${scenario.label}: the Ready pill is the crew's ${expected.timeCards} time cards`).toBe(expected.timeCards);

            // 5. Catalog steps 1 + 2 — the pre-commit preview. Nothing has committed yet.
            await transfer.openJobCardsTab();
            const buckets = await transfer.previewOvertimeBuckets();
            expect(buckets, `${scenario.label}: the preview must show exactly ${expected.jobCards} job card`).toHaveLength(expected.jobCards);

            // Value checks are soft so a red run reports every bucket that disagrees at once; length and
            // structural gates stay hard so array access can't crash.
            const card = buckets[0];
            expect.soft(card.job, `${scenario.label}: the previewed card must be E2 JOB`).toContain(run.job.name);
            // E2 CREW has no lunch, so no meal is deducted and net equals gross.
            expect.soft(card.grossTime, `${scenario.label}: gross hours`).toBe(expected.grossMinutes / 60);
            expect.soft(card.meal, `${scenario.label}: the meal in hours`).toBe(expected.mealMinutes / 60);
            expect.soft(card.netTime, `${scenario.label}: net hours`).toBe(expected.netHours);
            // The three buckets ARE the workflow, and they sum to the net day, not the gross.
            expect.soft(card.regularHours, `${scenario.label}: regular hours (first ${scenario.rule.dailyOvertimeAfterHours})`).toBe(expected.regularHours);
            expect.soft(card.overtime, `${scenario.label}: overtime hours (${scenario.rule.dailyOvertimeAfterHours} to ${scenario.rule.doubleTimeAfterHours}, at 1.5x)`).toBe(expected.overtimeHours);
            expect.soft(card.doubleTime, `${scenario.label}: double-time hours (beyond ${scenario.rule.doubleTimeAfterHours}, at 2x)`).toBe(expected.doubleTimeHours);
            expect.soft(
                card.regularHours + card.overtime + card.doubleTime,
                `${scenario.label}: the three buckets must sum to the NET day (${expected.netHours}), not the gross`,
            ).toBe(expected.netHours);
            // The premium on the regular rate — the forty dollars that distinguish "the rule applied" from "it did not".
            expect.soft(
                card.amount,
                `${scenario.label}: amount = ${expected.regularAmount} + ${expected.overtimeAmount} + ${expected.doubleTimeAmount}`,
            ).toBe(expected.totalAmount);

            const totals = await transfer.previewTotals();
            expect.soft(totals, `${scenario.label}: preview totals bar`).toEqual({ pieces: expected.pieces, jobCards: expected.jobCards, employees: expected.employees });

            // The preview's own clock cells: the card spans the captured time-in to time-out.
            const segments = previewClock(await transfer.previewSegments());
            expect(segments, `${scenario.label}: one previewed card`).toHaveLength(expected.jobCards);
            expect.soft(segments[0].start, `${scenario.label}: preview time-in`).toBe(clock(capture.timeIn));
            expect.soft(segments[0].end, `${scenario.label}: preview time-out`).toBe(clock(capture.timeOut));

            // 6. Commit — tick each own Reference, never the header checkbox. The toast is asserted inside.
            // The per-reference checkboxes live on the Time Cards tab; step 5 left us on the Job Cards preview.
            await transfer.openTimeCardsTab();
            await commitTransfer(run, deps, seed, candidates, { jobCards: expected.jobCards, timeCards: expected.timeCards });

            // 7. The committed card on screen. Open the page fresh: the commit can land on Job Cards with the
            // range already collapsed into an "Edit filter" chip, where the From/To inputs are not rendered.
            await pages.jobCards.goto();
            await pages.jobCards.applyDateRange(run.day);
            await expect.soft(pages.jobCards.rowsForCrew(run.crew.name), `${scenario.label}: one crew-scoped row (the day carries other tenants' cards)`).toHaveCount(expected.jobCards);
            expect.soft(await pages.jobCards.jobsForCrew(run.crew.name), `${scenario.label}: the card's Job cell`).toContain(run.job.name);
            expect.soft(await pages.jobCards.amountsForCrew(run.crew.name), `${scenario.label}: the card's Amount cell`).toEqual([expected.totalAmount]);

            // 8. View ▸ Job Cards — one card, the right job, not exported.
            await recordOwnJobCardIds(run, deps);
            await openViewJobCardsForDay(pages, run.day);
            const rows = view.rowsForCrew(run.crew.name);
            await expect(rows, `${scenario.label}: one committed job card`).toHaveCount(expected.jobCards);
            const row = rows.first();
            expect.soft(await view.readCell(row, 'Job'), `${scenario.label}: the committed card's job`).toContain(run.job.name);
            expect.soft(await view.readCell(row, 'Exported'), `${scenario.label}: the fresh card is not exported`).toBe(FRESH_EXPORTED_CELL);

            // 9. The calculation classifies the day; it does not rewrite the capture.
            await assertTransferredOnScreen(pages, run.day, (run.ctx.cards ?? []).map((c) => String(c.reference)), 'Yes', scenario.label);
        } finally {
            // 10. The job card(s) by id, then the time cards, the job's rule and rate restore, then the crew-scoped sweep.
            await run.cleanup();
        }
    });
});
