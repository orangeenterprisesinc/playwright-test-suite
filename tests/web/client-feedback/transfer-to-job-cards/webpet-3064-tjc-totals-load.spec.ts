/**
 * WEBPET-3064 — Transfer to Job Cards: the totals line took 3+ minutes and then failed with "Totals couldn't be loaded".
 * Data: src/data/client-feedback/webpet-3064-tjc-totals-load.json · Plan: test-plans/client-feedback/webpet-3064-tjc-totals-load.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcTotalsLoadCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

const NUMBER_SHAPE = /^\d[\d,]*(\.\d+)?$/;

test.describe('WEBPET-3064 · Transfer to Job Cards: totals line loads', { tag: ['@ClientFeedback', '@WEBPET-3064'] }, () => {
    test('the totals line loads Gross, Net, Meals, Pieces and Employees for an analyzed crew day', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3064' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(TjcTotalsLoadCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then its day of time cards seeded on screen.
        const run = await prepareCfRun(s, deps);
        const seed = await seedCrewDay(run, deps, s.seed);

        // 1. Open Transfer to Job Cards from the left menu.
        await tjc.openFromMenu();

        // 2. Scope the date range to the fixture day.
        await tjc.scopeToDay(run.day);

        // 3. Scope Time Card Crew to the fixture crew.
        await tjc.scopeToTimeCardCrew(run.crew.name);

        // 4. Analyze; the analyze is scoped to the crew.
        const analyzed = await tjc.analyzeCandidates({ expected: seed.timeCardCounters.length });
        expect(analyzed.crewIds.length, 'the analyze is scoped to the crew').toBeGreaterThan(0);

        // 5. The totals line loads within the bound and shows no error.
        await expect(tjc.totalsCaption, 'the totals caption loads').toHaveText(s.expected.caption, { timeout: s.expected.loadWithinMs });
        await expect(tjc.totalsStrip, 'the totals line is no longer loading').not.toHaveAttribute('aria-busy', 'true');
        await expect(tjc.totalsUnavailable, 'no "Totals couldn\'t be loaded" message').toHaveCount(0);
        await expect(tjc.totalsStrip, 'the totals line carries no error text').not.toContainText(s.expected.unavailableText);

        // 6. Gross, Net, Meals, Pieces and Employees each show a number; Employees and Pieces are exact, Gross and Net are above zero.
        for (const label of s.expected.labels) {
            await expect(tjc.totalsValue(label), `${label} shows a number`).toHaveText(NUMBER_SHAPE);
        }
        for (const [label, value] of Object.entries(s.expected.exact)) {
            await expect(tjc.totalsValue(label), `${label} reads ${value}`).toHaveText(value);
        }
        for (const label of s.expected.positive) {
            await expect.poll(() => tjc.totalsNumber(label), { message: `${label} is above zero` }).toBeGreaterThan(0);
        }
        testInfo.annotations.push({ type: 'totals-evidence', description: await tjc.totalsStrip.innerText() });
    });
});
