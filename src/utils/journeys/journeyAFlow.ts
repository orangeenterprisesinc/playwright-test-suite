import type { APIRequestContext, TestInfo } from '@playwright/test';
import { makeUser } from '@data/generated';
import type { PieceOutConfigCase, UserSetupCase } from '@data/schemas/journeyAScenario';
import type { NewUserData } from '@pages/admin/UsersPage';
import { getPreferences } from '@utils/api/preferencesApi';
import { getSessionModules } from '@utils/api/sessionApi';
import { findActiveDeviceOfType, pushSetupExport } from '@utils/api/setupExportApi';
import { deleteUserById, findUserIdByName } from '@utils/api/usersApi';
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

export function mintUserSetup(scenario: UserSetupCase, _sessionApi: APIRequestContext, testInfo: TestInfo): UserSetupRun {
    const user = makeUser(scenario.user);
    const substituted = substituteTokens(scenario, { userName: user.name });
    const cleanup = register(testInfo, 'A1 user-setup cleanup', (api) =>
        runCleanup(substituted.cleanup, api, testInfo, { phase: 'after' }),
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
        cleanup: register(testInfo, 'A9 piece-out config cleanup', (api) =>
            runCleanup(scenario.cleanup, api, testInfo, { phase: 'after', snapshots }),
        ),
    };
}

// The API edge of journey A. Specs may not import @utils/api/* (UI-first lint), so every
// read A1 and A9 need passes through here. Each is named for what it is: a read, or a write
// that is still a workflow step and will move on screen.

/** A1 step 6 read: the created user's id, for the delete that follows. */
export async function findUserId(api: APIRequestContext, name: string): Promise<number | null> {
    return findUserIdByName(api, name);
}

/**
 * A1 step 6 write. The catalog step is "delete", the product offers only deactivate, and this
 * is the API standing in until `UsersPage.deactivate()` replaces it. Deliberately not wrapped
 * in an allowance — the UI-first guard is meant to flag it.
 */
export async function deleteUserAsWorkflowStep(api: APIRequestContext, id: number): Promise<void> {
    await deleteUserById(api, id);
}

/** A9 read: the module gates, read before anything is written so a section cannot assert vacuously. */
export async function readModuleGates(api: APIRequestContext): Promise<Record<string, unknown>> {
    return getSessionModules(api);
}

/** A9 read-back: what the Preferences screen actually stored, by wire key. */
export async function readStoredPreferences(api: APIRequestContext): Promise<Record<string, unknown>> {
    return getPreferences(api);
}

/** A9 read: an existing active pocket device. Never mints one — a fresh device exports no piece jobs. */
export async function findPocketDevice(api: APIRequestContext, deviceType: number) {
    return findActiveDeviceOfType(api, deviceType);
}

/**
 * A9 write: Push to Device. A user action on the Scan Device form, standing in as an API POST
 * until `ScanDevicePage.pushToDevice()` replaces it — so it too is left for the guard to flag.
 */
export async function pushSetupExportToDevice(api: APIRequestContext, deviceId: number) {
    return pushSetupExport(api, deviceId);
}
