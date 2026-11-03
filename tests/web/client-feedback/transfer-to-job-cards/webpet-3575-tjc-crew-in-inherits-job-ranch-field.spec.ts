/**
 * WEBPET-3575 — Transfer to Job Cards ▸ Crew In saves with Ranch, Field and Phase left empty and gives each employee their own last Job, Ranch and Field.
 * Data: src/data/client-feedback/webpet-3575-tjc-crew-in-inherits-job-ranch-field.json · Plan: test-plans/client-feedback/webpet-3575-tjc-crew-in-inherits-job-ranch-field.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcCrewInInheritCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, recordCrewInCards, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3575 · Transfer to Job Cards: Crew In inherits Job, Ranch and Field', { tag: ['@ClientFeedback', '@WEBPET-3575'] }, () => {
    test('a Crew In with Ranch, Field and Phase left empty gives each employee their last Job, Ranch and Field', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3575' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcCrewInInheritCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };
        const e = s.expected;

        // 0. Arrange: the crew's fixture rows, then an earlier Crew In / Crew Out seeded on screen (the cards the new Crew In inherits from).
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);

        // 1. Open Transfer to Job Cards, then New record > Crew In.
        await tjc.openFromMenu();
        await tjc.openCrewIn();

        // 2. Fill only the time and the crew, with both checkboxes unticked; Ranch, Field and Phase stay empty.
        await tjc.fillCrewIn({ day: run.day, time: s.crewIn.at, crew: run.crew.name, useEmployeeCrew: false, basedOnLater: false });

        // 3. The Phase list offers job names, not their aliases.
        expect(await tjc.crewInPhaseListed([e.phaseName, e.phaseAlias]), 'the Phase list shows names, not aliases').toEqual(e.phaseListed);
        await expect(tjc.crewInRosterCount, 'the roster selects the whole crew').toHaveText(e.rosterStatus);

        // 4. Save: the status dialog reports the records created.
        const status = await tjc.saveCrewIn();
        const created = await recordCrewInCards(run, deps, seed.timeCardCounters);
        expect(status, 'the Crew-In status dialog').toContain(e.status);
        await tjc.confirmCrewInStatus();
        expect(created, 'one Time In per employee').toHaveLength(e.created);

        // 5. Scope the day and the crew, analyze: the earlier cards plus the new Time Ins.
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: seed.timeCardCounters.length + created.length });

        // 6. Each new Time In carries the employee's last Job, Ranch and Field.
        for (const card of created) {
            const row = await tjc.readRow(card.reference);
            expect({ time: row.time, type: row.type, job: row.job, ranch: row.ranch, field: row.field }, `${card.reference} inherited its Job, Ranch and Field`).toEqual({
                time: e.time,
                type: e.type,
                job: e.job,
                ranch: e.ranch,
                field: e.field,
            });
        }
    });
});
