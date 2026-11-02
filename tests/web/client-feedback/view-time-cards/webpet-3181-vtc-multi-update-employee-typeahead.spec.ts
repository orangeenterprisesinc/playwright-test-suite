/**
 * WEBPET-3181 — View ▸ Time Cards Multi Update: typing in the Employee value box shows the typed text and finds matching employees.
 * Data: src/data/client-feedback/webpet-3181-vtc-multi-update-employee-typeahead.json · Plan: test-plans/client-feedback/webpet-3181-vtc-multi-update-employee-typeahead.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VtcMuEmployeeTypeCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ownCard, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3181 · View Time Cards: Multi Update employee typing', { tag: ['@ClientFeedback', '@WEBPET-3181'] }, () => {
    test('in View > Time Cards Multi Update, typing in the Employee value box shows the typed text and finds matching employees', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3181' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(VtcMuEmployeeTypeCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const view = pages.viewTimeCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows, then its day of time cards seeded on screen.
        const run = await prepareCfRun(s, deps);
        await seedCrewDay(run, deps, s.seed);

        // 1. Open View > Time Cards, scope the day and the Time Card Crew, apply.
        await view.openFromMenu();
        await view.scopeToDay(run.day);
        await view.scopeToTimeCardCrew(run.crew.name);
        await view.applyFilter();
        expect(await view.totalRows(), 'the crew-day loads its own cards').toBe(s.expected.rows);

        // 2. Tick two own rows, open Multi Update and choose the Employee field.
        await view.cardGrid.selectRows([ownCard(run, 'one', 'timeIn').reference, ownCard(run, 'one', 'timeOut').reference]);
        await view.openMultiUpdate();
        await view.chooseMuField(s.expected.field);

        // 3. Type into the Value box: the text stays and the matching employees are offered.
        await view.muEmployeeValue.click();
        await view.muEmployeeValue.pressSequentially(s.expected.typed);
        await expect(view.muEmployeeValue, 'the typed text stays in the box').toHaveValue(s.expected.typed);
        await expect.poll(() => view.muComboLabels(), { message: 'the list offers exactly the matching employees' }).toEqual(s.expected.options);
        await expect(view.textOnScreen(s.expected.notFound), 'no "No Employees Found"').toHaveCount(0);

        // 4. Close the list. Update Records is never clicked.
        await view.dismissPopup();
    });
});
