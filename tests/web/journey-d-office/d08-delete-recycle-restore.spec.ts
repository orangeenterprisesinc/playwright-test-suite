/**
 * Catalog workflow D8 — Delete to recycle and restore: a deleted record is kept in the recycle bin and comes back on screen; a multi-delete is undone as one batch.
 * Data: src/data/journey-d/d08-delete-recycle-restore.json · Plan: test-plans/journey-d/d08-delete-recycle-restore.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyD8RecycleCaseSchema } from '@data/schemas/journeyDScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    bulkDeleteHead,
    cropIdOf,
    deletedCropIndex,
    findOwnBatch,
    prepareJourneyD8,
    recordCropId,
} from '@utils/journeys/journeyDFlow';

test.describe('D8 · Delete to recycle and restore', { tag: ['@JourneyD', '@D8'] }, () => {

    test('[Recycle Bin] Delete a crop and restore it from Deleted Records, then undo a multi-delete from Reverse Multi Delete.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'D8' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        test.slow();

        const scenario = await loadScenario(JourneyD8RecycleCaseSchema, testInfo);
        const run = prepareJourneyD8(scenario, { testInfo });
        const { expected } = run.scenario;
        const [cropA, cropB, cropC, cropD] = run.names;
        const { crop, deletedRecords, bulkDeleteHistory } = pages;
        const api = { sessionApi };

        // Arrange: four run-unique crops, created on screen. The id is recorded before any assertion.
        for (const name of run.names) {
            const outcome = await crop.createCrop({ name });
            expect(outcome, `New Crop rejected '${name}'`).toBe('created');
            recordCropId(run, name, crop.savedIdFromUrl());
            await expect(crop.successToast(expected.createdToast), `'${name}' must be confirmed as created`).toBeVisible();
            await expect(crop.heading(expected.editHeadingPrefix + name)).toBeVisible();
        }
        await crop.gotoList();
        await crop.filterToStem(run.stem);
        await crop.expectTotal(run.names.length, 'all four own crops listed');

        // Catalog step 1: delete a record from its form; it is flagged deleted and kept in the database.
        await crop.openEdit(cropA);
        await crop.deleteFromForm(cropA, async (dialog) => {
            await expect(dialog, 'the delete confirmation must warn it cannot be undone').toContainText(expected.deleteDialogText);
        });
        await expect(crop.successToast(expected.deletedToast)).toBeVisible();
        await crop.filterToStem(run.stem);
        await crop.expectTotal(run.names.length - 1, 'A is gone from the list');
        await expect(crop.grid.rowFor(cropA), 'A\'s row must be gone').toHaveCount(0);

        // Catalog step 2: recover it from File > Administration > Deleted Records, one record at a time.
        await deletedRecords.gotoIndex();
        await deletedRecords.openEntity(expected.deletedRecordsLabel, expected.deletedPlural);
        await expect(
            deletedRecords.deletedGrid(expected.deletedPlural).getByRole('checkbox'),
            'restore is one record at a time',
        ).toHaveCount(0);
        await deletedRecords.revealRow(expected.deletedPlural, cropA, await deletedCropIndex(api, cropIdOf(run, cropA)));
        await expect(deletedRecords.deletedRow(expected.deletedPlural, cropA), 'A must be listed in the recycle bin').toBeVisible();
        await deletedRecords.restore(expected.deletedPlural, cropA, cropIdOf(run, cropA));
        await expect(crop.successToast(expected.restoredToast)).toBeVisible();
        await expect(deletedRecords.deletedRow(expected.deletedPlural, cropA), 'A left the recycle bin').toBeHidden();
        await deletedRecords.backToList(expected.deletedRecordsLabel);
        await expect(crop.newButton).toBeVisible();
        await crop.filterToStem(run.stem);
        await crop.expectTotal(run.names.length, 'A is back in the list');

        // Catalog step 3: multi-delete B, C and D from the Crop list. Only own rows, ticked by name.
        testInfo.annotations.push({
            type: 'plumbing-read',
            description: 'D8: bulk-delete history head and own batch id (the undo-safety gate), crops/deleted index (scroll hint)',
        });
        const head = await bulkDeleteHead(api);
        await crop.enableMultiUpdate();
        for (const name of [cropB, cropC, cropD]) await crop.rowCheckbox(name).check();
        expect(await crop.selectedCount(), 'exactly the three own rows selected').toBe(expected.batchSize);
        await crop.deleteSelected(expected.batchSize, async (dialog) => {
            await expect(dialog, 'the bulk delete must say it can be undone from the selection bar').toContainText(expected.bulkDialogText);
        });
        await expect(crop.successToast(expected.bulkToast)).toBeVisible();
        // The bar's own Undo is checked for presence and never clicked.
        await expect(crop.selectionUndoButton, 'the selection bar offers Undo after a bulk delete').toBeVisible();
        await crop.filterToStem(run.stem);
        await crop.expectTotal(run.names.length - expected.batchSize, 'only A remains');
        // The bin grid is virtualised, so each row is scrolled to from its index in the bin before it is checked.
        await deletedRecords.gotoIndex();
        await deletedRecords.openEntity(expected.deletedRecordsLabel, expected.deletedPlural);
        for (const name of [cropB, cropC, cropD]) {
            await deletedRecords.revealRow(expected.deletedPlural, name, await deletedCropIndex(api, cropIdOf(run, name)));
            await expect(deletedRecords.deletedRow(expected.deletedPlural, name), `'${name}' must be in the recycle bin`).toBeVisible();
        }
        await deletedRecords.backToList(expected.deletedRecordsLabel);
        const batch = await findOwnBatch(run, api, head);

        // Catalog step 3: recover the batch from Reverse Multi Delete, on this run's own batch only.
        await bulkDeleteHistory.goto();
        const row = bulkDeleteHistory.batchRow(batch, expected.recordType);
        await expect(row, 'exactly one history row matches the own batch').toHaveCount(1);
        await expect(bulkDeleteHistory.cell(row, 'performedBy')).toHaveText(expected.performedBy);
        await expect(bulkDeleteHistory.cell(row, 'recordType')).toHaveText(expected.recordType);
        await expect(bulkDeleteHistory.cell(row, 'field')).toHaveText(expected.field);
        await expect(bulkDeleteHistory.cell(row, 'records')).toHaveText(String(expected.batchSize));
        await expect(bulkDeleteHistory.cell(row, 'status'), 'the batch starts Active').toHaveText(expected.statusBefore);
        const dialogText = await bulkDeleteHistory.undoBatch(batch, expected.recordType);
        expect(dialogText, 'the undo dialog states how many records it restores').toContain(expected.undoDialogText);
        await expect(crop.successToast(expected.undoneToast)).toBeVisible();
        await expect(bulkDeleteHistory.cell(row, 'status'), 'the batch is now Undone').toHaveText(expected.statusAfter);
        await expect(bulkDeleteHistory.undoButton(row), 'an undone batch offers no Undo').toBeHidden();

        // Verify (WEBPET-3803): the list is stale until a reload, so the count is asserted only after one.
        await crop.gotoList();
        await crop.filterToStem(run.stem);
        await testInfo.attach('own-rows-before-reload', {
            body: String(await crop.ownRows(run.stem).count()),
            contentType: 'text/plain',
        });
        await crop.reloadList();
        await crop.filterToStem(run.stem);
        await crop.expectTotal(run.names.length, 'A–D all back after reload');
        await run.cleanup();
    });

});
