/**
 * WEBPET-3706 — Setup ▸ TimeSheet Setup: Undo after a Multi-Delete restores the rows with a success message and no error.
 * Data: src/data/client-feedback/webpet-3706-timesheet-validation-undo-multi-delete.json · Plan: test-plans/client-feedback/webpet-3706-timesheet-validation-undo-multi-delete.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { ValidationUndoMultiDeleteCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { mintValidationNames } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3706 · TimeSheet Validations: Undo a Multi-Delete', { tag: ['@ClientFeedback', '@WEBPET-3706'] }, () => {
    test('Undo after a Setup multi-delete restores the records and shows success with no error', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3706' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(ValidationUndoMultiDeleteCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const v = pages.timeSheetValidation;

        // 0. Mint the rows' names; teardown is registered before anything is created.
        const names = mintValidationNames({ sessionApi, testInfo, pages }, s.ticket, s.rows);

        // 1. Setup > TimeSheet Setup from the menu; create the rows on screen.
        for (const name of names) expect(await v.createValidation(name), `${name} is created`).toBe('created');

        // 2. Back on the list, filter to the own rows, switch on Multi-Edit and tick them.
        await v.gotoList();
        await v.grid.nameFilter.fill(names[0]);
        for (const name of names) await expect(v.ownRow(name)).toBeVisible({ timeout: 15_000 });
        await v.setMultiEdit(true);
        await v.grid.selectRows(names);
        expect(await v.selectedCount(), 'only the own rows are selected').toBe(names.length);

        // 3. Multi-Delete: the rows leave the grid.
        await v.deleteSelected(names.length);
        await expect(v.toast(s.expected.deletedToast)).toBeVisible();
        await expect(v.emptyGridMessage.filter({ hasText: s.expected.emptyGrid })).toBeVisible();
        for (const name of names) await expect(v.ownRow(name)).toHaveCount(0);

        // 4. Undo: the rows come back, a success message shows, no error does.
        await v.undoButton.click();
        for (const name of names) await expect(v.ownRow(name), `${name} is back`).toBeVisible({ timeout: 15_000 });
        await expect(v.toast(s.expected.undoneToast), 'Undo reports success').toBeVisible();
        await expect(v.errorToasts, 'no error or failure message').toHaveCount(0);

        // 5. Delete the rows on screen again and leave them deleted (soft; names stay reserved, WEBPET-1798).
        await v.grid.selectRows(names);
        await v.deleteSelected(names.length);
        for (const name of names) await expect(v.ownRow(name)).toHaveCount(0);
    });
});
