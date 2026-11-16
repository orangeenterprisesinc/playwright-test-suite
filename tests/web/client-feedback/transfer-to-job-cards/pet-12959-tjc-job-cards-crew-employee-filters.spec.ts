/**
 * PET-12959 — Transfer to Job Cards: the Work Crew and Employee filters stay visible and work on the Job Cards tab.
 * Data: src/data/client-feedback/pet-12959-tjc-job-cards-crew-employee-filters.json · Plan: test-plans/client-feedback/pet-12959-tjc-job-cards-crew-employee-filters.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcJobCardsFiltersCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('PET-12959 · Transfer to Job Cards: Job Cards tab filters', { tag: ['@ClientFeedback', '@PET-12959'] }, () => {
    test('On Transfer to Job Cards the Work Crew and Employee filters stay visible and work on the Job Cards tab', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'PET-12959' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcJobCardsFiltersCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then its day of time cards seeded on screen.
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);

        // 1. Open Transfer to Job Cards from the left menu.
        await tjc.openFromMenu();

        // 2. Scope the day and Time Card Crew, then analyze.
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: s.expected.analyzed });

        // 3. On the Job Cards tab the filter controls are visible and the preview lists one card per employee.
        await tjc.openJobCardsTab();
        await expect(tjc.gridFilterTrigger('Work Crew'), 'the Work Crew filter shows on the Job Cards tab').toBeVisible();
        await expect(tjc.gridFilterTrigger('Employee'), 'the Employee filter shows on the Job Cards tab').toBeVisible();
        await expect(tjc.singleSelectSwitch, 'the Single select switch shows on the Job Cards tab').toBeVisible();
        await expect(tjc.filterDisplayedRowsLabel, 'the "Filter displayed rows" label shows').toBeVisible();
        await expect
            .poll(async () => (await tjc.previewColumn('Employee')).length, { message: `the preview lists ${s.expected.jobCardsBefore} job cards` })
            .toBe(s.expected.jobCardsBefore);

        // 4. Pick the Employee filter: only that employee's card stays and the bar counts it.
        const narrowed = async (): Promise<boolean> => {
            const employees = await tjc.previewColumn('Employee');
            return employees.length === s.expected.jobCardsAfter && employees.every((e) => e.endsWith(s.expected.employeeTail));
        };
        await tjc.pickGridFilter('Employee', s.filter.label);
        await expect.poll(narrowed, { message: `only ${s.expected.employeeTail}'s job card stays` }).toBe(true);
        await expect(tjc.jobCardsTotalsBar, 'the totals bar counts the filtered cards').toContainText(s.expected.jobCardsCaption);

        // 5. The Employee choice survives a switch to Time Cards and back.
        await tjc.openTimeCardsTab();
        await expect(tjc.gridFilterValue('Employee'), 'Time Cards shows the same Employee filter').toContainText(s.filter.label);
        await tjc.openJobCardsTab();
        await expect(tjc.gridFilterValue('Employee'), 'the Employee filter holds on Job Cards').toContainText(s.filter.label);
        await expect.poll(narrowed, { message: 'the narrowed preview holds after the tab switch' }).toBe(true);
        await expect(tjc.jobCardsTotalsBar, 'the totals bar still counts the filtered cards').toContainText(s.expected.jobCardsCaption);
    });
});
