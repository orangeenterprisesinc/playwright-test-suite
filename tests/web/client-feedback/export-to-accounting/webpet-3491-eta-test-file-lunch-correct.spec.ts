/**
 * WEBPET-3491 — Export to Accounting ▸ Test File: a zero-net lunch card counts as Correct and the analyze log shows the Totals section.
 * Data: src/data/client-feedback/webpet-3491-eta-test-file-lunch-correct.json · Plan: test-plans/client-feedback/webpet-3491-eta-test-file-lunch-correct.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { EtaTestFileLunchCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { designateMealJob, ensureCfMealJob, prepareCfRun, seedCrewDay, transferCrewDay, withCrewEta } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3491 · Export to Accounting: Test File counts the lunch card as correct', { tag: ['@ClientFeedback', '@WEBPET-3491'] }, () => {
    test('The Payroll Test File analyze log counts a zero-net lunch card as correct and shows the Totals section', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3491' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(EtaTestFileLunchCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const sheet = pages.exportToAccounting.testFile;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: CF MEAL JOB is the tenant's Meal Job (su has none; the ticket's card only exists with one), then the crew's day
        //    with a zero-net card on it, seeded on screen and transferred.
        const run = await prepareCfRun(s, deps);
        const meal = await designateMealJob(run, deps, await ensureCfMealJob(run, deps));
        const seed = await seedCrewDay(run, deps, s.seed);
        await transferCrewDay(run, deps, seed, s.expected.jobCards);

        await withCrewEta(run, deps, async () => {
            // 1. Test File: the results alert counts both cards as correct, and the sheet lists no meal-job failure.
            await sheet.open();
            expect(await sheet.resultsCounts(), 'Analyze Results counts').toEqual({ correct: s.expected.correct, incorrect: s.expected.incorrect });
            for (const failure of await sheet.failureTexts()) {
                expect(failure, 'the sheet lists no meal-job exception').not.toContain(s.expected.absentException);
            }

            // 2. Yes downloads the analyze log: no meal-job exception, the lunch card under Correct, and every section.
            const log = await sheet.saveLog(testInfo.outputPath('webpet-3491-analyze-log.txt'));
            expect(log.text, 'the log has no meal-job exception').not.toContain(s.expected.absentException);
            expect(log.text, 'the log has a correct-cards section').toContain(s.expected.correctSection);
            expect(log.text.slice(log.text.indexOf(s.expected.correctSection)), 'the lunch card is listed as correct').toMatch(new RegExp(s.expected.lunchLine));
            for (const section of s.expected.sections) {
                // The log is an HTML page: each label is a whole element (<th>Job-cards</th>, the Totals heading).
                expect(log.text, `the log has a ${section} section`).toMatch(new RegExp(`>\\s*${section}\\s*<`));
            }

            // 3. Close.
            await sheet.close();
        });

        // 4. Put the shared Meal Job preference back on screen (the cleanup PUT is only the backstop).
        await meal.restore();
    });
});
