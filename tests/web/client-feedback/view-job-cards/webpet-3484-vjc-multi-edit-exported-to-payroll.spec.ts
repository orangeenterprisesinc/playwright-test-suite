/**
 * WEBPET-3484 — View ▸ Job Cards: Exported to Payroll is offered in Multi Edit.
 * Data: src/data/client-feedback/webpet-3484-vjc-multi-edit-exported-to-payroll.json · Plan: test-plans/client-feedback/webpet-3484-vjc-multi-edit-exported-to-payroll.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VjcExportedMultiEditCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { deleteOwnJobCards, prepareCfRun, seedCrewDay, transferCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3484 · View Job Cards: Multi Edit Exported to Payroll', { tag: ['@ClientFeedback', '@WEBPET-3484'] }, () => {
    test('Exported to Payroll is offered in Multi Edit on View > Job Cards', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3484' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(VjcExportedMultiEditCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const jv = pages.viewJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then an hourly day seeded on screen.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);

        // 1. Transfer the crew's day; the app lands on View > Job Cards with this run.
        const transfer = await transferCrewDay(run, deps, seed, s.expected.jobCards);
        await jv.waitForTransferLanding();

        // 2. The landing lists exactly this transfer's job cards.
        const rows = jv.rowsForCrew(run.crew.name);
        await expect(rows, 'the landing lists the transfer\'s job cards').toHaveCount(s.expected.jobCards);
        const refs: string[] = [];
        for (let i = 0; i < s.expected.jobCards; i += 1) refs.push(await jv.referenceOf(rows.nth(i)));

        // 3. Switch on Multi Edit and tick the own rows only.
        await jv.setMultiEdit(true);
        await jv.tickOwn(refs);
        await expect(jv.updateRecordsButton(refs.length), 'the button counts the ticked rows').toBeVisible();

        // 4. The Field list offers Exported to Payroll, and its value is Yes / No.
        expect(await jv.meFieldLabels(), 'the Field list offers the field').toContain(s.expected.field);
        await jv.chooseMeField(s.expected.field);
        expect(await jv.meValueOptions(s.expected.field), 'the value offers No and Yes').toEqual(s.expected.values);

        try {
            // 5. Set it and confirm the review; the rows then show Exported = Yes with Include Exported on.
            await jv.chooseMeValue(s.expected.field, s.expected.set);
            await jv.updateAndConfirm(refs.length, `${s.expected.review}${s.expected.set}.`);
            await expect(jv.toast(s.expected.toast), 'the update is reported').toBeVisible({ timeout: 15_000 });
            await jv.setIncludeExported(true);
            await jv.applyFilter();
            for (const ref of refs) {
                expect(await jv.readCell(jv.rowByReference(ref), s.expected.column), `${ref} is exported`).toBe(s.expected.set);
            }
        } finally {
            // 6. Restore on screen: a locked job card cannot be reversed or deleted.
            await jv.setMultiEdit(true);
            await jv.tickOwn(refs);
            await jv.chooseMeField(s.expected.field);
            await jv.chooseMeValue(s.expected.field, s.expected.restore);
            await jv.updateAndConfirm(refs.length, `${s.expected.review}${s.expected.restore}.`);
            for (const ref of refs) {
                // The grid repaints a beat after the review closes; the first read can still show the old value.
                await expect.poll(() => jv.readCell(jv.rowByReference(ref), s.expected.column), { message: `${ref} is not exported again`, timeout: 15_000 }).toBe(s.expected.restore);
            }
        }

        // 7. Delete the own job cards on screen (the edited cards cannot take the Reverse path).
        await jv.setMultiEdit(false);
        await deleteOwnJobCards(run, deps, transfer, s.expected.deleteConfirmSuffix);
    });
});
