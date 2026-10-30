/**
 * WEBPET-2986 — Transfer to Job Cards: with Single select on, the arrow keys step the Work Crew and Employee filters.
 * Data: src/data/client-feedback/webpet-2986-tjc-single-select-stepping.json · Plan: test-plans/client-feedback/webpet-2986-tjc-single-select-stepping.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcSingleSelectCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-2986 · Transfer to Job Cards: Single select stepping', { tag: ['@ClientFeedback', '@WEBPET-2986'] }, () => {
    test('with Single select on, the arrow keys step the Work Crew and Employee filters through their values', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-2986' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(TjcSingleSelectCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: both crews' fixture rows, then each crew's day seeded on screen.
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);
        await seedCrewDay(run, deps, s.extraCrews[0].seed, run.extra[0]);

        // 1. Open Transfer to Job Cards, scope the day and both crews, analyze.
        await tjc.openFromMenu();
        await tjc.scopeToDay(run.day);
        await tjc.scopeToTimeCardCrews([run.crew.name, run.extra[0].crew.name]);
        await tjc.analyzeCandidates({ expected: s.expected.analyzed });
        await expect(tjc.totalsCaption, 'the analyzed count is shown').toHaveText(s.expected.analyzedCaption);

        // 2. The Single select switch is the first control of the filter row.
        const { single, crew, employee } = await tjc.filterControlBoxes();
        expect(single.x, 'Single select is left of the Work Crew filter').toBeLessThan(crew.x);
        expect(crew.x, 'the Work Crew filter is left of the Employee filter').toBeLessThan(employee.x);

        // 3. Turn Single select on.
        await tjc.setSingleSelect(true);

        // 4. For each filter: pick the first value, step down, step up, clear.
        for (const f of s.expected.filters) {
            const options = await tjc.gridFilterOptions(f.kind);
            expect(options.length, `${f.kind} offers at least two values`).toBeGreaterThanOrEqual(2);
            const [first, second] = options;
            const rowValues = async () => [...new Set(await tjc.cardGrid.columnValues(f.column))];

            await tjc.pickGridFilter(f.kind, first);
            await expect.poll(rowValues, { message: `${f.kind}: only "${first}" rows stay` }).toEqual([first]);

            await tjc.stepGridFilter(f.kind, 'ArrowDown');
            await expect(tjc.gridFilterValue(f.kind), `${f.kind}: ArrowDown moves to the next value`).toContainText(second);
            await expect.poll(rowValues, { message: `${f.kind}: only "${second}" rows stay` }).toEqual([second]);

            await tjc.stepGridFilter(f.kind, 'ArrowUp');
            await expect(tjc.gridFilterValue(f.kind), `${f.kind}: ArrowUp moves back`).toContainText(first);

            await tjc.clearGridFilter(f.kind);
            await expect(tjc.gridFilterValue(f.kind), `${f.kind}: clearing returns to all`).toContainText(f.allLabel);
            await expect(tjc.totalsCaption, `${f.kind}: every row is back`).toHaveText(s.expected.analyzedCaption);
        }
    });
});
