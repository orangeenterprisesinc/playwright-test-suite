/**
 * Catalog workflow B12 — Time-out questions to notification.
 * Data: src/data/journey-b/b12-time-out-questions.json · Plan: test-plans/journey-b/b12-time-out-questions.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    ANSWER_ROWS_SETTLE_MS,
    answersOf,
    assertImportedRows,
    cardOf,
    referencePart,
    runJourneyBScenario,
    timeOutAnswersOnScreen,
} from '@utils/journeys/journeyBFlow';

test.describe('B12 · Time-out questions to notification', { tag: ['@JourneyB', '@B12'] }, () => {
    test('[Time-Out Questions] Clock three crew members out with their clock-out question answers and a signature, and verify every answer — including the ones outside the expected response — imports against the right time-out card.', {
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'B12' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const run = await runJourneyBScenario(scenario, { sessionApi, pages, testInfo });
        // run.scenario is the loaded file with {signaturePng} substituted.
        const { records, expected } = run.scenario;
        const want = expected.envelope!;
        // records: three time-ins, three time-outs (the clock-outs carry the signature), nine answer rows.
        const [timeIn, , , timeOut] = records;
        const parts = run.envelope.referenceParts;
        expect(run.envelope.sections).toEqual(want.sections);
        expect(run.envelope.employeeSources).toEqual(want.employeeSources);
        expect(run.envelope.references, 'one reference per card, none per answer row').toHaveLength(records.filter((r) => r.parentRecord === undefined).length);
        expect(run.envelope.referenceParts).toEqual(want.referenceParts);
        expect(parts.filter((p) => p === timeIn.part), 'three time-in references').toHaveLength(want.referencePartCounts![timeIn.part!]);
        expect(parts.filter((p) => p === timeOut.part), 'three time-out references').toHaveLength(want.referencePartCounts![timeOut.part!]);
        for (const [section, tags] of Object.entries(want.absentInSection!)) {
            for (const tag of tags) expect(run.envelope.sectionTags[section], `no ${tag} on a ${section} row`).not.toContain(tag);
        }
        for (const section of want.sectionsWithoutLookup!) {
            expect(run.envelope.sectionLookups[section], `${section} rows match on Reference and Name — no LookupContents`).toBeNull();
        }
        expect(run.envelope.answerRows, 'nine answer rows').toBe(want.answerRows);
        // Sample fidelity only — the importer leaves the Signature column unbound (annotation signature-not-bound-on-import).
        expect(run.envelope.signatures, 'three signed clock-outs').toEqual(want.signatures);
        expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);

        // Type, employee, crew and the import marker of all six rows (the absentee 6004 is the set equality) are compared here.
        expect(run.cards).toHaveLength(expected.cards.length);
        await assertImportedRows(pages, run);
        const timeOutCards = expected.cards.filter((c) => records[c.record].node === timeOut.node).map((c) => cardOf(run, c.record));
        for (const { row } of timeOutCards) {
            expect(referencePart(row.reference)).toBe(timeOut.part);
            // The nulls explicitly; the flow skips cells the scenario does not name, and a time-out carries no work context.
            expect(['', '—'], 'a Time Out carries no Job').toContain(row.job);
            expect(['', '—'], 'a Time Out carries no Ranch').toContain(row.ranch);
            expect(['', '—'], 'a Time Out carries no Field').toContain(row.field);
        }
        // Every answer, read off each Time Out panel's Questions grid. Equality over the whole set also proves
        // the answers outside the expected response are stored verbatim, not rejected or normalised.
        const byName = (rows: { questionName: string; response: string }[]) =>
            rows.map(({ questionName, response }) => ({ questionName, response })).sort((a, b) => a.questionName.localeCompare(b.questionName));
        for (const { index, expected: json } of timeOutCards) {
            await expect
                .poll(async () => byName(await timeOutAnswersOnScreen(pages, run, index)), {
                    timeout: ANSWER_ROWS_SETTLE_MS,
                    message: `${json.employeeCode}'s answers never matched the ${answersOf(run.scenario, index).length} the device sent`,
                })
                .toEqual(byName(answersOf(run.scenario, index)));
        }
        expect(run.crewNotify, 'the scenario must name the crewNotifyUser precondition').not.toBeNull();
        expect(run.crewNotify!.shown, 'the crew form must show the notification user').toContain(run.crewNotify!.user.name);
        expect(run.crewNotify!.user.emailAddress).toEqual(expect.any(String));
        expect(run.crewNotify!.user.emailAddress, 'the notification user needs an email address').toBeTruthy();
    });
});
