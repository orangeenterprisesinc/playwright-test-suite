/**
 * WEBPET-3893 — Transfer to Job Cards ▸ Crew In with Crew = ALL EMPLOYEES lists every timed-in employee, all ticked, and saves.
 * Data: src/data/client-feedback/webpet-3893-tjc-crew-in-all-employees.json · Plan: test-plans/client-feedback/webpet-3893-tjc-crew-in-all-employees.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcCrewInAllEmployeesCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    designateAllEmployeesCrew,
    ensureCfAllEmployeesCrew,
    prepareCfRun,
    recordCrewInCards,
    seedCrewDay,
} from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3893 · Transfer to Job Cards: Crew In with Crew = ALL EMPLOYEES', { tag: ['@ClientFeedback', '@WEBPET-3893'] }, () => {
    test('Crew In with Crew = ALL EMPLOYEES lists every timed-in employee, all ticked, and saves', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3893' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcCrewInAllEmployeesCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };
        const e = s.expected;

        // 0. Arrange: two crews on one day, each with two open Time Ins, and the CF ALL EMPLOYEES crew.
        const run = await prepareCfRun(s, deps);
        const all = await ensureCfAllEmployeesCrew(deps);
        await seedCrewDay(run, deps, s.seed);
        await seedCrewDay(run, deps, s.extraCrews[0].seed, run.extra[0]);
        const before = run.timeCardIds.slice();

        // 1. Preferences > Defaults: point "Crew of All the Employees Currently on the Job" at CF ALL EMPLOYEES.
        const pref = await designateAllEmployeesCrew(run, deps, all, s.preference);

        // 2. Open Transfer to Job Cards, scope the day and both crews, analyze.
        await tjc.openFromMenu();
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrews([run.crew.name, run.extra[0].crew.name]);
        await tjc.analyzeCandidates({ expected: e.employees });
        await expect.poll(() => tjc.totalsNumber('Employees'), { message: 'the footer counts the employees on the grid' }).toBe(e.employees);

        // 3. New record > Crew In, Crew = CF ALL EMPLOYEES: every timed-in employee is listed and ticked.
        await tjc.openCrewIn();
        await tjc.fillCrewIn({ day: run.day, time: s.crewIn.at, crew: all.name, useEmployeeCrew: false, basedOnLater: false });
        await expect(tjc.crewInNoEmployees, 'the roster is not empty').toBeHidden();
        await expect(tjc.crewInRosterCount, 'every employee is ticked').toHaveText(e.rosterStatus);
        for (const label of e.labels) await expect(tjc.crewInEmployee(label), `${label} is listed and ticked`).toBeChecked();
        await expect(tjc.crewInSheet.getByRole('checkbox', { name: /: / }), 'only the timed-in employees are listed').toHaveCount(e.employees);
        await expect(tjc.crewInToggleAll(e.toggleAll), 'the toggle offers Deselect All').toBeVisible();

        // 4. Save: one Time In per employee, no validation error.
        const status = await tjc.saveCrewIn();
        const created = await recordCrewInCards(run, deps, before);
        expect(status, 'the Crew-In status dialog').toContain(e.status);
        await expect(tjc.pageText(e.errorText), 'no "Select at least 1" validation error').toBeHidden();
        await tjc.confirmCrewInStatus();
        expect(created, 'one Time In per employee').toHaveLength(e.created);
        expect(new Set(created.map((c) => c.employeeId)), 'the Time Ins belong to the four timed-in employees').toEqual(
            new Set([...run.employees, ...run.extra[0].employees].map((x) => x.id)),
        );
        const stamped = (run.ctx.cards ?? []).filter((c) => created.some((x) => x.id === c.timeCardCounter)).map((c) => String(c.crewCounter));
        testInfo.annotations.push({ type: 'evidence', description: `Crew Counter on the new Time Ins: ${[...new Set(stamped)].join(', ')}` });

        // 5. Put the preference back (cleanup PUT: the select offers no None option) and read it back on screen.
        await pref.restore();
    });
});
