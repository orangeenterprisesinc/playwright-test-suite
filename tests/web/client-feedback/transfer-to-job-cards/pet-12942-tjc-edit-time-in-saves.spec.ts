/**
 * PET-12942 — Transfer to Job Cards: editing the time of an existing Time In saves.
 * Data: src/data/client-feedback/pet-12942-tjc-edit-time-in-saves.json · Plan: test-plans/client-feedback/pet-12942-tjc-edit-time-in-saves.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcEditTimeInCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ownCard, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('PET-12942 · Transfer to Job Cards: editing a Time In saves', { tag: ['@ClientFeedback', '@PET-12942'] }, () => {
    test('changing the time of an existing Time In saves without the "Crew should have a Department" error', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'PET-12942' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcEditTimeInCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };
        const e = s.expected;

        // 0. Arrange: the crew's fixture rows, then one Time In seeded on screen.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);
        const card = ownCard(run, s.edit.employee, 'timeIn');

        // 1. Open Transfer to Job Cards, scope the day and the crew, analyze.
        await tjc.openFromMenu();
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrew(run.crew.name);
        await tjc.analyzeCandidates({ expected: seed.timeCardCounters.length });

        // 2. Open the Time In and change its Date / Time; the panel flags unsaved changes.
        await tjc.openRow(card.id);
        await tjc.setPanelDateTime(tjc.timeInPanel, run.day, s.edit.to);
        await expect(tjc.timeInPanel.getByText(e.unsaved, { exact: true }), 'the panel flags the edit').toBeVisible();

        // 3. Save: the saved toast shows and the Department error does not.
        await tjc.savePanel();
        await expect(tjc.recordToast(e.savedToast), 'the Time In saves').toBeVisible();
        await expect(tjc.pageText(e.errorText), 'no "Crew should have a Department" error').toBeHidden();

        // 4. The panel closes and the grid row shows the new time.
        await expect(tjc.timeInPanel, 'the panel closes after saving').toBeHidden();
        await expect(await tjc.rowTime(card.id), 'the row shows the new time').toHaveText(e.time);
    });
});
