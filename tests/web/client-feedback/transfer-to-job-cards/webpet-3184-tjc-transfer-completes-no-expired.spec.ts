/**
 * WEBPET-3184 — Transfer to Job Cards completes the transfer without the "Transfer result expired" error.
 * Data: src/data/client-feedback/webpet-3184-tjc-transfer-completes-no-expired.json · Plan: test-plans/client-feedback/webpet-3184-tjc-transfer-completes-no-expired.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcTransferCompletesCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay, transferCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3184 · Transfer to Job Cards: transfer completes with no expired error', { tag: ['@ClientFeedback', '@WEBPET-3184'] }, () => {
    test('Transfer to Job Cards completes and lands on the new job cards without a "Transfer result expired" error', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3184' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcTransferCompletesCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const view = pages.viewJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then an hourly day seeded on screen.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);

        // 1. Transfer the crew's day (the shared commit asserts the "Transfer complete" toast), then wait for the landing.
        await transferCrewDay(run, deps, seed, s.expected.jobCards);
        await view.waitForTransferLanding();

        // 2. No "Transfer result expired" error anywhere, and the landing shows the new job cards.
        await expect(tjc.pageText(s.expected.errorText), 'no "Transfer result expired" error').toBeHidden();
        await expect(view.gridCount, 'the Job Cards grid counts the new cards').toHaveText(s.expected.gridCount);
        await expect(view.rowsForCrew(run.crew.name), 'the landing lists the crew\'s job cards').toHaveCount(s.expected.jobCards);
        await expect(view.reverseButton, 'the landing offers Reverse').toBeVisible();
    });
});
