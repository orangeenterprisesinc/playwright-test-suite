/**
 * WEBPET-3464 — Export to Accounting: the export file can be renamed before it is saved.
 * Data: src/data/client-feedback/webpet-3464-eta-rename-before-save.json · Plan: test-plans/client-feedback/webpet-3464-eta-rename-before-save.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EtaRenameBeforeSaveCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay, transferCrewDay, withCrewEta } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3464 · Export to Accounting: rename the export file before saving', { tag: ['@ClientFeedback', '@WEBPET-3464'] }, () => {
    test('After Export on Export to Accounting the user can rename the export file before saving it', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3464' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(EtaRenameBeforeSaveCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const eta = pages.exportToAccounting;
        const dialog = eta.saveDialog;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's day seeded on screen and transferred (teardown deletes the own job cards and time cards by id).
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);
        await transferCrewDay(run, deps, seed, s.expected.jobCards);

        await withCrewEta(run, deps, async (track) => {
            const downloads = dialog.countDownloads();
            try {
                // 1. Export up to the Save export file dialog; the stand-in answers every save-window request with Cancel.
                await dialog.armPickerStandIn();
                const { offered } = await eta.openSaveDialog({ expectedCount: s.expected.jobCards, crew: run.crew.name, onRun: track });
                expect(offered, 'Export offers the save window once, with the default name').toHaveLength(1);
                expect(offered[0]).toMatch(new RegExp(s.expected.fileName));
                await expect(dialog.title).toHaveText(s.expected.title);
                await expect(dialog.fileNameInput, 'the default name').toHaveValue(offered[0]);
                await expect(dialog.folderLine).toHaveText(new RegExp(s.expected.folderLine));
                await expect(dialog.saveButton).toHaveText(s.expected.saveAsLabel);

                // 2. Rename and Save As: the save window is offered the new name; its Cancel leaves the dialog usable.
                await dialog.rename(s.expected.newName);
                expect(await dialog.saveAsCancelled(), 'the save window is offered the changed name').toBe(s.expected.newName);
                await expect(dialog.root, 'Cancel keeps the dialog open').toBeVisible();
                await expect(dialog.fileNameInput).toHaveValue(s.expected.newName);
                await expect(dialog.saveButton).toBeEnabled();
                await expect(dialog.alerts, 'no save failure').toHaveCount(0);
                expect(downloads.count(), 'no file is downloaded automatically').toBe(0);

                // 3. Discard: nothing is exported.
                await dialog.discard(s.expected.discardConfirm, s.expected.discardWarning);
            } finally {
                downloads.stop();
            }

            // 4. Proof on screen: after Refresh the own cards are still Ready.
            await eta.refreshCandidates(track);
            expect(await eta.counter('pending'), 'Ready').toBe(s.expected.jobCards);
            for (const row of await eta.candidates()) expect(row.status, `${row.employee} is not exported`).toBe(s.expected.candidateStatus);
        });
    });
});
