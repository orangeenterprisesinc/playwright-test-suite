/**
 * WEBPET-3931 — Export to Accounting: the Test File export file name follows the legacy PET + date/time format.
 * Data: src/data/client-feedback/webpet-3931-eta-test-file-name.json · Plan: test-plans/client-feedback/webpet-3931-eta-test-file-name.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EtaTestFileNameCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay, transferCrewDay, withCrewEta } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3931 · Export to Accounting: Test File name is PET + date and time', { tag: ['@ClientFeedback', '@WEBPET-3931'] }, () => {
    test('The default export file name on Export to Accounting follows the legacy format PET + date and time', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3931' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(EtaTestFileNameCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const eta = pages.exportToAccounting;
        const sheet = eta.testFile;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's day seeded on screen and transferred (teardown deletes the own job cards and time cards by id).
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);
        await transferCrewDay(run, deps, seed, s.expected.jobCards);

        await withCrewEta(run, deps, async () => {
            // 1. Test File: every own card is ready and a file is generated.
            await sheet.open();
            expect(await sheet.readSummary(), 'Test File summary').toEqual({ ready: s.expected.jobCards, cannotExport: 0 });
            await sheet.dismissResults();
            expect(await sheet.fileState(), 'an export file was generated').toBe('named');

            // 2. The name is PET + 17 digits + .txt, not the provider-date name; the record count is the own cards.
            await expect(sheet.fileName).toHaveText(new RegExp(s.expected.fileName));
            await expect(sheet.fileName, 'not the old provider-date name').not.toContainText(s.expected.legacyPrefix);
            await expect(sheet.recordsWritten).toHaveText(s.expected.recordsWritten);

            // 3. Close: Test File changed nothing.
            await sheet.close();
            await expect(eta.matchedCount).toHaveText(s.expected.matched);
            expect(await eta.counter('pending'), 'Ready').toBe(s.expected.jobCards);
        });
    });
});
