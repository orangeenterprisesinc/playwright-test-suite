/**
 * WEBPET-3426 — Transfer to Job Cards ▸ Job Cards: the warnings banner is collapsed to a count line and the grid still shows about 10 rows.
 * Data: src/data/client-feedback/webpet-3426-tjc-job-cards-warnings-collapse.json · Plan: test-plans/client-feedback/webpet-3426-tjc-job-cards-warnings-collapse.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcWarningsCollapseCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3426 · Transfer to Job Cards: Job Cards warnings collapse', { tag: ['@ClientFeedback', '@WEBPET-3426'] }, () => {
    test('the Job Cards warnings banner is a collapsed count line and the grid keeps its ten-row floor', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3426' }],
    }, async ({ page, pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcWarningsCollapseCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };
        const e = s.expected;

        // 0. Arrange: the crew's fixture rows, then a piece-job day seeded on screen (piece-job cards raise "No hourly rate" warnings).
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);

        // 1. Set the viewport the ticket reports (1366 x 674); the window must really be that tall.
        await page.setViewportSize(s.viewport);
        expect(await page.evaluate(() => window.innerHeight), 'the viewport height is the one the ticket reports').toBe(s.viewport.height);

        // 2. Open Transfer to Job Cards, scope the day and the crew, analyze, open the Job Cards tab.
        await tjc.openFromMenu();
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: seed.timeCardCounters.length });
        await tjc.openJobCardsTab();

        // 3. The warnings are one collapsed count line with a Show details toggle and no list.
        await expect(tjc.jobCardsWarning, 'the warnings banner is a count line').toContainText(e.bannerText);
        await expect(tjc.jobCardsWarningToggle, 'the toggle offers Show details').toContainText(e.showLabel);
        await expect(tjc.jobCardsWarningToggle).toHaveAttribute('aria-expanded', 'false');
        await expect(tjc.jobCardsWarningList, 'the warning list is collapsed').toBeHidden();

        // 4. The grid keeps its ten-row floor even with the banner showing.
        const floor = e.minRows * e.rowHeightPx;
        const metrics = await tjc.jobCardsTableMetrics();
        expect(metrics.minHeight, 'the table carries the ten-row min-height').toBe(e.tableMinHeight);
        expect(metrics.height, 'the table is at least ten rows tall').toBeGreaterThanOrEqual(floor);
        expect(metrics.bodyHeight, 'the scroll body shows at least ten rows').toBeGreaterThanOrEqual(floor);

        // 5. Show details opens a bounded, scrollable list of the warnings.
        await tjc.jobCardsWarningToggle.click();
        await expect(tjc.jobCardsWarningToggle).toHaveAttribute('aria-expanded', 'true');
        await expect(tjc.jobCardsWarningToggle, 'the toggle now offers Hide details').toContainText(e.hideLabel);
        await expect(tjc.jobCardsWarningList, 'the warning list is open').toBeVisible();
        const list = await tjc.warningListStyle();
        expect(list.overflowY, 'the list scrolls').toBe(e.listOverflowY);
        expect(list.maxHeight, 'the list is height-bounded').toBe(e.listMaxHeight);
        expect(list.items, 'the list names every warning').toBe(e.listItems);

        // 6. Hide details collapses it again.
        await tjc.jobCardsWarningToggle.click();
        await expect(tjc.jobCardsWarningList, 'the warning list collapses again').toBeHidden();
    });
});
