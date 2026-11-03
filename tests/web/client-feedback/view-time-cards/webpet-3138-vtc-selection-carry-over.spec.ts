/**
 * WEBPET-3138 — View ▸ Time Cards keeps the earlier filter on return, waits for Apply Filter, and the top section can be hidden.
 * Data: src/data/client-feedback/webpet-3138-vtc-selection-carry-over.json · Plan: test-plans/client-feedback/webpet-3138-vtc-selection-carry-over.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { VtcCarryOverCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { prepareCfRun, seedCrewDay } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3138 · View Time Cards: the selection carries over', { tag: ['@ClientFeedback', '@WEBPET-3138'] }, () => {
    test('the screen keeps the earlier filter when you come back, waits for Apply Filter, and the top section can be hidden', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3138' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(VtcCarryOverCaseSchema, testInfo);
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

        // 2. Hide the top section, then show it again.
        await view.setTopSection(false);
        await expect(view.topStripToggle, 'the toggle offers to show the section').toHaveText(s.expected.showLabel);
        await expect(view.topStrip, 'the legend and pickers are gone').toBeHidden();
        await expect(view.crewPicker, 'the Work Crew picker is gone').toBeHidden();
        await view.setTopSection(true);
        await expect(view.topStripToggle, 'the toggle offers to hide the section').toHaveText(s.expected.hideLabel);
        await expect(view.topStrip, 'the legend is back').toBeVisible();
        await expect(view.crewPicker, 'the Work Crew picker is back').toBeVisible();

        // 3. Leave through View > Job Cards and come back from the menu.
        await pages.viewJobCards.openFromMenu();
        const net = view.trackFilterRequests();
        await view.openFromMenu();
        await view.settle();

        // 4. The selection is restored but nothing is loaded until Apply Filter.
        await view.expectScopedTo(run.day);
        await expect(view.criterionLine('workCrew'), 'the Time Card Crew criterion is restored').toHaveText(s.expected.criterionLine);
        await expect(view.emptyState, 'the grid is empty until Apply Filter').toBeVisible();
        await expect(view.reportButton, 'Report is disabled before the filter loads').toBeDisabled();
        expect(net.count(), 'no time-cards request before Apply Filter').toBe(0);

        // 5. Apply Filter loads the crew-day.
        await view.applyFilter();
        net.stop();
        expect(await view.totalRows(), 'Apply Filter loads the own cards').toBe(s.expected.rows);
        testInfo.annotations.push({ type: 'network-evidence', description: `GET time-cards requests before Apply Filter: 0; after: ${net.count()}` });

        // 6. The Columns picker lists the columns; one is hidden and shown again (the layout is per user and server-side).
        const picker = await view.cardGrid.openColumnsPicker();
        for (const column of s.expected.pickerColumns) {
            await expect(picker.getByRole('checkbox', { name: column, exact: true }), `${column} is ticked in the picker`).toBeChecked();
        }
        try {
            await view.cardGrid.toggleColumn(s.expected.toggleColumn, false);
        } finally {
            await view.cardGrid.toggleColumn(s.expected.toggleColumn, true);
        }
    });
});
