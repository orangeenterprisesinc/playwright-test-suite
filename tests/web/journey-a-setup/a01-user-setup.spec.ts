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
 * Authenticated flow (File ▸ Administration ▸ Users). These tests run logged in
 * via the shared `.auth/user.json` storage state, so there is no login flow here —
 * that half of the workflow is covered by `tests/web/system/login-module.spec.ts`.
 *
 * The PET Tiger UI has no delete-user action and soft-deletes users, so each
 * created user is removed with `Deleted = 1` after the test — a true delete that
 * also frees the Name/Initials/Email. The `cleanup` fixture does that; specs no
 * longer write the SQL themselves. Names/Initials/Emails are generated uniquely
 * per run so re-runs never collide; because the Initials field is capped at 3
 * characters (and its "Already in use" rule is enforced on new users), createUser
 * regenerates the Initials and retries if a random value happens to already exist.
 */
import { expect, test } from '@fixtures/base.fixture';
import { userSetupData as userData } from '@data/static/journey-a/userSetupData';
import { makeUser, randomInitials } from '@data/generated';
import type { NewUserData, UsersPage } from '@pages/admin/UsersPage';

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

// One describe per catalog workflow, named for it and carrying both selection
// tags: `@JourneyA` runs the whole journey, `@A1` just this workflow.
//   npx playwright test --grep @JourneyA
//   npx playwright test --grep @A1
// The describe title is also the Allure "story", so the report reads
// ui ▸ journey-a-setup ▸ A1 · License, serial number, and user setup.
test.describe('A1 · License, serial number, and user setup', { tag: ['@JourneyA', '@A1'] }, () => {

    // Users created by a test are removed by the `cleanup` fixture after it — see
    // src/utils/db/cleanupRegistry.ts and src/data/static/shared/cleanupTargets.ts, which
    // own the soft-delete statement and the table it targets. Cleanup is scoped to
    // the client DB (the Users screen reads from there, so removing the row frees
    // its Name/Initials) and deliberately leaves the shared TigerMaster untouched:
    // emails are unique per run, so the leftover global row never blocks
    // re-creation.

    test('[User Setup] End-to-end: create a user, verify it in the Users list, edit it, then delete it.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A1-001' },
            { type: 'requirement', description: 'A1-R1|A1-R2|A1-R7|A1-R8' },
        ],
    }, async ({ usersPage, cleanup }) => {
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
        cleanup.track('user', user.name); // removed after the test, even if a later step fails
        await expect(usersPage.userCreatedToast).toBeVisible();

        // ── Verify the new user appears in the Users list ───────────
        await usersPage.gotoUsersList();
        await expectUserListed(usersPage, user);

        // ── Open Edit and confirm the form loads the created user's info ──
        await usersPage.openEditUser(user.name);
        await expect(usersPage.nameInput).toHaveValue(user.name);

        // ── Delete the new user and confirm it's gone from the list ──
        // PET Tiger has no UI delete, so removal is a soft delete in SQL; the user
        // then disappears from the list (which reads the client DB). `remove` also
        // un-tracks it, so the after-test sweep doesn't try to delete it again.
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
        const user = await createUser(usersPage, makeUser({
            role: userData.defaults.all_fields_role,
            firstName: userData.personal_info.first_name,
            middleName: userData.personal_info.middle_name,
            lastName: userData.personal_info.last_name,
            title: userData.personal_info.title,
            additionalAccess: userData.permissions.additional_access,
            accessToReverse: userData.defaults.access_to_reverse,
        }));
        cleanup.track('user', user.name);

        // Success feedback right after saving.
        await expect(usersPage.userCreatedToast).toBeVisible();

        // The new user is listed with the expected details.
        await usersPage.gotoUsersList();
        await expectUserListed(usersPage, user);
    });

    test('[User Setup] Verify that a user can be created with only the required fields.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A1-003' },
            { type: 'requirement', description: 'A1-R1' },
        ],
    }, async ({ usersPage, cleanup }) => {
        const user = await createUser(usersPage, makeUser({
            role: userData.defaults.required_only_role,
        }));
        cleanup.track('user', user.name);

        await usersPage.gotoUsersList();
        await expectUserListed(usersPage, user);
    });

    // A1-R6 is a guard on the Role dropdown's contents, not a business path, so
    // it stops at @Regression. It creates nothing and needs no cleanup. The
    // non-administrator *creation* this test used to also perform is A1-006
    // below — one outcome per case.
    test('[User Setup] Verify that every Role option is offered in the documented order.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A1-004' },
            { type: 'requirement', description: 'A1-R6' },
        ],
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
    });

    // The same creation rule as A1-002/A1-003 (A1-R1), exercised with a role
    // other than Administrator. `expectUserListed` asserts the Role shown in the
    // grid row, which is what proves the non-administrator role was persisted.
    test('[User Setup] Verify that a user can be created with a non-administrator role.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A1-006' },
            { type: 'requirement', description: 'A1-R1' },
        ],
    }, async ({ usersPage, cleanup }) => {
        const user = await createUser(usersPage, makeUser({
            role: userData.defaults.creatable_role,
        }));
        cleanup.track('user', user.name);

        await expect(usersPage.userCreatedToast).toBeVisible();

        await usersPage.gotoUsersList();
        await expectUserListed(usersPage, user);
    });

    test('[User Setup] Verify that creating a user with an Initials value already in use is rejected.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A1-005' },
            { type: 'requirement', description: 'A1-R4|A1-R5' },
        ],
    }, async ({ page, usersPage, cleanup }) => {
        // Seed a user so we have a known, in-use Initials value.
        const seed = await createUser(usersPage, makeUser({ role: userData.defaults.all_fields_role }));
        cleanup.track('user', seed.name);

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
