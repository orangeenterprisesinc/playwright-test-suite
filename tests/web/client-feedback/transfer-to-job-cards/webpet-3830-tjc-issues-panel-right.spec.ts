/**
 * WEBPET-3830 — Transfer to Job Cards: the Issues panel sits right of the grid, the totals line under it.
 * Data: src/data/client-feedback/webpet-3830-tjc-issues-panel-right.json · Plan: test-plans/client-feedback/webpet-3830-tjc-issues-panel-right.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcIssuesPanelCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3830 · Transfer to Job Cards: Issues panel on the right', { tag: ['@ClientFeedback', '@WEBPET-3830'] }, () => {
    test('the Issues panel sits right of the grid and the totals line under it', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3830' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(TjcIssuesPanelCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };
        const tol = s.expected.tolerancePx;

        // 0. Arrange: the crew's fixture rows, then a Time In with no Time Out seeded on screen.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);

        // 1. Open Transfer to Job Cards from the left menu.
        await tjc.openFromMenu();

        // 2. Scope the day and the crew, then analyze.
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: seed.timeCardCounters.length });

        // 3. The issue is listed in the panel.
        expect(await tjc.issueGroupAffectedCount(s.expected.issueGroup), `"${s.expected.issueGroup}" lists its affected card`).toBe(s.expected.affected);
        await expect(tjc.issuesGroupBy, 'the Issues panel offers Group by').toBeVisible();

        // 4. The panel is right of the grid, the totals line under the grid.
        const { grid, issues, totals } = await tjc.layoutBoxes();
        expect(issues.x, 'the Issues panel starts at the grid right edge').toBeGreaterThanOrEqual(grid.x + grid.width - tol);
        expect(issues.y, 'the panel and the grid overlap vertically (panel starts above the grid end)').toBeLessThan(grid.y + grid.height);
        expect(grid.y, 'the panel and the grid overlap vertically (grid starts above the panel end)').toBeLessThan(issues.y + issues.height);
        expect(totals.y, 'the totals line is under the grid').toBeGreaterThanOrEqual(grid.y + grid.height - tol);
        expect(totals.x + totals.width, 'the totals line stays in the grid column').toBeLessThanOrEqual(issues.x + tol);
    });
});
