import type { APIRequestContext, TestInfo } from '@playwright/test';
import { makeUser } from '@data/generated';
import type { UserSetupCase } from '@data/schemas/journeyAScenario';
import type { NewUserData } from '@pages/admin/UsersPage';
import { runCleanup } from '@utils/cleanup/runCleanup';
import { substituteTokens } from '@utils/data/scenarioLoader';

// Journey A: the spec drives the setup screens itself; this layer mints what a case cannot hold
// (a run-unique user) and binds the minted name into the case's cleanup steps.

export interface UserSetupRun {
    /** The case with `{userName}` substituted. */
    scenario: UserSetupCase;
    /** The New User form data: the case's fields over a run-unique name, initials and email. */
    user: NewUserData;
    /** The case's cleanup steps, 'after' phase — a no-op for a user the test already deleted as its own step. */
    cleanup(): Promise<void>;
}

export function mintUserSetup(scenario: UserSetupCase, sessionApi: APIRequestContext, testInfo: TestInfo): UserSetupRun {
    const user = makeUser(scenario.user);
    const substituted = substituteTokens(scenario, { userName: user.name });
    return { scenario: substituted, user, cleanup: () => runCleanup(substituted.cleanup, sessionApi, testInfo, { phase: 'after' }) };
}
