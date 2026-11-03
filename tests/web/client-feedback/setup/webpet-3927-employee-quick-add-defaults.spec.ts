/**
 * WEBPET-3927 — Employee Add ▸ Quick has Name, Middle, Export Identifier and Time Card Defaults, and saves them.
 * Data: src/data/client-feedback/webpet-3927-employee-quick-add-defaults.json · Plan: test-plans/client-feedback/webpet-3927-employee-quick-add-defaults.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { QuickAddDefaultsCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ensureCfTimeCardDefaults, mintQuickAddEmployee } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3927 · Employee Add Quick: Middle, Export Identifier and Time Card Defaults', { tag: ['@ClientFeedback', '@WEBPET-3927'] }, () => {
    test('Employee Add > Quick has Name, Middle, Export Identifier and Time Card Defaults, and saves them', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3927' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(QuickAddDefaultsCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const deps = { sessionApi, testInfo, pages };
        const quick = pages.employeeQuickAdd;
        const employees = pages.employee;

        // 0. Arrange: CF RANCH, CF FIELD, CF JOB; mint the employee's names (teardown registered before the save).
        const defaults = await ensureCfTimeCardDefaults(deps);
        const who = mintQuickAddEmployee(deps, s.ticket);

        // 1. Employee Add > Quick from the menu: the Employee fields and the Time Card Defaults section.
        await quick.open();
        const labels = await quick.formLabels();
        for (const label of s.expected.labels) expect(labels, `the Quick form shows ${label}`).toContain(label);
        await expect(quick.section(s.expected.section), 'the Time Card Defaults section').toBeVisible();

        // 2-3. Names, Middle, Export Identifier and the three defaults; the pre-filled crew is cleared first.
        await quick.clearCrew();
        await quick.fill({
            name: who.name,
            firstName: s.employee.firstName,
            lastName: who.lastName,
            middle: s.employee.middle,
            exportIdentifier: who.lastName,
            defaultRanch: defaults.ranch.name,
            defaultField: defaults.field.name,
            defaultJob: defaults.job.name,
        });

        // 4. Save employee: the banner names the new employee.
        await quick.save(who.name);
        await expect(quick.banner, 'the banner names the new employee').toContainText(`${who.name} ${s.expected.bannerSuffix}`);

        // 5. Open record: the same Middle, Export Identifier and defaults.
        await quick.openRecord();
        await expect(employees.nameInput, 'the opened record is the new employee').toHaveValue(who.name, { timeout: 30_000 });
        expect(await employees.readQuickAddFields(), 'the record keeps what Quick Add saved').toEqual({
            middle: s.employee.middle,
            exportIdentifier: who.lastName,
            defaultRanch: defaults.ranch.name,
            defaultField: defaults.field.name,
            defaultJob: defaults.job.name,
            alwaysUseDefaultJob: s.expected.alwaysUseDefaultJob,
        });

        // 6. Delete the employee on screen (soft delete; the name stays reserved, WEBPET-1798).
        await employees.deleteOpenRecord(who.name);
    });
});
