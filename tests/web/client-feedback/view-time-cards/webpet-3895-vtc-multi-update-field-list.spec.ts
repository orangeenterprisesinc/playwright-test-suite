/**
 * WEBPET-3895 — View ▸ Time Cards: the Multi Update field list includes the fields Windows PET offers.
 * Data: src/data/client-feedback/webpet-3895-vtc-multi-update-field-list.json · Plan: test-plans/client-feedback/webpet-3895-vtc-multi-update-field-list.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VtcMuFieldsCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ownCard, prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3895 · View Time Cards: Multi Update field list', { tag: ['@ClientFeedback', '@WEBPET-3895'] }, () => {
    test('the Multi Update field list on View > Time Cards includes the fields Windows PET offers', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3895' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(VtcMuFieldsCaseSchema, testInfo);
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

        // 2. Tick two own rows and open Multi Update: the button counts them.
        const refs = [ownCard(run, 'one', 'timeIn').reference, ownCard(run, 'one', 'timeOut').reference];
        await view.cardGrid.selectRows(refs);
        await view.openMultiUpdate();
        await expect(view.updateRecordsButton(refs.length), 'the button counts the ticked rows').toHaveText(s.expected.updateLabel);

        // 3. The Field list offers every field Windows PET offers. Nothing is updated.
        const labels = await view.muFieldLabels();
        for (const field of s.expected.fields) {
            expect(labels, `the Field list offers ${field}`).toContain(field);
        }
    });
});
