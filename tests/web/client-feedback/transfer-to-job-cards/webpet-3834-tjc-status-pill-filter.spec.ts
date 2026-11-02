/**
 * WEBPET-3834 — Transfer to Job Cards: clicking the Ready status count filters the grid to Ready records.
 * Data: src/data/client-feedback/webpet-3834-tjc-status-pill-filter.json · Plan: test-plans/client-feedback/webpet-3834-tjc-status-pill-filter.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcStatusPillCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3834 · Transfer to Job Cards: status pill filter', { tag: ['@ClientFeedback', '@WEBPET-3834'] }, () => {
    test('clicking the Ready count filters the grid to ready records and clicking again restores it', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3834' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcStatusPillCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then a Ready pair and a lone Time In seeded on screen.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);

        // 1. Open Transfer to Job Cards, scope the day and the crew, analyze.
        await tjc.openFromMenu();
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: seed.timeCardCounters.length });
        await expect(tjc.totalsCaption, 'the analyzed count is shown').toHaveText(s.expected.analyzedCaption);
        await expect.poll(() => tjc.readyCount(), { message: 'the Ready count settles' }).toBe(s.expected.pillCount);

        // 2. Click the Ready count: only Ready rows stay.
        await tjc.clickStatusPill(s.expected.pill);
        await expect(tjc.statusPill(s.expected.pill), 'the pill is pressed').toHaveAttribute('aria-pressed', 'true');
        await expect(tjc.totalsCaption, 'the totals caption follows the pill').toHaveText(s.expected.filteredCaption);
        await expect
            .poll(() => tjc.visibleStatuses(), { message: 'only Ready rows stay' })
            .toEqual(Array(s.expected.pillCount).fill(s.expected.status));

        // 3. Click it again: every row is back, the other status included.
        await tjc.clickStatusPill(s.expected.pill);
        await expect(tjc.statusPill(s.expected.pill), 'the pill is released').toHaveAttribute('aria-pressed', 'false');
        await expect(tjc.totalsCaption, 'the totals caption is back').toHaveText(s.expected.analyzedCaption);
        await expect
            .poll(async () => (await tjc.visibleStatuses()).length, { message: 'every row is back' })
            .toBe(seed.timeCardCounters.length);
        expect(await tjc.visibleStatuses(), `the ${s.expected.otherStatus} row is back`).toContain(s.expected.otherStatus);
    });
});
