/**
 * WEBPET-3574 — A Multi Edit on View ▸ Time Cards can be reversed with Undo and the old value returns.
 * Data: src/data/client-feedback/webpet-3574-vtc-reverse-multi-edit-undo.json · Plan: test-plans/client-feedback/webpet-3574-vtc-reverse-multi-edit-undo.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VtcReverseMultiEditCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { bulkEditHead, findOwnEditBatch, ownCard, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3574 · View Time Cards: reverse a Multi Edit', { tag: ['@ClientFeedback', '@WEBPET-3574'] }, () => {
    test('a Multi Edit on View > Time Cards can be reversed with Undo and the old value returns', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3574' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(VtcReverseMultiEditCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const view = pages.viewTimeCards;
        const reverse = pages.reverseMultiEdit;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then its day of time cards seeded on screen.
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);

        // 1. Open View > Time Cards, scope the day and the Time Card Crew, apply.
        await view.openFromMenu();
        await view.scopeToDay(run.day);
        await view.scopeToTimeCardCrew(run.crew.name);
        await view.applyFilter();
        expect(await view.totalRows(), 'the crew-day loads its own cards').toBe(s.expected.rows);

        // 2. Tick one employee's two cards and read their current values.
        const refs = [ownCard(run, 'one', 'timeIn').reference, ownCard(run, 'one', 'timeOut').reference];
        const before: string[] = [];
        for (const ref of refs) before.push(await view.readCell(view.row(ref), s.expected.field));
        await view.cardGrid.selectRows(refs);
        const since = await bulkEditHead(deps);

        // 3. Multi Update: set the field to the new value for the two rows.
        await view.openMultiUpdate();
        await view.chooseMuField(s.expected.field);
        await view.muTextValue(s.expected.field).fill(s.expected.value);
        await view.updateRecordsButton(refs.length).click();
        await expect(view.toast(s.expected.toast), 'the update is reported').toBeVisible({ timeout: 15_000 });
        for (const ref of refs) {
            // The toast comes before the grid repaints; the failed run's end-state snapshot shows the value landed.
            await expect.poll(() => view.readCell(view.row(ref), s.expected.field), { message: `${ref} carries the new value`, timeout: 15_000 }).toBe(s.expected.value);
        }

        // 4. File > Restore or Reverse > Reverse Multi Edit lists the batch as Active.
        const batch = await findOwnEditBatch(run, deps, since, {
            tableName: s.expected.recordType,
            fieldName: s.expected.fieldName,
            newValue: s.expected.value,
            recordCount: refs.length,
        });
        await reverse.goto();
        const row = reverse.batchRow(batch, s.expected.recordType);
        await expect(reverse.cell(row, 'status'), 'the batch is Active').toHaveText(s.expected.active);
        await expect(reverse.undoButton(row), 'the batch offers Undo').toBeEnabled();

        // 5. Undo and confirm: the batch is Undone and offers no Undo.
        const dialogText = await reverse.undoBatch(batch, s.expected.recordType);
        expect(dialogText, 'the dialog names the restore').toContain(s.expected.undoText);
        await expect(reverse.cell(row, 'status'), 'the batch is Undone').toHaveText(s.expected.undone);
        await expect(reverse.undoButton(row), 'an undone batch has no Undo').toHaveCount(0);

        // 6. Back on View > Time Cards the old value returned (the range can reset on re-entry, so re-scope).
        await view.openFromMenu();
        await view.scopeToDay(run.day);
        await view.scopeToTimeCardCrew(run.crew.name);
        await view.applyFilter();
        // The count is already up from the cached Apply render, so the refreshed rows can paint a beat after the GET
        // (CF full run 2026-11-02 read the pre-Undo value once); poll like step 3.
        for (const [i, ref] of refs.entries()) {
            await expect.poll(() => view.readCell(view.row(ref), s.expected.field), { message: `${ref} has its old value back`, timeout: 15_000 }).toBe(before[i]);
        }
    });
});
