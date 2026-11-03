/**
 * WEBPET-3932 — Input ▸ Time In: the From/To filter takes a start date+time and an end date+time; Apply lists only Time Ins inside it.
 * Data: src/data/client-feedback/webpet-3932-time-in-date-time-range.json · Plan: test-plans/client-feedback/webpet-3932-time-in-date-time-range.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TimeInDateTimeRangeCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { cfDay, ownCard, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3932 · Time In: date and time range filter', { tag: ['@ClientFeedback', '@WEBPET-3932'] }, () => {
    test('The Time In filter takes a start date+time and end date+time and lists only Time Ins inside it', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3932' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(TimeInDateTimeRangeCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const deps = { sessionApi, testInfo, pages };
        const list = pages.timeInList;

        // 0. Arrange: CF CREW D's day seeded on screen, one Time In inside the window and one after it (teardown deletes them by id).
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);
        const inside = ownCard(run, s.expected.inside, 'timeIn');
        const outside = ownCard(run, s.expected.outside, 'timeIn');
        const from = cfDay(s.range.fromOffset);
        const lo = `${from}T${s.range.start}:00`;
        const hi = `${run.day}T${s.range.end}:59`;

        // 1. Input ▸ Time In from the menu.
        await list.openFromMenu();
        await expect(list.heading).toHaveText(s.expected.title);

        // 2. Start date+time and end date+time, Apply: the screen carries exactly that range.
        await list.applyRange(from, run.day, s.range.start, s.range.end);
        expect(list.appliedRange(), 'the applied range is the chosen dates and times').toEqual({ from: `${from}T${s.range.start}`, to: `${run.day}T${s.range.end}` });

        // 3. The own Time In inside the window is listed; the one after the end time is not.
        await expect(list.row(inside.reference), 'own Time In inside the range').toBeVisible({ timeout: 15_000 });
        await expect(list.row(outside.reference), 'own Time In after the end time').toHaveCount(0);

        // 4. Every row on screen is inside the range; the own row's parsed time calibrates the locale parse.
        const rows = await list.shownRows();
        expect(rows.length, 'below the grid virtualization threshold').toBeLessThanOrEqual(s.expected.maxRows);
        expect(rows.find((r) => r.reference === inside.reference)?.at, 'the own row reads its seeded time').toBe(`${run.day}T${s.expected.insideAt}:00`);
        for (const r of rows) expect(r.at >= lo && r.at <= hi, `${r.reference} (${r.shown}) is inside ${lo}..${hi}`).toBe(true);
    });
});
