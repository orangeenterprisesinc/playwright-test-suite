/**
 * Catalog workflow B11 — Crew-out to individual time-outs.
 * Data: src/data/journey-b/b11-crew-out.json · Plan: test-plans/journey-b/b11-crew-out.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { assertImportedRows, cardOf, displayedStamp, recordStamp, referencePart, runJourneyBScenario } from '@utils/journeys/journeyBFlow';

test.describe('B11 · Crew-out to individual time-outs', { tag: ['@JourneyB', '@B11'] }, () => {
    test('[Crew Out] Record one crew-out for the crew and verify an individual time-out per still-active member, leaving the early leaver untouched.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B11' },
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
        await assertImportedRows(pages, run);
        const [, , , toCard, coCard1, coCard2] = scenario.expected.cards.map((c) => cardOf(run, c.record));
        expect(coCard1.row.type).toBe(coCard1.expected.typeText);
        expect(coCard2.row.type).toBe(coCard2.expected.typeText);
        expect(coCard1.row.employee).toContain(coCard1.bound.employeeName!);
        expect(coCard2.row.employee).toContain(coCard2.bound.employeeName!);
        expect(coCard1.row.crew).toContain(run.office.crew.name);
        expect(coCard2.row.crew).toContain(run.office.crew.name);
        // The import stamps programCreated; on screen an untouched imported row is "not manually edited".
        expect(coCard1.row.manuallyEdited).toBe(false);
        expect(coCard2.row.manuallyEdited).toBe(false);
        expect(referencePart(coCard1.row.reference)).toBe(crewOut.part);
        expect(referencePart(coCard2.row.reference)).toBe(crewOut.part);
        // The blanks explicitly; the flow only skipped the work-context asserts for them.
        for (const { row } of [toCard, coCard1, coCard2]) {
            expect(['', '—'], 'a time-out carries no job').toContain(row.job);
            expect(['', '—'], 'a time-out carries no ranch').toContain(row.ranch);
            expect(['', '—'], 'a time-out carries no field').toContain(row.field);
        }
        expect(referencePart(toCard.row.reference)).toBe(timeOut.part);
        expect(displayedStamp(toCard.row)).toBe(recordStamp(run, toCard.index).slice(0, 16));
        expect(Date.parse(displayedStamp(toCard.row))).toBeLessThan(Date.parse(displayedStamp(coCard1.row)));
        expect(Date.parse(displayedStamp(toCard.row))).toBeLessThan(Date.parse(displayedStamp(coCard2.row)));
        expect(displayedStamp(coCard1.row)).toBe(recordStamp(run, coCard1.index).slice(0, 16));
        expect(displayedStamp(coCard2.row)).toBe(recordStamp(run, coCard2.index).slice(0, 16));
        // The raw EmployeeSource enum has no column; the Employee Selection cell shows its label.
        expect(coCard1.row.employeeSelection).toBe(coCard1.expected.employeeSourceText);
        expect(coCard2.row.employeeSelection).toBe(coCard2.expected.employeeSourceText);
        expect(toCard.row.employeeSelection).toBe(toCard.expected.employeeSourceText);
    });
});
