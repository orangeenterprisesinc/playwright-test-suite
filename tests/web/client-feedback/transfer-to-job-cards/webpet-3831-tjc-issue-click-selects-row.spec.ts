/**
 * WEBPET-3831 — Transfer to Job Cards: clicking an exception in the Issues panel highlights the affected time card.
 * Data: src/data/client-feedback/webpet-3831-tjc-issue-click-selects-row.json · Plan: test-plans/client-feedback/webpet-3831-tjc-issue-click-selects-row.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcIssueClickCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ownCard, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3831 · Transfer to Job Cards: issue click selects the row', { tag: ['@ClientFeedback', '@WEBPET-3831'] }, () => {
    test('clicking an exception in the Issues panel highlights the affected time card in the grid', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3831' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(TjcIssueClickCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then three cards seeded on screen, one of them a Time In with no Time Out.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);
        const affected = ownCard(run, s.expected.affectedCard.employee, s.expected.affectedCard.kind);

        // 1. Open Transfer to Job Cards, scope the day and the crew, analyze.
        await tjc.openFromMenu();
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: seed.timeCardCounters.length });

        // 2. The issue lists exactly the affected card.
        expect(await tjc.issueGroupAffectedCount(s.expected.issueLabel), `"${s.expected.issueLabel}" lists its affected card`).toBe(s.expected.affected);

        // 3. Click the exception in the Issues panel.
        await tjc.clickIssue(s.expected.issueCode);

        // 4. The affected row is highlighted, in view, and it is the only one.
        await expect(tjc.gridRow(affected.reference), 'the affected row is highlighted').toHaveCSS('text-decoration-line', s.expected.decoration);
        await expect(tjc.gridRow(affected.reference), 'the affected row is in view').toBeInViewport();
        expect(await tjc.highlightedReferences(), 'only the affected row is highlighted').toEqual([affected.reference]);

        // 5. The issue detail names the same card.
        await expect(tjc.issueDetailRow(affected.id), 'the issue detail lists the same reference').toContainText(affected.reference);
    });
});
