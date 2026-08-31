/**
 * @fileoverview The `/users` calls test-data cleanup needs.
 *
 * `DELETE /users/{id}` arrived with WEBPET-1606 and is what lets a user created
 * through the UI be removed again — PET Tiger offers no delete action in the UI,
 * and before that ticket the only option was a direct `Deleted = 1` update on the
 * shared dev database.
 *
 * The delete is rowversion-guarded, so removing a user is two calls: read the
 * record for its `version`, then send that back as `rowversion`. A **409** means
 * something else changed the row in between; a **404** means it is already gone.
 */
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { Logger } from '../logger';

const logger = new Logger('UsersApi');

/** The fields of a `GET /users` row this module uses. */
export interface UserListItem {
    usersCounter: number;
    name: string;
}

/** Status + a truncated body, so a failure is one readable log line. */
async function describe(response: APIResponse): Promise<string> {
    const body = await response.text().catch(() => '<unreadable body>');
    return `${response.status()} ${body.trim().slice(0, 200)}`.trim();
}

/** Every active user. Soft-deleted rows are already excluded by the API. */
export async function listUsers(context: APIRequestContext): Promise<UserListItem[]> {
    const response = await context.get('users');
    if (!response.ok()) throw new Error(`GET /users returned ${await describe(response)}`);
    return (await response.json()) as UserListItem[];
}

/** The `POST /users` body, minus the ~20 optional permission flags. */
export interface NewUser {
    name: string;
    password: string;
    userInitials: string;
    emailAddress: string;
    /** 0-16 (`isValidUserRole`, setup/users.go). Defaults to 1. */
    userRole?: number;
}

/**
 * Create a user and return its id.
 *
 * Name, Initials and Email Address are each uniquely indexed, so callers pass
 * run-unique values — `makeUser()` in `src/data/generated` generates them under
 * the prefix global teardown sweeps, which is the safety net when a test dies
 * before its own cleanup runs.
 */
export async function createUser(context: APIRequestContext, user: NewUser): Promise<number> {
    const response = await context.post('users', {
        data: { active: true, userRole: 1, ...user },
        headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok()) throw new Error(`POST /users returned ${await describe(response)}`);
    const body = (await response.json()) as { usersCounter?: number; id?: number };
    const id = body.usersCounter ?? body.id;
    if (!id) throw new Error(`POST /users returned no id: ${JSON.stringify(body).slice(0, 200)}`);
    return id;
}

/** Names of every active user whose name starts with `prefix`. */
export async function userNamesWithPrefix(
    context: APIRequestContext,
    prefix: string,
): Promise<string[]> {
    const users = await listUsers(context);
    return users.filter((user) => (user.name ?? '').startsWith(prefix)).map((user) => user.name);
}

/**
 * The id of the active user with this name, or `null` if there is none.
 *
 * Trimmed on both sides — the app can pad a stored name, which is why the SQL this
 * replaced matched with `LIKE` rather than `=`.
 */
export async function findUserIdByName(
    context: APIRequestContext,
    name: string,
): Promise<number | null> {
    const wanted = name.trim();
    const users = await listUsers(context);
    return users.find((user) => (user.name ?? '').trim() === wanted)?.usersCounter ?? null;
}

/**
 * Soft-delete one user by id. Resolves quietly when the user is already gone;
 * throws with the status and body on anything else, including a 409 stale version.
 */
export async function deleteUserById(context: APIRequestContext, id: number): Promise<void> {
    const detailResponse = await context.get(`users/${String(id)}`);
    if (detailResponse.status() === 404) return;
    if (!detailResponse.ok()) {
        throw new Error(`GET /users/${String(id)} returned ${await describe(detailResponse)}`);
    }

    const { version } = (await detailResponse.json()) as { version?: string };
    if (!version) {
        throw new Error(
            `GET /users/${String(id)} returned no 'version' — the delete is rowversion-guarded, ` +
            `so the API's response shape has changed and this helper needs updating`,
        );
    }

    const response = await context.delete(`users/${String(id)}`, { data: { rowversion: version } });
    // 404 covers a concurrent delete; anything else, including 409, is a real problem.
    if (response.status() === 204 || response.status() === 404) {
        logger.info(`DELETE /users/${String(id)} → ${String(response.status())} (rowversion ${version})`);
        return;
    }
    throw new Error(`DELETE /users/${String(id)} returned ${await describe(response)}`);
}

/** Soft-delete a user by name. Returns false when there was no such active user. */
export async function deleteUserByName(context: APIRequestContext, name: string): Promise<boolean> {
    const id = await findUserIdByName(context, name);
    if (id === null) return false;
    await deleteUserById(context, id);
    return true;
}
