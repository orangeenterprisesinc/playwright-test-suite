/**
 * Catalog workflow **A1 — License, serial number, and user setup**, steps 4-5:
 * create office users with roles and per-user permissions, and verify login.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A1 |
 * | Plan | `test-plans/journey-a/a01-user-setup.md` |
 * | Recording | `docs/media/journey-a/a01-user-setup.mp4` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A1-001`…`A1-006` |
 *
 * Runs logged in via `.auth/user.json`; the login half is
 * tests/web/system/login-module.spec.ts.
 *
 * PET Tiger has no delete-user action, so the `cleanup` fixture soft-deletes
 * (`Deleted = 1`), which also frees the Name/Initials/Email.
 */
import { expect, test } from '@fixtures/base.fixture';
import { userSetupData as userData } from '@data/static/journey-a/userSetupData';
import { makeUser } from '@data/generated';

// The describe title becomes the Allure "story".
test.describe('A1 · License, serial number, and user setup', { tag: ['@JourneyA', '@A1'] }, () => {

    // Cleanup is scoped to the client DB and deliberately leaves the shared
    // TigerMaster row: emails are unique per run, so it never blocks re-creation.

    test('[User Setup] End-to-end: create a user, verify it in the Users list, edit it, then delete it.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A1-001' },
            { type: 'requirement', description: 'A1-R1|A1-R2|A1-R7|A1-R8' },
        ],
    }, async ({ usersPage, cleanup }) => {
        // ── Create a new user with all fields ──
        const user = await usersPage.createUser(makeUser({
            role: userData.defaults.all_fields_role,
            firstName: userData.personal_info.first_name,
            middleName: userData.personal_info.middle_name,
            lastName: userData.personal_info.last_name,
            title: userData.personal_info.title,
            additionalAccess: userData.permissions.additional_access,
            accessToReverse: userData.defaults.access_to_reverse,
        }));
        cleanup.track('user', user.name); // removed after the test, even if a later step fails
        await expect(usersPage.userCreatedToast).toBeVisible();

        // ── Verify the new user appears in the Users list ───────────
        await usersPage.gotoUsersList();
        await usersPage.expectListedWithDetails(user);

        // ── Open Edit and confirm the form loads the created user's info ──
        await usersPage.openEditUser(user.name);
        await expect(usersPage.nameInput).toHaveValue(user.name);

        // ── Delete the new user and confirm it's gone from the list ──
        // `remove` also un-tracks it, so the after-test sweep skips it.
        await cleanup.remove('user', user.name);
        await usersPage.expectAbsentFromList(user.name);
    });

    test('[User Setup] Verify that an administrator user can be created with all fields populated and appears in the Users list.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A1-002' },
            { type: 'requirement', description: 'A1-R1|A1-R2' },
        ],
    }, async ({ usersPage, cleanup }) => {
        const user = await usersPage.createUser(makeUser({
            role: userData.defaults.all_fields_role,
            firstName: userData.personal_info.first_name,
            middleName: userData.personal_info.middle_name,
            lastName: userData.personal_info.last_name,
            title: userData.personal_info.title,
            additionalAccess: userData.permissions.additional_access,
            accessToReverse: userData.defaults.access_to_reverse,
        }));
        cleanup.track('user', user.name);

        await expect(usersPage.userCreatedToast).toBeVisible();

        await usersPage.gotoUsersList();
        await usersPage.expectListedWithDetails(user);
    });

    test('[User Setup] Verify that a user can be created with only the required fields.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A1-003' },
            { type: 'requirement', description: 'A1-R1' },
        ],
    }, async ({ usersPage, cleanup }) => {
        const user = await usersPage.createUser(makeUser({
            role: userData.defaults.required_only_role,
        }));
        cleanup.track('user', user.name);

        await usersPage.gotoUsersList();
        await usersPage.expectListedWithDetails(user);
    });

    // A dropdown-contents guard, not a business path — hence @Regression only.
    test('[User Setup] Verify that every Role option is offered in the documented order.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A1-004' },
            { type: 'requirement', description: 'A1-R6' },
        ],
    }, async ({ usersPage }) => {
        await usersPage.gotoUsersList();
        await usersPage.openNewUserForm();

        // Asserting the whole list at once catches an added, removed or reordered
        // option, which a per-option loop cannot.
        await usersPage.openRoleDropdown();
        await expect(usersPage.roleOptions).toHaveText(userData.roles);
        for (const role of userData.roles) {
            await expect(usersPage.roleOption(role)).toBeEnabled();
        }
    });

    // The grid row's Role is what proves the non-administrator role persisted.
    test('[User Setup] Verify that a user can be created with a non-administrator role.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A1-006' },
            { type: 'requirement', description: 'A1-R1' },
        ],
    }, async ({ usersPage, cleanup }) => {
        const user = await usersPage.createUser(makeUser({
            role: userData.defaults.creatable_role,
        }));
        cleanup.track('user', user.name);

        await expect(usersPage.userCreatedToast).toBeVisible();

        await usersPage.gotoUsersList();
        await usersPage.expectListedWithDetails(user);
    });

    test('[User Setup] Verify that creating a user with an Initials value already in use is rejected.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A1-005' },
            { type: 'requirement', description: 'A1-R4|A1-R5' },
        ],
    }, async ({ page, usersPage, cleanup }) => {
        // Seed a user so we have a known, in-use Initials value.
        const seed = await usersPage.createUser(makeUser({ role: userData.defaults.all_fields_role }));
        cleanup.track('user', seed.name);

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
