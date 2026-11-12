/**
 * WEBPET-3888 — Users ▸ New User: Shortcut and Alias Set work, and double-clicking Alias Set creates a new Alias Set. No user is saved.
 * Data: src/data/client-feedback/webpet-3888-user-shortcut-alias-set.json · Plan: test-plans/client-feedback/webpet-3888-user-shortcut-alias-set.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { UserAliasSetCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { mintAliasSetName } from '@utils/client-feedback/clientFeedbackFlow';
import { PickerComponent } from '@components/PickerComponent';

test.describe('WEBPET-3888 · Users: Shortcut and Alias Set', { tag: ['@ClientFeedback', '@WEBPET-3888'] }, () => {
    test('The User record has working Shortcut and Alias Set fields, and double-clicking Alias Set creates a new Alias Set', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3888' }],
    }, async ({ page, pages, sessionApi }, testInfo) => {
        const s = await loadScenario(UserAliasSetCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const users = pages.users;
        const dialog = users.aliasSetDialog;

        // 0. The alias set's name, with its by-name teardown registered before anything is saved.
        const name = mintAliasSetName({ sessionApi, testInfo, pages }, s.ticket);

        // 1. File > Administration > Users, New.
        await users.gotoUsersList();
        await users.openNewUserForm();

        // 2. Shortcut is shown and accepts the first value it offers.
        await expect(users.shortcutCombobox, 'Shortcut').toBeVisible();
        const offered = await users.shortcutOptions();
        expect(offered.length, 'Shortcut offers values').toBeGreaterThan(0);
        await users.pickShortcut(offered[0]);
        expect(await users.comboValue(users.shortcutCombobox), 'Shortcut holds the pick').toMatch(PickerComponent.labelPattern(offered[0]));

        // 3. Double-click Alias Set: the Add Alias Set form opens.
        await expect(users.aliasSetCombobox, 'Alias Set').toBeVisible();
        await users.openNewAliasSetByDoubleClick();
        await expect(dialog.root).toHaveAccessibleName(s.expected.dialogTitle);

        // 4. Its Alias Fields grid is shown and Alias Type is blank.
        await expect(dialog.fieldsHeader, 'the Alias Fields header').toBeVisible();
        expect(await dialog.aliasTypeIsBlank(), 'Alias Type starts blank').toBe(true);

        // 5. Windows fills the grid with the Alias Fields, sorted by Alias Field.
        await dialog.chooseAliasType(s.aliasType);
        const names = await dialog.aliasFieldNames(s.expected.aliasFieldColumn);
        expect(names, 'Alias Fields for Windows').toHaveLength(s.expected.aliasFields);
        expect(names, 'sorted by Alias Field').toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));

        // 6. Name and Save: the form closes and the new set is selected on the user.
        await dialog.nameInput.fill(name);
        await dialog.save();
        // The field fills a moment after the "Alias set created" toast, so read it until it settles.
        await expect.poll(() => users.comboValue(users.aliasSetCombobox), { message: 'the new Alias Set is selected' }).toMatch(PickerComponent.labelPattern(name));

        // 7. Discard the user: back on the Users list, nothing saved.
        await users.leaveWithoutSaving();
        await expect(page, 'back on the Users list').toHaveURL(/\/settings\/users(\?|$)/);
    });
});
