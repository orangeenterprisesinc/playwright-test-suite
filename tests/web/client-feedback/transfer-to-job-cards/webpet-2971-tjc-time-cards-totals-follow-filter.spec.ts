/**
 * WEBPET-2971 — Transfer to Job Cards: the Time Cards tab totals (Gross, Net, Meals) follow the Work Crew / Employee filter instead of covering the whole transfer.
 * Data: src/data/client-feedback/webpet-2971-tjc-time-cards-totals-follow-filter.json · Plan: test-plans/client-feedback/webpet-2971-tjc-time-cards-totals-follow-filter.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcTotalsFollowFilterCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { designateMealJob, ensureCfMealJob, ownCard, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-2971 · Transfer to Job Cards: totals follow the filter', { tag: ['@ClientFeedback', '@WEBPET-2971'] }, () => {
    test('On Transfer to Job Cards the Time Cards tab totals (Gross, Net, Meals) follow the Work Crew / Employee filter instead of covering the whole transfer', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-2971' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcTotalsFollowFilterCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };
        const { labels, decimals } = s.expected;

        // 0. Arrange: the crew's fixture rows, CF MEAL JOB as the tenant's Meal Job (without one a lunch is no meal: Meals 0, Net = Gross),
        //    then each employee's day with a lunch punch on it seeded on screen.
        const run = await prepareCfRun(s, deps);
        const meal = await designateMealJob(run, deps, await ensureCfMealJob(run, deps));
        await seedCrewDay(run, deps, s.seed);

        // 1. Open Transfer to Job Cards from the left menu.
        await tjc.openFromMenu();

        // 2. Scope the day and Time Card Crew, then analyze.
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: s.expected.analyzed });

        // 3. With no filter the totals cover every analyzed card.
        for (const l of labels) {
            await expect.poll(() => tjc.totalsNumber(l), { message: `${l} covers the whole transfer` }).toBeCloseTo(s.expected.all[l], decimals);
        }

        // 4. Filter to one employee.
        await tjc.pickGridFilter('Employee', s.filter.label);

        // 5. The Time Cards totals follow the filter and equal the Job Cards bar.
        const tc: Record<string, number> = {};
        for (const l of labels) {
            await expect.poll(() => tjc.totalsNumber(l), { message: `${l} follows the Employee filter` }).toBeCloseTo(s.expected.filtered[l], decimals);
            tc[l] = await tjc.totalsNumber(l);
            expect(tc[l], `${l} is below the whole-transfer figure`).toBeLessThan(s.expected.all[l]);
        }
        await tjc.openJobCardsTab();
        for (const l of labels) {
            await expect.poll(() => tjc.jobCardsTotalsNumber(l), { message: `${l} equals the Job Cards bar` }).toBeCloseTo(tc[l], decimals);
        }
        // The fix is the figures above. The Job Cards info banner still claims the Time Cards totals cover the whole
        // transfer (dev 2026-11-11) — stale copy, reported as a finding rather than failing the ticket's TC.
        if ((await tjc.pageRoot.getByText(s.expected.absentBanner).count()) > 0) {
            testInfo.annotations.push({ type: 'finding', description: `Job Cards banner still says the Time Cards totals "${s.expected.absentBanner}", but they follow the filter (WEBPET-2971 fix).` });
        }

        // 6. Ticking and un-ticking the employee's own rows leaves the totals on the filter.
        await tjc.openTimeCardsTab();
        const ticked = s.expected.ticked.map((t) => ownCard(run, t.employee, t.kind).reference);
        const totalsHold = async (message: string): Promise<void> => {
            await expect(tjc.totalsStrip, 'the totals line is no longer loading').not.toHaveAttribute('aria-busy', 'true');
            for (const l of labels) {
                await expect.poll(() => tjc.totalsNumber(l), { message: `${l} ${message}` }).toBeCloseTo(tc[l], decimals);
            }
        };
        for (const reference of ticked) await tjc.selectCandidate(reference);
        await totalsHold('is unchanged with the rows ticked');
        for (const reference of ticked) await tjc.deselectCandidate(reference);
        await totalsHold('is unchanged with the rows un-ticked');
        await tjc.expectSelectAllUntouched('select-all was never touched');

        // 7. Clearing the filter returns the totals to the whole transfer.
        await tjc.clearGridFilter('Employee');
        await expect(tjc.gridFilterValue('Employee'), 'the Employee filter is back to all').toContainText(s.expected.allEmployees);
        for (const l of labels) {
            await expect.poll(() => tjc.totalsNumber(l), { message: `${l} is back to the whole transfer` }).toBeCloseTo(s.expected.all[l], decimals);
        }

        // 8. Put the shared Meal Job preference back (the lock it holds is what keeps WEBPET-3491 off it meanwhile).
        await meal.restore();
    });
});
