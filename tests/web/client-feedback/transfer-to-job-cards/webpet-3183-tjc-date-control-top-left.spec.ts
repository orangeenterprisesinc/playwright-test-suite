/**
 * WEBPET-3183 — Transfer to Job Cards: the date range picker moved from the Date column to the top-left filter row.
 * Data: src/data/client-feedback/webpet-3183-tjc-date-control-top-left.json · Plan: test-plans/client-feedback/webpet-3183-tjc-date-control-top-left.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcDateControlCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3183 · Transfer to Job Cards: date range picker top-left', { tag: ['@ClientFeedback', '@WEBPET-3183'] }, () => {
    test('the Dates control sits left of Search by and the date column has no range filter', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3183' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(TjcDateControlCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then its day of time cards seeded on screen.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);

        // 1. Open Transfer to Job Cards from the left menu.
        await tjc.openFromMenu();

        // 2. The Dates control sits left of Search by, on the same row.
        const { dates, searchBy } = await tjc.dateControlBoxes();
        expect(dates.x + dates.width, 'Dates is left of Search by').toBeLessThanOrEqual(searchBy.x);
        expect(dates.y, 'Dates and Search by share a row (Dates starts above the end of Search by)').toBeLessThan(searchBy.y + searchBy.height);
        expect(searchBy.y, 'Dates and Search by share a row (Search by starts above the end of Dates)').toBeLessThan(dates.y + dates.height);

        // 3. Scope the date range to the fixture day.
        await tjc.scopeToDay(run.day);

        // 4. Scope Time Card Crew to the fixture crew and analyze.
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: seed.timeCardCounters.length });

        // 5. The grid's date column has no range filter (its filter cell is empty), while another column keeps its filter.
        await expect(await tjc.gridFilterControls(s.expected.filteredColumn), `the ${s.expected.filteredColumn} column keeps its filter`).not.toHaveCount(0);
        await expect(await tjc.gridFilterControls(s.expected.dateColumn), 'the date column has no range filter').toHaveCount(0);

        // 6. Every loaded row is on the picked day.
        expect(await tjc.candidateDates(), 'every loaded row is on the picked day').toEqual(Array(seed.timeCardCounters.length).fill(tjc.usDay(run.day)));
    });
});
