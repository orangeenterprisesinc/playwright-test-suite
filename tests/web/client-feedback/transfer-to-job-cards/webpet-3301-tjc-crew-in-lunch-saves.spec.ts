/**
 * WEBPET-3301 (+ WEBPET-3282) — Transfer to Job Cards: a Crew Time In for Phase 0 - Lunch saves without the "Something went wrong" error.
 * Data: src/data/client-feedback/webpet-3301-tjc-crew-in-lunch-saves.json · Plan: test-plans/client-feedback/webpet-3301-tjc-crew-in-lunch-saves.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcCrewInLunchCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, recordCrewInCards } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3301 · Transfer to Job Cards: Crew In for Phase 0 - Lunch saves', { tag: ['@ClientFeedback', '@WEBPET-3301'] }, () => {
    test('a Crew In for Phase 0 - Lunch saves both employees without the Something went wrong error', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3301' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcCrewInLunchCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };
        const e = s.expected;

        // 0. Arrange: the crew's fixture rows and a clean day.
        const run = await prepareCfRun(s, deps);

        // 1. Open Transfer to Job Cards, then New record > Crew In.
        await tjc.openFromMenu();
        await tjc.openCrewIn();

        // 2. Fill the sheet: Use Employee Crew, the crew, Ranch, Field and the Lunch phase; the roster loads with everyone selected.
        await tjc.fillCrewIn({
            day: run.day,
            time: s.crewIn.at,
            crew: run.crew.name,
            useEmployeeCrew: true,
            ranch: run.ranch.name,
            field: run.field.name,
            phase: s.crewIn.phase,
        });
        await expect(tjc.crewInRosterCount, 'the roster selects the whole crew').toHaveText(e.rosterStatus);

        // 3. Save: the status dialog reports the records created and no error appears.
        const status = await tjc.saveCrewIn();
        const created = await recordCrewInCards(run, deps, []);
        expect(status, 'the Crew-In status dialog').toContain(e.status);
        await expect(tjc.pageText(e.errorText), 'no "Something went wrong" error').toBeHidden();
        await tjc.confirmCrewInStatus();
        expect(created, 'one Time In per employee').toHaveLength(e.created);

        // 4. The new Time Ins show on the Transfer grid with the Lunch phase and the chosen ranch and field.
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: created.length });
        for (const card of created) {
            const row = await tjc.readRow(card.reference);
            expect({ time: row.time, type: row.type, job: row.job, ranch: row.ranch, field: row.field }, `${card.reference} as saved`).toEqual({
                time: e.time,
                type: e.type,
                job: e.job,
                ranch: e.ranch,
                field: e.field,
            });
        }
    });
});
