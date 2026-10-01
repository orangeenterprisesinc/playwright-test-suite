/**
 * Catalog workflow A1 — License, serial number, and user setup, steps 4-5: office users with roles and permissions.
 * Data: src/data/journey-a/a01-user-setup.json · Plan: test-plans/journey-a/a01-user-setup.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { UserSetupCaseSchema } from '@data/schemas/journeyAScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { deleteUserAsWorkflowStep, findUserId, mintUserSetup } from '@utils/journeys/journeyAFlow';

test.describe('A1 · License, serial number, and user setup', { tag: ['@JourneyA', '@A1'] }, () => {

    test('[User Setup] End-to-end: create a user, verify it in the Users list, edit it, then delete it.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A1' },
        ],
    }, async ({ usersPage, sessionApi }, testInfo) => {
        const scenario = await loadScenario(UserSetupCaseSchema, testInfo);
        const run = mintUserSetup(scenario, sessionApi, testInfo);
        const user = await usersPage.createUser(run.user);
        await expect(usersPage.userCreatedToast).toBeVisible();

        await usersPage.gotoUsersList();
        await usersPage.expectListedWithDetails(user);

        await usersPage.openEditUser(user.name);
        await expect(usersPage.nameInput).toHaveValue(user.name);

        // Deleting is part of the workflow — a step, not teardown; the grid check is the proof it took effect.
        const userId = await findUserId(sessionApi, user.name);
        expect(userId, `GET /users should list the created user '${user.name}'`).not.toBeNull();
        await deleteUserAsWorkflowStep(sessionApi, userId!);

        await usersPage.expectAbsentFromList(user.name);
    });

});
