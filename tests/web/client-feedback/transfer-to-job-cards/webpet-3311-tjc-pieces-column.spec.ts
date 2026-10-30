/**
 * WEBPET-3311 — Transfer to Job Cards: Pieces column missing from Show columns options.
 * Data: src/data/client-feedback/webpet-3311-tjc-pieces-column.json · Plan: test-plans/client-feedback/webpet-3311-tjc-pieces-column.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcPiecesColumnCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';

test.describe('WEBPET-3311 · Transfer to Job Cards: Pieces in Show columns', { tag: ['@ClientFeedback', '@WEBPET-3311'] }, () => {
    test('Show columns lists Pieces and the Time Cards grid shows the Pieces column', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3311' }],
    }, async ({ pages }, testInfo) => {
        const s = await loadScenario(TjcPiecesColumnCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;

        // 1. Open Transfer to Job Cards from the left menu.
        await tjc.openFromMenu();

        // 2. On the Time Cards tab (the default), click Columns.
        await tjc.openColumnPicker();

        // 3. The Show columns dialog lists Pieces.
        const entry = tjc.columnPickerEntry(s.expected.pickerEntry);
        await expect(entry, `'${s.expected.pickerEntry}' is listed in Show columns`).toBeVisible();

        // 4. Pieces ends ticked (the POM ticks it and annotates when it was not).
        await tjc.ensureColumnShown(s.expected.pickerEntry, testInfo);
        await expect(entry, `'${s.expected.pickerEntry}' is ticked`).toBeChecked();

        // 5. Close the dialog; the grid shows the Pieces column header.
        await tjc.closeColumnPicker();
        await expect(tjc.gridColumnHeader(s.expected.columnHeader), `the grid shows the '${s.expected.columnHeader}' column`).toBeVisible();
    });
});
