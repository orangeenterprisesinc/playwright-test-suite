/**
 * PET-12960 — Transfer to Job Cards uses legacy's rate lookup: a card on a job with no hourly rate raises no "No hourly rate available" warning when the employee has a rate.
 * Data: src/data/client-feedback/pet-12960-tjc-employee-rate-fallback.json · Plan: test-plans/client-feedback/pet-12960-tjc-employee-rate-fallback.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcRateFallbackCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ensureCfEmployeeRate, prepareCfRun, restoreCfEmployeeRate, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe("PET-12960 · Transfer to Job Cards: employee rate fallback", { tag: ['@ClientFeedback', '@PET-12960'] }, () => {
    test("Transfer to Job Cards uses legacy's rate lookup, so a card on a job with no hourly rate raises no 'No hourly rate available' warning when the employee has a rate", {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'PET-12960' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcRateFallbackCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows.
        const run = await prepareCfRun(s, deps);

        // 1. The employee has an hourly rate on Setup > Employee (set on screen only when missing).
        const rate = await ensureCfEmployeeRate(run, deps, s.rate.employee, s.rate.ifMissing);
        expect(Number(rate.shown), 'Setup > Employee shows an hourly rate').toBeGreaterThan(0);

        // 2. Seed the crew day: a piece-job day with no hourly rate on the job.
        await seedCrewDay(run, deps, s.seed);

        // 3. Open Transfer to Job Cards, scope the day and crew, analyze.
        await tjc.openFromMenu();
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: s.expected.analyzed });

        // 4. No "No hourly rate available" issue, 0 Warnings, no Warning row of this run.
        expect(await tjc.issueGroupTexts(), `no "${s.expected.absentIssue}" group in the Issues panel`).not.toContainEqual(expect.stringContaining(s.expected.absentIssue));
        await expect.poll(() => tjc.warningsPillCount(), { message: 'the Warnings pill reads 0' }).toBe(s.expected.warnings);
        for (const id of run.timeCardIds) {
            await expect(tjc.rowStatus(id), `card ${id} is not a ${s.expected.absentStatus}`).not.toHaveText(new RegExp(s.expected.absentStatus));
        }

        // 5. The Job Cards preview prices the employee's cards at the employee's rate.
        await tjc.openJobCardsTab();
        const employees = await tjc.previewColumn('Employee');
        expect(employees.length, 'the preview lists job cards').toBeGreaterThan(0);
        expect(employees.every((e) => e.endsWith(s.expected.employeeTail)), `every preview row is ${s.expected.employeeTail}'s`).toBe(true);
        // The preview has no Hourly Rate column, so the rate is read as Amount / Net Time on every row that has net time.
        const num = (v: string) => Number(v.replace(/[^0-9.-]/g, ''));
        const nets = (await tjc.previewColumn(s.expected.netColumn)).map(num);
        const amounts = (await tjc.previewColumn(s.expected.amountColumn)).map(num);
        const priced = nets.flatMap((net, i) => (net > 0 ? [{ net, amount: amounts[i] }] : []));
        expect(priced.length, 'the preview has a row with net time').toBeGreaterThan(0);
        for (const { net, amount } of priced) {
            expect(amount, `${s.expected.amountColumn} = ${s.expected.netColumn} ${net} x the employee's rate ${rate.shown}`).toBeCloseTo(net * Number(rate.shown), 2);
        }

        // 6. Put the employee's rate back on screen.
        expect(await restoreCfEmployeeRate(run, deps, s.rate.employee, rate.before), 'the employee rate is back as it was').toBe(rate.before);
    });
});
