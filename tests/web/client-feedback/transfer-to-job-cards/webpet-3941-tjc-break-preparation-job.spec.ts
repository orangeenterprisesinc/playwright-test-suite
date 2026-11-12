/**
 * WEBPET-3941 — Transfer to Job Cards inserts the crew's Break Preparation Job before a paid break, as legacy does.
 * Data: src/data/client-feedback/webpet-3941-tjc-break-preparation-job.json · Plan: test-plans/client-feedback/webpet-3941-tjc-break-preparation-job.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcBreakPreparationCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ensureCfBreakJobs, prepareCfRun, seedCrewDay, setCrewBreakPreparation } from '@utils/client-feedback/clientFeedbackFlow';
import { designatePaidBreakJob } from '@utils/journeys/paidBreakJob';
import { previewClock } from '@utils/journeys/transferPreview';

const shifted = (hhmm: string, minutes: number): string => {
    const [h, m] = hhmm.split(':').map(Number);
    const total = h * 60 + m + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

test.describe('WEBPET-3941 · Transfer to Job Cards: Break Preparation Job', { tag: ['@ClientFeedback', '@WEBPET-3941'] }, () => {
    test("Transfer inserts the crew's Break Preparation Job before a paid break, as legacy does", {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3941' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcBreakPreparationCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };
        const e = s.expected;

        // 0. Arrange: CF CREW C's Break Preparation (CF NPT JOB, 5 min) on its Edit form, then the day seeded on screen.
        const run = await prepareCfRun(s, deps);
        const jobs = await ensureCfBreakJobs(run, deps);
        const crewRule = await setCrewBreakPreparation(run, deps, { job: jobs.breakPrep, lengthMinutes: s.breakPreparation.lengthMinutes, onlyPieceJobs: s.breakPreparation.onlyPieceJobs });
        const seed = await seedCrewDay(run, deps, s.seed);
        expect(seed.timeCardCounters, 'the day is seeded with the four punches').toHaveLength(e.timeCards);

        // 1. Preferences > Job: CF BREAK JOB is the Paid Break Job for the run.
        const paidBreak = await designatePaidBreakJob(jobs.paidBreak, { sessionApi, pages, testInfo, label: run.label });

        // 2. Transfer to Job Cards: the day, CF CREW C, Analyze, Job Cards tab.
        await tjc.openFromMenu();
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: e.timeCards });
        await tjc.openJobCardsTab();

        // 3. The preview: NPT, then Break (shifted by the preparation length), then work.
        await expect.poll(async () => (await tjc.previewSegments()).length, { message: 'the preview proposes four job cards' }).toBe(e.jobCards);
        const rows = previewClock(await tjc.previewSegments());
        const jobNames = { hourly: run.jobs.hourly.name, paidBreak: jobs.paidBreak.name, breakPrep: jobs.breakPrep.name };
        expect(
            rows.map((r) => ({ job: r.job, start: r.start, end: r.end, minutes: r.grossMinutes })),
            'NPT, then Break, then work',
        ).toEqual(e.segments.map((x) => ({ job: jobNames[x.job], start: x.start, end: x.end, minutes: x.minutes })));
        const breakRow = rows.find((r) => r.job === jobNames.paidBreak);
        expect(breakRow?.start, `the Break starts ${s.breakPreparation.lengthMinutes} minutes after the punched time`).toBe(shifted(e.breakPunch, s.breakPreparation.lengthMinutes));
        expect(rows.reduce((sum, r) => sum + r.grossMinutes, 0), 'the total time is unchanged').toBe(e.totalMinutes);
        await expect.poll(() => tjc.previewTotals(), { message: 'the preview totals bar' }).toEqual({ pieces: e.pieces, jobCards: e.jobCards, employees: e.employees });

        // 4. Nothing is transferred: back to the Time Cards tab, then put both settings back.
        await tjc.openTimeCardsTab();
        await paidBreak.restore();
        await crewRule.restoreOnScreen();
    });
});
