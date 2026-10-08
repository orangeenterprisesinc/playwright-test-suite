/**
 * Catalog workflow E2 — California daily overtime (one crew day split into eight regular hours, two at
 * time-and-a-half and one at double time, on the regular rate).
 * Data: src/data/journey-e/e02-california-daily-overtime.json · Plan: test-plans/journey-e/e02-california-daily-overtime.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyE2DailyOvertimeCaseSchema } from '@data/schemas/journeyEScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    analyzeCrewDay,
    commitTransfer,
    openScopedCandidates,
    prepareJourneyE2,
    readDailyOvertime,
    readPreviewBoundaries,
    seedLongWorkday,
} from '@utils/journeys/journeyEFlow';

const minutes = (t: { hour: number; minute: number }) => t.hour * 60 + t.minute;

test.describe('E2 · California daily overtime', { tag: ['@JourneyE', '@E2'] }, () => {
    test('[Payroll] Split an eleven-hour net day into eight regular hours, two at time-and-a-half and one at double time.', {
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

        // 1. Fixture rows + the rule/rate/Consider-Employee-Rate on screen, the gates, the before-phase sweep.
        const run = await prepareJourneyE2(scenario, deps);
        try {
            // 2. Seed the day on screen: crew time-in at 06:00 on E2 JOB, crew time-out at 17:30.
            const seed = await seedLongWorkday(run, deps);

            // 3 + 4. Scope to the day, analyze, narrow to the crew (never the Employee filter — WEBPET-3397),
            // and refuse to transfer anything but this run's own two references.
            const candidates = await openScopedCandidates(run, { pages, crew: run.crew.name }, seed);
            await expect(pages.transferToJobCards.selectAllRowsCheckbox, 'the header select-all-across-filter must never be used').not.toBeChecked();
            const analysis = await analyzeCrewDay(run, { sessionApi });
            expect(analysis.plannableTotal, `${scenario.label}: analyze must plan exactly ${expected.timeCards} time cards`).toBe(expected.timeCards);
            expect(analysis.blocking, `${scenario.label}: analyze must raise no blocking exception`).toEqual([]);

            // 5. Catalog steps 1 + 2 — the pre-commit preview. Nothing has committed yet.
            await pages.transferToJobCards.openJobCardsTab();
            const buckets = await pages.transferToJobCards.previewOvertimeBuckets();
            expect(buckets, `${scenario.label}: the preview must show exactly ${expected.jobCards} job card`).toHaveLength(expected.jobCards);

            const card = buckets[0];
            expect(card.job, `${scenario.label}: the previewed card must be E2 JOB`).toContain(run.job.name);
            // The day: one automatic half-hour meal, deducted once; 11.50 gross becomes 11.00 net.
            expect(card.grossTime, `${scenario.label}: gross hours`).toBe(expected.grossMinutes / 60);
            expect(card.meal, `${scenario.label}: the automatic meal in hours`).toBe(expected.mealMinutes / 60);
            expect(card.netTime, `${scenario.label}: net hours after the meal`).toBe(expected.netHours);
            // The three buckets ARE the workflow, and they sum to the net day, not the gross.
            expect(card.regularHours, `${scenario.label}: regular hours (first eight)`).toBe(expected.regularHours);
            expect(card.overtime, `${scenario.label}: overtime hours (eight to ten, at 1.5x)`).toBe(expected.overtimeHours);
            expect(card.doubleTime, `${scenario.label}: double-time hours (beyond ten, at 2x)`).toBe(expected.doubleTimeHours);
            expect(
                card.regularHours + card.overtime + card.doubleTime,
                `${scenario.label}: the three buckets must sum to the NET day (${expected.netHours}), not the gross`,
            ).toBe(expected.netHours);
            // The premium on the regular rate — the forty dollars that distinguish "the rule applied" from "it did not".
            expect(card.amount, `${scenario.label}: amount = 8x20 + 2x30 + 1x40`).toBe(expected.totalAmount);

            const totals = await pages.transferToJobCards.previewTotals();
            expect(totals, `${scenario.label}: preview totals bar`).toEqual({ pieces: expected.pieces, jobCards: expected.jobCards, employees: expected.employees });

            // Corroborate the boundaries over the non-committing job-cards-preview, independent of grid formatting.
            const boundaries = await readPreviewBoundaries(run, { sessionApi });
            expect(boundaries, `${scenario.label}: one previewed card`).toHaveLength(expected.jobCards);
            const b = boundaries[0];
            expect({ h: b.start.hour, m: b.start.minute }, `${scenario.label}: preview time-in`).toEqual({ h: capture.timeIn.hour, m: capture.timeIn.minute });
            expect({ h: b.end.hour, m: b.end.minute }, `${scenario.label}: preview time-out`).toEqual({ h: capture.timeOut.hour, m: capture.timeOut.minute });
            expect(b.grossMinutes, `${scenario.label}: preview gross minutes`).toBe(expected.grossMinutes);
            expect(b.netMinutes, `${scenario.label}: preview net minutes`).toBe(expected.netMinutes);
            expect(b.grossMinutes - b.netMinutes, `${scenario.label}: the meal the engine took`).toBe(expected.mealMinutes);
            expect(b.grossMinutes, `${scenario.label}: gross matches the captured span`).toBe(minutes(capture.timeOut) - minutes(capture.timeIn));

            // 6. Commit — tick each own Reference, never the header checkbox — then read the written card(s) back.
            const result = await commitTransfer(run, { sessionApi, pages }, seed, candidates);
            expect(result.jobCardsWritten, `${scenario.label}: exactly ${expected.jobCards} job card written`).toBe(expected.jobCards);

            // 7. The committed card on screen.
            await pages.jobCards.applyDateRange(run.day);
            await expect(pages.jobCards.rowsForCrew(run.crew.name), `${scenario.label}: one crew-scoped row (the day carries other tenants' cards)`).toHaveCount(expected.jobCards);
            expect(await pages.jobCards.jobsForCrew(run.crew.name), `${scenario.label}: the card's Job cell`).toContain(run.job.name);
            expect(await pages.jobCards.amountsForCrew(run.crew.name), `${scenario.label}: the card's Amount cell`).toEqual([expected.totalAmount]);

            // 8. Read-back over the GET — one card, the right job, not exported, not locked.
            const { cards, timeCards } = await readDailyOvertime(run, { sessionApi, testInfo });
            expect(cards, `${scenario.label}: one committed job card`).toHaveLength(expected.jobCards);
            expect(Number(cards[0].jobCounter), `${scenario.label}: the committed card's job`).toBe(run.job.id);
            expect(Boolean(cards[0].exported), `${scenario.label}: the fresh card is not exported`).toBe(false);
            expect(Boolean(cards[0].locked), `${scenario.label}: the fresh card is not locked`).toBe(false);

            // 9. The calculation classifies the day; it does not rewrite the capture.
            expect(timeCards, `${scenario.label}: both time cards readable`).toHaveLength(expected.timeCards);
            for (const tc of timeCards) {
                expect(Boolean(tc.transferred), `${scenario.label}: time card ${tc.timeCardCounter} must read transferred`).toBe(true);
            }
        } finally {
            // 10. The job card(s) by id, then the time cards, then the crew-scoped sweep.
            await run.cleanup();
        }
    });
});
