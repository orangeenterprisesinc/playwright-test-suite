/**
 * Catalog workflow B11 — Crew-out to individual time-outs.
 * Data: src/data/journey-b/b11-crew-out.json · Plan: test-plans/journey-b/b11-crew-out.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { assertExpectedCards, cardOf, recordStamp, referencePart, runJourneyBScenario, storedMoment } from '@utils/journeys/journeyBFlow';

test.describe('B11 · Crew-out to individual time-outs', { tag: ['@JourneyB', '@B11'] }, () => {
    test('[Crew Out] Record one crew-out for the crew and verify an individual time-out per still-active member, leaving the early leaver untouched.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B11-001' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const run = await runJourneyBScenario(scenario, { sessionApi, pages, testInfo });
        const want = scenario.expected.envelope!;
        // records: the morning crew-in (three rows), the early leaver's individual time-out, the crew-out fanned out into two rows.
        const [crewIn, , , timeOut, crewOut] = scenario.records;
        const parts = run.envelope.referenceParts;
        expect(run.envelope.sections).toEqual(want.sections);
        expect(run.envelope.employeeSources).toEqual(want.employeeSources);
        expect(run.envelope.references).toHaveLength(scenario.records.length);
        expect(run.envelope.referenceParts).toEqual(want.referenceParts);
        expect(parts.filter((p) => p === crewOut.part), 'two crew-out references').toHaveLength(want.referencePartCounts![crewOut.part!]);
        expect(parts.filter((p) => p === timeOut.part), 'one individual time-out reference').toHaveLength(want.referencePartCounts![timeOut.part!]);
        expect(parts.filter((p) => p === crewIn.part), 'three crew-in references').toHaveLength(want.referencePartCounts![crewIn.part!]);
        // Sample fidelity: no work-context element on any time-out row.
        for (const [section, tags] of Object.entries(want.absentInSection!)) {
            for (const tag of tags) expect(run.envelope.sectionTags[section], `no ${tag} on a ${section} row`).not.toContain(tag);
        }
        expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);

        expect(run.cards).toHaveLength(scenario.expected.cards.length);
        assertExpectedCards(run, scenario.expected.cards);
        const [, , , toCard, coCard1, coCard2] = scenario.expected.cards.map((c) => cardOf(run, c.record));
        // B11-R4
        expect(coCard1.card.cardType).toBe(coCard1.expected.cardType);
        expect(coCard2.card.cardType).toBe(coCard2.expected.cardType);
        expect(coCard1.card.employeeCounter).toBe(coCard1.bound.employeeId);
        expect(coCard2.card.employeeCounter).toBe(coCard2.bound.employeeId);
        expect(coCard1.card.crewCounter).toBe(run.office.crew.id);
        expect(coCard2.card.crewCounter).toBe(run.office.crew.id);
        expect(coCard1.card.programCreated).toBe(true);
        expect(coCard2.card.programCreated).toBe(true);
        // B11-R5
        expect(referencePart(String(coCard1.card.reference))).toBe(crewOut.part);
        expect(referencePart(String(coCard2.card.reference))).toBe(crewOut.part);
        // B11-R6 — the nulls explicitly; the flow only skipped the work-context asserts for them.
        for (const { card } of [toCard, coCard1, coCard2]) {
            expect(card.jobCounter).toBeNull();
            expect(card.ranchCounter).toBeNull();
            expect(card.fieldCounter).toBeNull();
        }
        // B11-R7
        expect(referencePart(String(toCard.card.reference))).toBe(timeOut.part);
        expect(toCard.card.dateTime).toBe(recordStamp(run, toCard.index));
        expect(storedMoment(toCard.card).getTime()).toBeLessThan(storedMoment(coCard1.card).getTime());
        expect(storedMoment(toCard.card).getTime()).toBeLessThan(storedMoment(coCard2.card).getTime());
        // B11-R8
        expect(coCard1.card.dateTime).toBe(recordStamp(run, coCard1.index));
        expect(coCard2.card.dateTime).toBe(recordStamp(run, coCard2.index));
        // B11-R9 — the raw EmployeeSource enum: on the API response, not on the named OfficeTimeCard fields.
        expect(Number(coCard1.card.employeeSource)).toBe(coCard1.expected.employeeSourceCode);
        expect(Number(coCard2.card.employeeSource)).toBe(coCard2.expected.employeeSourceCode);
        expect(Number(toCard.card.employeeSource)).toBe(toCard.expected.employeeSourceCode);
    });
});
