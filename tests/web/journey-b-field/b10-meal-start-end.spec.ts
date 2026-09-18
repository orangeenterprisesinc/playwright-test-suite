/**
 * Catalog workflow B10 — Meal start and end (field).
 * Data: src/data/journey-b/b10-meal-start-end.json · Plan: test-plans/journey-b/b10-meal-start-end.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { assertExpectedCards, assertTransferGrid, cardOf, recordMoment, runJourneyBScenario, storedMoment } from '@utils/journeys/journeyBFlow';

test.describe('B10 · Meal start and end (field)', { tag: ['@JourneyB', '@B10'] }, () => {
    test('[Meal] Deliver a meal start on the meal job and its return on the work job, and verify both punches.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B10-001' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const run = await runJourneyBScenario(scenario, { sessionApi, pages, testInfo });
        try {
            const want = scenario.expected.envelope!;
            // records: the clock-in, the meal start on the meal job, the return on the work job.
            const [, mealStart, mealReturn] = scenario.records;
            expect(run.envelope.sections).toEqual(want.sections);
            expect(run.envelope.employeeSources, 'three BarcodeBadge sources').toEqual(want.employeeSources);
            expect(run.envelope.jobOccurrences[mealStart.jobCode!], 'the meal job appears once').toBe(want.jobOccurrences![mealStart.jobCode!]);
            expect(run.envelope.jobOccurrences[mealReturn.jobCode!], 'the work job appears twice').toBe(want.jobOccurrences![mealReturn.jobCode!]);
            for (const tag of want.absentTags!) {
                expect(run.envelope.tagNames, 'nothing reaches a break-card table').not.toContain(tag);
            }
            expect(run.envelope.referenceParts).toEqual(want.referenceParts);
            expect(run.envelope.references).toHaveLength(scenario.records.length);
            expect(run.envelope.gpsFixes, 'only the meal-return record carries a GPS fix').toBe(want.gpsFixes);
            expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);

            expect(run.cards).toHaveLength(scenario.expected.cards.length);
            assertExpectedCards(run, scenario.expected.cards);
            const [clockIn, mealStartCard, mealReturnCard] = scenario.expected.cards.map((c) => cardOf(run, c.record));
            // B10-R1/R2
            expect(mealStartCard.card.jobCounter).toBe(mealStartCard.bound.jobId);
            expect(mealReturnCard.card.jobCounter).toBe(mealReturnCard.bound.jobId);
            expect(mealReturnCard.card.timeCardCounter).not.toBe(mealStartCard.card.timeCardCounter);
            // B10-R3
            for (const { card, expected: json, bound } of [clockIn, mealStartCard, mealReturnCard]) {
                expect(card.employeeCounter).toBe(bound.employeeId);
                expect(card.cardType).toBe(json.cardType);
            }
            // B10-R4: this envelope controls the seconds, so the stored instant equals the sent one verbatim.
            expect(storedMoment(mealStartCard.card).getTime()).toBe(recordMoment(run, mealStartCard.index).getTime());
            expect(storedMoment(mealReturnCard.card).getTime()).toBe(recordMoment(run, mealReturnCard.index).getTime());
            for (const gap of scenario.expected.intervals!) {
                expect(storedMoment(cardOf(run, gap.to).card).getTime() - storedMoment(cardOf(run, gap.from).card).getTime()).toBe(gap.ms);
            }
            // B10-R6: the Transfer grid, the meal-return row's panel reading the WORK job. B10-R7: no meal/lunch/break issue group.
            const grid = await assertTransferGrid(pages, run, scenario.expected.grid!);
            for (const group of grid.issueGroups ?? []) {
                expect(group).not.toMatch(new RegExp(scenario.expected.grid!.absentIssueGroupPattern!, 'i'));
            }
        } finally {
            await run.cleanup();
        }
    });
});
