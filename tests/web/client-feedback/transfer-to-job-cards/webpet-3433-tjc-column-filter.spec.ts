/**
 * WEBPET-3433 — Transfer to Job Cards: typing in a column filter narrows the loaded rows, clearing brings them back.
 * Data: src/data/client-feedback/webpet-3433-tjc-column-filter.json · Plan: test-plans/client-feedback/webpet-3433-tjc-column-filter.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcColumnFilterCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3433 · Transfer to Job Cards: column filter', { tag: ['@ClientFeedback', '@WEBPET-3433'] }, () => {
    test('typing in the Job column filter narrows the loaded time cards and clearing it brings them all back', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3433' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(TjcColumnFilterCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then its day of time cards seeded on screen.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);

        // 1. Open Transfer to Job Cards, scope the day and the crew, analyze.
        await tjc.openFromMenu();
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: seed.timeCardCounters.length });
        await expect(tjc.totalsCaption, 'the analyzed count is shown').toHaveText(s.expected.analyzedCaption);
        const analyzedRefs = await tjc.candidateReferences();
        const net = tjc.countAnalyzeRequests();

        // 2. Type partial, lower-case text in the Job filter.
        await tjc.cardGrid.columnFilter(s.expected.column, s.expected.filterText);

        // 3. Only the matching rows stay and the totals caption follows.
        await expect(tjc.totalsCaption, 'the totals caption follows the filter').toHaveText(s.expected.filteredCaption);
        await expect
            .poll(async () => (await tjc.cardGrid.columnValues(s.expected.column)), { message: `only ${s.expected.matchText} rows stay` })
            .toEqual(Array(s.expected.filtered).fill(s.expected.matchText));

        // 4. Clear the filter: every analyzed row is back.
        await tjc.cardGrid.columnFilter(s.expected.column, '');
        await expect(tjc.totalsCaption, 'the totals caption is back to the analyzed count').toHaveText(s.expected.analyzedCaption);
        await expect
            .poll(async () => (await tjc.candidateReferences()).sort(), { message: 'the same rows are back' })
            .toEqual([...analyzedRefs].sort());

        // 5. No new Analyze: the grid is still the one analyzed, and the browser sent no analyze request.
        await expect(tjc.analyzedGrid(s.expected.analyzedCaption), 'the grid keeps its analyzed name').toBeVisible();
        net.stop();
        expect(net.count(), 'filtering sent no new analyze request').toBe(0);
        testInfo.annotations.push({ type: 'network-evidence', description: `analyze requests during filter and clear: ${net.count()}` });
    });
});
