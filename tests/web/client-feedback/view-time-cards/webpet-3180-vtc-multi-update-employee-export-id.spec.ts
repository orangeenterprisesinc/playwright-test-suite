/**
 * WEBPET-3180 — View ▸ Time Cards Multi Update: the Employee list shows 'Export ID : Name' for each employee.
 * Data: src/data/client-feedback/webpet-3180-vtc-multi-update-employee-export-id.json · Plan: test-plans/client-feedback/webpet-3180-vtc-multi-update-employee-export-id.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VtcMuEmployeeLabelCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ownCard, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3180 · View Time Cards: Multi Update employee labels', { tag: ['@ClientFeedback', '@WEBPET-3180'] }, () => {
    test("the Multi Update employee list shows 'Export ID : Name' for each employee", {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3180' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(VtcMuEmployeeLabelCaseSchema, testInfo);
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

        // 2. Tick two own rows, open Multi Update, choose the Employee field and open the Value list.
        await view.cardGrid.selectRows([ownCard(run, 'one', 'timeIn').reference, ownCard(run, 'one', 'timeOut').reference]);
        await view.openMultiUpdate();
        await view.chooseMuField(s.expected.field);
        await view.muEmployeeValue.click();
        const labels = await view.muComboLabels();

        // 3. Every option reads "<Export ID> : <Name>", never the bare name.
        expect(labels.length, 'the list offers more than the own employees').toBeGreaterThan(s.expected.ownLabels.length);
        for (const label of labels) {
            expect(label, `"${label}" reads Export ID : Name`).toMatch(new RegExp(s.expected.labelPattern));
        }
        for (const own of s.expected.ownLabels) {
            expect(labels, `the list offers ${own}`).toContain(own);
        }
        expect(labels, 'the bare employee name is not offered').not.toContain(run.employees[0].name);

        // 4. Close the list. Nothing is updated.
        await view.dismissPopup();
    });
});
