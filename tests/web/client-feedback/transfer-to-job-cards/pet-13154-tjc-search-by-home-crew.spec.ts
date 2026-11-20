/**
 * PET-13154 — Transfer to Job Cards: Search by Employee Home Crew scopes the analyze to that crew's employees.
 * Data: src/data/client-feedback/pet-13154-tjc-search-by-home-crew.json · Plan: test-plans/client-feedback/pet-13154-tjc-search-by-home-crew.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcSearchByHomeCrewCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { fillTemplate, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('PET-13154 · Transfer to Job Cards: Search by Employee Home Crew', { tag: ['@ClientFeedback', '@PET-13154'] }, () => {
    test("Search by Employee Home Crew scopes the Transfer to Job Cards analyze to that crew's employees", {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'PET-13154' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TjcSearchByHomeCrewCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };
        const x = s.expected;

        // 0. Arrange: the crew's day, and a second crew (the control) on the same day.
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);
        await seedCrewDay(run, deps, s.extraCrews[0].seed, run.extra[0]);

        // 1. Open Transfer to Job Cards from the left menu.
        await tjc.openFromMenu();

        // 2. Scope the day.
        await tjc.scopeToDay(run.day);

        // 3. Search by offers Employee Home Crew.
        expect(await tjc.searchByOptions(), 'Search by offers Employee Home Crew').toContain(x.option);

        // 4. Search by Employee Home Crew, Match Selected, pick the crew.
        await tjc.scopeBySearch('homeCrew', run.crew.name);
        await expect(tjc.searchMatch, 'Match reads Selected').toHaveText(x.match);
        await expect(tjc.criterionSentence('homeCrew'), 'the criterion line names the crew').toHaveText(
            fillTemplate(x.sentenceTemplate, { crew: run.crew.name }),
        );

        // 5. Analyze with no Time Card Crew criterion.
        await tjc.analyzeCandidates({ expected: x.analyzed });

        // 6. Every row is an employee whose home crew is the picked one; the control crew's employees are excluded.
        const employeeColumn = await tjc.cardGrid.columnValues('Employee');
        const labelled = (names: string[]): RegExp => new RegExp(`(^|: )(${names.join('|')})$`);
        expect(employeeColumn, 'one row per analyzed time card').toHaveLength(x.analyzed);
        for (const value of employeeColumn) expect(value, `${value} is an employee of ${run.crew.name}`).toMatch(labelled(x.employees));
        expect(new Set(employeeColumn).size, "both of the crew's employees are listed").toBe(x.employees.length);
        for (const value of employeeColumn) expect(value, `${value} is not a control-crew employee`).not.toMatch(labelled(x.absent));

        // 7. The footer and totals count only those cards.
        await expect(tjc.gridCaption).toHaveText(x.caption);
        for (const [totalLabel, value] of Object.entries(x.totals)) {
            await expect.poll(() => tjc.totalsNumber(totalLabel), { message: `the ${totalLabel} total counts only the crew's cards` }).toBe(value);
        }
    });
});
