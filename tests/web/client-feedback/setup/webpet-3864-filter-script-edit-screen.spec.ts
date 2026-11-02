/**
 * WEBPET-3864 — Edit Filter Script matches Legacy: Screen label, script type name, read-only fields, user assignment. Read only.
 * Data: src/data/client-feedback/webpet-3864-filter-script-edit-screen.json · Plan: test-plans/client-feedback/webpet-3864-filter-script-edit-screen.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { FilterScriptEditCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';

test.describe('WEBPET-3864 · Scripts: Edit Filter Script screen', { tag: ['@ClientFeedback', '@WEBPET-3864'] }, () => {
    test('The Edit Filter Script screen matches Legacy: Screen label, script type name, read-only fields, user assignment', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3864' }],
    }, async ({ pages }, testInfo) => {
        const s = await loadScenario(FilterScriptEditCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const scripts = pages.filterScripts;

        // 1-2. File > Administration > Setup > Scripts from the menu; open the script.
        await scripts.gotoList();
        await scripts.openScript(s.script);

        // 3. Screen and Script Type show names and are locked.
        await expect(scripts.fieldLabel(s.expected.screenLabel), 'the field is labelled Screen').toBeVisible();
        await expect(scripts.screenInput).toHaveValue(s.expected.screen);
        await expect(scripts.screenInput, 'Screen is locked').not.toBeEditable();
        await expect(scripts.scriptTypeInput, 'Script Type shows a name, not a number').toHaveValue(s.expected.scriptType);
        await expect(scripts.scriptTypeInput, 'Script Type is locked').not.toBeEditable();

        // 4. Description is read-only; Execute Script is offered; no Table field.
        await expect(scripts.descriptionInput).not.toHaveValue('');
        await expect(scripts.descriptionInput, 'Description is read-only').not.toBeEditable();
        await expect(scripts.executeScriptButton, 'Execute Script is available').toBeVisible();
        await expect(scripts.fieldLabel(s.expected.absentField), 'no Table field').toHaveCount(0);

        // 5. Report Viewer Users: Add Users (Select users...) and Empty.
        await expect(scripts.usersHeading).toBeVisible();
        await expect(scripts.addUsersPicker).toContainText(s.expected.addUsersPlaceholder);
        await expect(scripts.emptyUsersButton, 'Empty is offered').toBeVisible();

        // 6. Leave without saving.
        await scripts.leaveWithoutSaving();
    });
});
