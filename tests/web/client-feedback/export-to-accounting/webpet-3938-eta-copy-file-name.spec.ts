/**
 * WEBPET-3938 — Export to Accounting: a copy button beside the export file name copies it and shows 'Copied.'.
 * Data: src/data/client-feedback/webpet-3938-eta-copy-file-name.json · Plan: test-plans/client-feedback/webpet-3938-eta-copy-file-name.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EtaCopyFileNameCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay, transferCrewDay, withCrewEta } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3938 · Export to Accounting: copy the export file name', { tag: ['@ClientFeedback', '@WEBPET-3938'] }, () => {
    test("A copy button next to the export file name copies the name and shows 'Copied.'", {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3938' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(EtaCopyFileNameCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const eta = pages.exportToAccounting;
        const dialog = eta.saveDialog;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's day seeded on screen and transferred (teardown deletes the own job cards and time cards by id).
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);
        await transferCrewDay(run, deps, seed, s.expected.jobCards);

        await withCrewEta(run, deps, async (track) => {
            // 1. Export up to the Save export file dialog (the stand-in keeps the OS save window away).
            await dialog.grantClipboard();
            await dialog.armPickerStandIn();
            await eta.openSaveDialog({ expectedCount: s.expected.jobCards, crew: run.crew.name, onRun: track });
            const name = await dialog.fileName();
            expect(name, 'the dialog shows the export file name').toMatch(new RegExp(s.expected.fileName));

            // 2. An icon-only copy button beside the name copies it and says so.
            await expect(dialog.copyButton).toHaveAccessibleName(s.expected.copyLabel);
            expect(await dialog.copyIsIconOnly(), 'icon-only').toBe(true);
            expect(await dialog.copySitsBesideName(), 'beside the file name').toBe(true);
            await dialog.copyFileName();
            await expect(dialog.copiedToast(s.expected.copied)).toBeVisible({ timeout: 10_000 });
            expect(await dialog.readClipboard(), 'the clipboard holds the file name').toBe(name);

            // 3. Discard, then prove on screen that nothing was exported.
            await dialog.discard(s.expected.discardConfirm, s.expected.discardWarning);
            await eta.refreshCandidates(track);
            expect(await eta.counter('pending'), 'Ready').toBe(s.expected.jobCards);
            for (const row of await eta.candidates()) expect(row.status, `${row.employee} is not exported`).toBe(s.expected.candidateStatus);
        });
    });
});
