/**
 * Journey A1 — User Setup.
 *
 * Authenticated flow (File ▸ Administration ▸ Users). These tests run logged
 * in via the shared `.auth/user.json` storage state, so there is no login flow
 * here.
 *
 * The PET Tiger UI has no delete-user action and soft-deletes users, so each
 * created user is removed directly in SQL (Deleted=1 in both the client and
 * master databases) after the test — a true delete that also frees the
 * Name/Initials/Email. Names/Initials/Emails are generated uniquely per run so
 * re-runs never collide; because the Initials field is capped at 3 characters
 * (and its "Already in use" rule is enforced on new users), createUser
 * regenerates the Initials and retries if a random value happens to already
 * exist.
 */
import { expect, test } from '../../src/fixtures/base.fixture';
import userData from '../../src/data/user-setup-data.json';
import { runSql, sqlLiteral } from '../../src/utils/db/sqlClient';
import { makeUser, randomInitials } from '../../src/utils/testData';
import { ConfigProperties, getConfigValue } from '../../src/enums/configProperties';
import type { NewUserData } from '../../src/pages/UsersPage';
import type { UsersPage } from '../../src/pages/UsersPage';

/**
 * Create a user through the New User form, retrying with a fresh Initials value
 * if the random one collides with an existing user. Returns the data actually
 * saved (Initials may have been regenerated).
 */
async function createUser(usersPage: UsersPage, base: NewUserData): Promise<NewUserData> {
    const user: NewUserData = { ...base };
    await usersPage.gotoUsersList();
    await usersPage.openNewUserForm();
    await usersPage.fillGeneral(user);
    await usersPage.fillPersonalInfo(user);

    let outcome = await usersPage.submit();
    for (let attempt = 0; outcome === 'duplicate-initials' && attempt < 5; attempt++) {
        user.initials = randomInitials();
        await usersPage.initialsInput.fill(user.initials);
        outcome = await usersPage.submit();
    }

    expect(outcome, 'user should be created with a unique Initials').toBe('created');
    return user;
}

test.describe('User Setup Tests', { tag: '@user-setup' }, () => {

    // Users created by a test, soft-deleted in SQL after it. PET Tiger has no
    // UI delete and soft-deletes (Deleted=1). We scope cleanup to the client
    // DB only (USE DelLlano) — the Users screen reads from there, so this
    // removes the user and frees its Name/Initials — and deliberately leave the
    // shared TigerMaster DB untouched. Emails are unique per run, so the
    // leftover global row never blocks re-creation. DB name comes from config;
    // sqlClient owns the connection. The query lives here on purpose, so it's
    // visible and debuggable per test.
    const createdUsers: NewUserData[] = [];
    const clientDb = getConfigValue(ConfigProperties.DB_CLIENT);

    test.afterEach(() => {
        while (createdUsers.length) {
            const user = createdUsers.pop()!;
            const name = sqlLiteral(user.name);
            runSql(
                `USE [${clientDb}]; SET NOCOUNT ON; ` +
                `UPDATE dbo.Users SET Deleted = 1 ` +
                `WHERE Name LIKE '${name}' AND Deleted = 0;`,
                user.name,
            );
        }
    });

    test('[User Setup] Verify that an administrator user can be created with all fields populated and appears in the Users list.', {
        tag: ['@UI', '@Smoke', '@Local'],
        annotation: { type: 'testCaseId', description: 'USR-001' },
    }, async ({ usersPage }) => {
        const user = await createUser(usersPage, makeUser({
            role: userData.defaults.all_fields_role,
            firstName: userData.personal_info.first_name,
            middleName: userData.personal_info.middle_name,
            lastName: userData.personal_info.last_name,
            title: userData.personal_info.title,
        }));
        createdUsers.push(user);

        // Success feedback right after saving.
        await expect(usersPage.userCreatedToast).toBeVisible();

        // The new user is listed with the expected details.
        await usersPage.gotoUsersList();
        await usersPage.filterByName(user.name);
        const row = usersPage.userRow(user.name);
        await expect(row).toBeVisible();
        await expect(row).toContainText(user.initials);
        await expect(row).toContainText(user.role);
        await expect(row).toContainText(user.email);
    });

    test('[User Setup] Verify that a user can be created with only the required fields.', {
        tag: ['@UI', '@Local'],
        annotation: { type: 'testCaseId', description: 'USR-002' },
    }, async ({ usersPage }) => {
        const user = await createUser(usersPage, makeUser({
            role: userData.defaults.required_only_role,
        }));
        createdUsers.push(user);

        await usersPage.gotoUsersList();
        await usersPage.filterByName(user.name);
        const row = usersPage.userRow(user.name);
        await expect(row).toBeVisible();
        await expect(row).toContainText(user.initials);
        await expect(row).toContainText(user.role);
        await expect(row).toContainText(user.email);
    });

    test('[User Setup] Verify that every Role option is selectable and a user can be created with a non-administrator role.', {
        tag: ['@UI', '@Local'],
        annotation: { type: 'testCaseId', description: 'USR-003' },
    }, async ({ usersPage }) => {
        await usersPage.gotoUsersList();
        await usersPage.openNewUserForm();

        // Every documented Role option is present and selectable.
        await usersPage.openRoleDropdown();
        for (const role of userData.roles) {
            await expect(usersPage.roleOption(role)).toBeVisible();
        }

        // Select a non-administrator role and create the user.
        const user = makeUser({ role: userData.defaults.creatable_role });
        await usersPage.roleOption(user.role).click();
        await usersPage.nameInput.fill(user.name);
        await usersPage.passwordInput.fill(user.password);
        await usersPage.initialsInput.fill(user.initials);
        await usersPage.emailInput.fill(user.email);

        let outcome = await usersPage.submit();
        for (let attempt = 0; outcome === 'duplicate-initials' && attempt < 5; attempt++) {
            user.initials = randomInitials();
            await usersPage.initialsInput.fill(user.initials);
            outcome = await usersPage.submit();
        }
        expect(outcome, 'user should be created with a unique Initials').toBe('created');
        createdUsers.push(user);

        await expect(usersPage.userCreatedToast).toBeVisible();

        await usersPage.gotoUsersList();
        await usersPage.filterByName(user.name);
        const row = usersPage.userRow(user.name);
        await expect(row).toBeVisible();
        await expect(row).toContainText(userData.defaults.creatable_role);
    });

    test('[User Setup] Verify that creating a user with an Initials value already in use is rejected.', {
        tag: ['@UI', '@Local', '@negative'],
        annotation: { type: 'testCaseId', description: 'USR-004' },
    }, async ({ page, usersPage }) => {
        // Seed a user so we have a known, in-use Initials value.
        const seed = await createUser(usersPage, makeUser({ role: userData.defaults.all_fields_role }));
        createdUsers.push(seed);

        // Attempt a second, different user reusing the seed's Initials.
        await usersPage.gotoUsersList();
        await usersPage.openNewUserForm();
        await usersPage.fillGeneral(makeUser({
            role: userData.defaults.required_only_role,
            initials: seed.initials,
        }));

        const outcome = await usersPage.submit();
        expect(outcome).toBe('duplicate-initials');
        await expect(usersPage.initialsAlreadyInUseError).toBeVisible();
        await expect(usersPage.errorSummaryButton).toBeVisible();
        await expect(usersPage.saveButton).toBeDisabled();
        await expect(page).toHaveURL(/\/settings\/users\/new$/);
    });

});
