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
    assertExpectedCards,
    cardOf,
    referencePart,
    runJourneyBScenario,
    timeOutDetailOf,
} from '@utils/journeys/journeyBFlow';

test.describe('B12 · Time-out questions to notification', { tag: ['@JourneyB', '@B12'] }, () => {
    test('[Time-Out Questions] Clock three crew members out with their clock-out question answers and a signature, and verify every answer — including the ones outside the expected response — imports against the right time-out card.', {
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'B12-001' },
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

        expect(run.cards).toHaveLength(expected.cards.length);
        assertExpectedCards(run, expected.cards);
        const timeOutCards = expected.cards.filter((c) => records[c.record].node === timeOut.node).map((c) => cardOf(run, c.record));
        // B12-R3
        for (const { card, expected: json, bound } of timeOutCards) {
            expect(card.cardType).toBe(json.cardType);
            expect(card.employeeCounter).toBe(bound.employeeId);
            expect(card.crewCounter).toBe(run.office.crew.id);
            expect(card.programCreated).toBe(true);
            expect(referencePart(String(card.reference))).toBe(timeOut.part);
        }
        // B12-R4 — the nulls explicitly; the flow only skipped the work-context asserts for them.
        for (const { card } of timeOutCards) {
            expect(card.jobCounter).toBeNull();
            expect(card.ranchCounter).toBeNull();
            expect(card.fieldCounter).toBeNull();
        }
        // B12-R5
        const byName = (rows: { questionName: string; response: string }[]) =>
            rows.map(({ questionName, response }) => ({ questionName, response })).sort((a, b) => a.questionName.localeCompare(b.questionName));
        const details = new Map<number, Awaited<ReturnType<typeof timeOutDetailOf>>>();
        for (const { index, card, expected: json } of timeOutCards) {
            const answers = answersOf(run.scenario, index);
            await expect
                .poll(async () => (await timeOutDetailOf(run, index)).questions?.length ?? 0, {
                    timeout: ANSWER_ROWS_SETTLE_MS,
                    message: `${json.employeeCode}'s answers never reached ${answers.length} on card ${card.timeCardCounter}`,
                })
                .toBeGreaterThanOrEqual(answers.length);
            const detail = await timeOutDetailOf(run, index);
            details.set(index, detail);
            expect(detail.questions, `${json.employeeCode}'s answers`).toHaveLength(answers.length);
            expect(byName(detail.questions ?? [])).toEqual(byName(answers));
        }
        // B12-R6 — answers outside the expected response are stored verbatim, not rejected or normalised.
        for (const { index } of timeOutCards) {
            for (const answer of answersOf(run.scenario, index).filter((a) => a.unexpected)) {
                expect(details.get(index)!.questions!.find((q) => q.questionName === answer.questionName)!.response).toBe(answer.response);
            }
        }
        // B12-R8
        expect(run.crewNotify, 'the scenario must name the crewNotifyUser precondition').not.toBeNull();
        expect(run.crewNotify!.crew.userToNotifyBreakAndMeal).toBe(run.crewNotify!.user.usersCounter);
        expect(run.crewNotify!.user.emailAddress).toEqual(expect.any(String));
        expect(run.crewNotify!.user.emailAddress, 'the notification user needs an email address').toBeTruthy();
    });
});
