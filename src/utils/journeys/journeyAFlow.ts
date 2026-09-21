import type { APIRequestContext, TestInfo } from '@playwright/test';
import { makeUser } from '@data/generated';
import type { PieceOutConfigCase, UserSetupCase } from '@data/schemas/journeyAScenario';
import type { NewUserData } from '@pages/admin/UsersPage';
import { runCleanup } from '@utils/cleanup/runCleanup';
import { register } from '@utils/cleanup/cleanupScope';
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
    const cleanup = register(testInfo, 'A1 user-setup cleanup', () =>
        runCleanup(substituted.cleanup, sessionApi, testInfo, { phase: 'after' }),
    );
    return { scenario: substituted, user, cleanup };
}

export interface PieceOutConfigRun {
    scenario: PieceOutConfigCase;
    /** Puts the shared Preferences record back — the snapshot the 'before' phase took. */
    cleanup(): Promise<void>;
}

/**
 * A9 creates nothing, so the flow's whole job is the snapshot/restore bracket: the `restore` step
 * snapshots here, before the screen writes anything, and `cleanup()` restores from the same Map.
 * The case's own annotations are pushed here, as the Journey B flow does.
 */
export async function preparePieceOutConfig(
    scenario: PieceOutConfigCase,
    sessionApi: APIRequestContext,
    testInfo: TestInfo,
): Promise<PieceOutConfigRun> {
    for (const annotation of scenario.annotations) testInfo.annotations.push(annotation);
    const snapshots = new Map<string, unknown>();
    await runCleanup(scenario.cleanup, sessionApi, testInfo, { phase: 'before', snapshots });
    return {
        scenario,
        cleanup: register(testInfo, 'A9 piece-out config cleanup', () =>
            runCleanup(scenario.cleanup, sessionApi, testInfo, { phase: 'after', snapshots }),
        ),
    };
}
