/**
 * WEBPET-3826 — Input ▸ Time In: "Consecutive Missing Work Days" takes its parameters and uses the Alias Set captions.
 * Data: src/data/client-feedback/webpet-3826-time-in-missing-work-days.json · Plan: test-plans/client-feedback/webpet-3826-time-in-missing-work-days.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TimeInMissingDaysCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { cfDay, mintAliasSetName, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';
import { readPdfText } from '@utils/pdf/pdfText';

test.describe('WEBPET-3826 · Time In: Consecutive Missing Work Days', { tag: ['@ClientFeedback', '@WEBPET-3826'] }, () => {
    test('Time In: Consecutive Missing Work Days takes its parameters and uses the Alias Set captions', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3826' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TimeInMissingDaysCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const list = pages.timeInList;
        const { report } = list;
        const deps = { sessionApi, testInfo, pages };
        const captions = Object.values(s.aliasSet.captions);

        // 0. Arrange: the alias set's name (teardown registered first), the crew's fixture rows, its day of time cards.
        const aliasName = mintAliasSetName(deps, s.ticket);
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);
        // ONE keeps working while TWO, who worked earlier, misses the next three crew work days.
        for (const [i, extra] of s.extraCrews.entries()) await seedCrewDay(run, deps, extra.seed, run.extra[i]);

        // 1. Setup > Alias Set: a Windows set with captions for Crew, Employee and Export Identifier.
        await pages.aliasSet.createWindowsSet(aliasName, s.aliasSet.captions);

        // 2. Input > Time In loaded over the seeded days (Report stays disabled until the list has loaded), Report, choose the report.
        //    The TC's blank Date range is the report's own parameter, left untouched below.
        await list.openFromMenu();
        await list.applyRange(cfDay(s.listRange.fromOffset), cfDay(s.listRange.toOffset), '00:00', '23:59');
        await report.open();
        await report.selectReport(s.expected.title);

        // 3. Last Work Date a past day, Allowed Missing Days 2; the Alias Set parameter is there and defaults to (none).
        await report.paramInput(s.params.lastWorkDate.id).fill(cfDay(s.lastWorkOffset));
        await report.paramInput(s.params.allowed.id).fill(s.params.allowed.value);
        await expect(report.paramSelect(s.params.aliasLabel), 'Alias Set defaults to (none)').toHaveText(s.params.none);

        // 4. PDF: title, allowed-days line, dated columns, the Attendence row; no alias captions.
        const first = await report.run('pdf', testInfo.outputPath('webpet-3826-no-alias.pdf'));
        expect(first.status, 'POST /reports/run').toBe(200);
        const plain = await readPdfText(first.savedPath);
        expect(plain, 'the report title').toContain(s.expected.title);
        expect(plain, 'the allowed-days line').toContain(s.expected.allowedLine);
        expect(plain, 'a dated column').toMatch(new RegExp(s.expected.dateColumnPattern));
        expect(plain, 'the Attendence row').toMatch(new RegExp(s.expected.attendancePattern));
        const absent = run.employees[s.expected.absentEmployee === 'one' ? 0 : 1].name;
        expect(plain, `${absent} is listed for missing more than the allowed days`).toContain(absent);
        for (const caption of captions) expect(plain, `no alias caption '${caption}' without an Alias Set`).not.toContain(caption);

        // 5. Report again (it keeps the report and answers), pick the alias set, PDF: headings use its captions.
        await report.open();
        await report.setParam(s.params.aliasLabel, aliasName);
        const second = await report.run('pdf', testInfo.outputPath('webpet-3826-alias.pdf'));
        expect(second.status, 'POST /reports/run with the alias set').toBe(200);
        const aliased = await readPdfText(second.savedPath);
        for (const caption of captions) expect(aliased, `the heading uses the caption '${caption}'`).toContain(caption);
    });
});
