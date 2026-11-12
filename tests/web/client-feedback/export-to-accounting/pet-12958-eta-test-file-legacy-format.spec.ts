/**
 * PET-12958 — Export to Accounting: the Payroll Test File download matches legacy (file name, .txt, CRLF line endings, rows grouped by employee).
 * Data: src/data/client-feedback/pet-12958-eta-test-file-legacy-format.json · Plan: test-plans/client-feedback/pet-12958-eta-test-file-legacy-format.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EtaTestFileLegacyCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay, transferCrewDay, withCrewEta } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('PET-12958 · Export to Accounting: Test File download matches legacy', { tag: ['@ClientFeedback', '@PET-12958'] }, () => {
    test('The Payroll Test File download matches legacy: file name, extension and CRLF line endings', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'PET-12958' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(EtaTestFileLegacyCaseSchema, testInfo);
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

            // 2. The legacy file name with the .txt extension, and the record count.
            await expect(sheet.fileName).toHaveText(new RegExp(s.expected.fileName));
            await expect(sheet.recordsWritten).toHaveText(s.expected.recordsWritten);
            const shownName = (await sheet.fileName.innerText()).trim();

            // 3. Download: CRLF throughout, fixed-width rows, one per record.
            const file = await sheet.downloadFile(testInfo.outputPath('pet-12958-test-file.txt'));
            expect(file.suggestedFilename, 'the downloaded name is the one shown').toBe(shownName);
            expect(file.suggestedFilename, 'legacy name with the .txt extension').toMatch(new RegExp(s.expected.fileName));
            expect(file.content.length, 'the file has content').toBeGreaterThan(0);
            expect(file.content.endsWith('\r\n'), 'the last line ends with CRLF').toBe(true);
            expect(/(?<!\r)\n/.test(file.content), 'no bare LF').toBe(false);
            expect(/\r(?!\n)/.test(file.content), 'no bare CR').toBe(false);

            const lines = file.content.split('\r\n').slice(0, -1);
            const written = Number(/^\d+/.exec(s.expected.recordsWritten)?.[0]);
            expect(lines, 'one line per record written').toHaveLength(written);
            lines.forEach((line, i) => expect(line, `row ${i + 1} length`).toHaveLength(s.expected.lineLength));

            const { start, length } = s.expected.employeeIdColumn;
            const keys = lines.map((line) => line.slice(start, start + length));
            expect(new Set(keys).size, 'both employees are in the file').toBe(s.expected.employees);
            // Row order is not asserted: #1559's legacy order fix covers DataTech only; su writes Famous 120, whose
            // piece-grid order web-pet left as a follow-up (measured 2026-11-12: ONE, TWO, ONE, TWO).

            // 4. Close: Test File changed nothing.
            await sheet.close();
            expect(await eta.counter('pending'), 'Ready').toBe(s.expected.jobCards);
        });
    });
});
