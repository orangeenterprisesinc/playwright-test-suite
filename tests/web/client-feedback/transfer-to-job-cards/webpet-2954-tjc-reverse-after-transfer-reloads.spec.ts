/**
 * WEBPET-2954 — After a transfer, View ▸ Job Cards has a Reverse button; clicking it returns to Transfer to Job Cards with the time cards already loaded.
 * Data: src/data/client-feedback/webpet-2954-tjc-reverse-after-transfer-reloads.json · Plan: test-plans/client-feedback/webpet-2954-tjc-reverse-after-transfer-reloads.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcReverseAfterTransferCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ownReferences, prepareCfRun, reverseCrewDay, seedCrewDay, transferCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-2954 · Transfer to Job Cards: reverse returns with the time cards loaded', { tag: ['@ClientFeedback', '@WEBPET-2954'] }, () => {
    test('Reverse on the Job Cards view returns to Transfer with the reversed time cards already loaded', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-2954' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcReverseAfterTransferCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const view = pages.viewJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then an hourly day seeded on screen.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);

        // 1. Transfer the crew's day; the app lands on View > Job Cards with this run.
        const transfer = await transferCrewDay(run, deps, seed, s.expected.jobCards);
        await view.waitForTransferLanding();

        // 2. The landing shows the Reverse button and exactly this transfer's job cards.
        await expect(view.reverseButton, 'the Job Cards view offers Reverse').toBeVisible();
        await expect(view.rowsForCrew(run.crew.name), 'the landing lists the transfer\'s job cards').toHaveCount(s.expected.jobCards);

        // 3. Reverse and confirm.
        await reverseCrewDay(run, deps, transfer, { jobCards: s.expected.jobCards, timeCards: seed.timeCardCounters.length });
        await expect(tjc.recordToast(s.expected.reversedToast), 'the reverse confirms').toBeVisible();

        // 4. Back on Transfer, with no Analyze click, the reversed time cards are already loaded and no longer transferred.
        const own = ownReferences(run).sort();
        await expect.poll(async () => (await tjc.candidateReferences()).sort(), { message: 'the time cards load without clicking Analyze', timeout: 60_000 }).toEqual(own);
        for (const reference of own) {
            expect(await tjc.rowTransferred(reference), `${reference} is available again`).toBe(s.expected.transferred);
        }
    });
});
