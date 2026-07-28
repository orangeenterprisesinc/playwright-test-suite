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
import { runSql } from '../../src/utils/db/sqlClient';
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
    await usersPage.fillPermissions(user);
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

/**
 * Find a user the way the recording does — type the name into the grid's Name
 * filter — and assert the filtered grid shows exactly that one user, with the
 * details it was created with.
 *
 * Searching by filter rather than scanning the full list keeps the assertion
 * independent of how many other users exist, so it holds whatever state the
 * database is in.
 */
async function expectUserListed(usersPage: UsersPage, user: NewUserData): Promise<void> {
    await usersPage.filterByName(user.name);

    // The filter narrows the grid to this user alone: one matching row, and the
    // grid's own "Total N rows" footer agrees.
    const row = usersPage.userRow(user.name);
    await expect(row).toHaveCount(1);
    await expect.poll(() => usersPage.totalRowCount()).toBe(1);

    await expect(row).toContainText(user.initials);
    await expect(row).toContainText(user.role);
    await expect(row).toContainText(user.email);
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

    // Hard-delete (Deleted=1) a user in the client DB — a true delete that frees
    // the Name/Initials/Email. The Users screen reads from this DB, so the user
    // also disappears from the list. Used both as the explicit delete step in
    // the end-to-end test and as the afterEach safety-net cleanup.
    //
    // The name is bound as @name rather than interpolated: sqlClient binds it as
    // a real parameter on the driver path and escapes it on the sqlcmd path.
    async function hardDeleteUser(name: string): Promise<void> {
        await runSql(
            `USE [${clientDb}]; SET NOCOUNT ON; ` +
            `UPDATE dbo.Users SET Deleted = 1 ` +
            `WHERE Name LIKE @name AND Deleted = 0;`,
            name,
            { name },
        );
    }

    test.afterEach(async () => {
        while (createdUsers.length) {
            await hardDeleteUser(createdUsers.pop()!.name);
        }
    });

    test('[User Setup] End-to-end: create a user, verify it in the Users list, edit it, then delete it.', {
        tag: ['@UI', '@E2E', '@Smoke', '@Local'],
        annotation: { type: 'testCaseId', description: 'USR-000' },
    }, async ({ usersPage }) => {
        // ── Create a new user with all fields (as in the reference video) ──
        // createUser walks the real sidebar menu (File ▸ Administration ▸ Users)
        // and fills General, Permissions and Personal Info, so the recording
        // captures the same workflow as the video.
        const user = await createUser(usersPage, makeUser({
            role: userData.defaults.all_fields_role,
            firstName: userData.personal_info.first_name,
            middleName: userData.personal_info.middle_name,
            lastName: userData.personal_info.last_name,
            title: userData.personal_info.title,
            additionalAccess: userData.permissions.additional_access,
            accessToReverse: userData.defaults.access_to_reverse,
        }));
        createdUsers.push(user); // afterEach safety net if a later step fails
        await expect(usersPage.userCreatedToast).toBeVisible();

        // ── Verify the new user appears in the Users list ───────────
        await usersPage.gotoUsersList();
        await expectUserListed(usersPage, user);

        // ── Open Edit and confirm the form loads the created user's info ──
        await usersPage.openEditUser(user.name);
        await expect(usersPage.nameInput).toHaveValue(user.name);

        // ── Delete the new user and confirm it's gone from the list ──
        // PET Tiger has no UI delete, so removal is done in SQL; the user then
        // disappears from the list (which reads the client DB).
        await hardDeleteUser(user.name);
        createdUsers.splice(createdUsers.indexOf(user), 1); // already removed
        await usersPage.expectAbsentFromList(user.name);
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
            additionalAccess: userData.permissions.additional_access,
            accessToReverse: userData.defaults.access_to_reverse,
        }));
        createdUsers.push(user);

        // Success feedback right after saving.
        await expect(usersPage.userCreatedToast).toBeVisible();

        // The new user is listed with the expected details.
        await usersPage.gotoUsersList();
        await expectUserListed(usersPage, user);
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
        await expectUserListed(usersPage, user);
    });

    test('[User Setup] Verify that every Role option is selectable and a user can be created with a non-administrator role.', {
        tag: ['@UI', '@Local'],
        annotation: { type: 'testCaseId', description: 'USR-003' },
    }, async ({ usersPage }) => {
        await usersPage.gotoUsersList();
        await usersPage.openNewUserForm();

        // Exactly the documented Role options, in order, and every one of them
        // selectable. Asserting the whole list at once also catches an option
        // that was added, removed or reordered — which a per-option visibility
        // loop cannot.
        await usersPage.openRoleDropdown();
        await expect(usersPage.roleOptions).toHaveText(userData.roles);
        for (const role of userData.roles) {
            await expect(usersPage.roleOption(role)).toBeEnabled();
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
        await expectUserListed(usersPage, user);
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
        await expect(page).toHaveURL(/\/settings\/users\/new(\?|$)/);
    });

});
