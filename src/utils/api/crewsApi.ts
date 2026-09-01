import type { APIRequestContext } from '@playwright/test';

/**
 * Reading and setting a crew's **notification user** — the one office setting
 * B12's workflow depends on.
 *
 * `Crew.UserToNotifyBreakAndMeal` is where the clock-out notification finds its
 * recipient: `sendClockOutFlagNotifications` joins it to `Users` and reads
 * `Name` + `EmailAddress` (`input/clockout_flag_notify.go:105-141`). A crew with
 * no notify-user — or one whose user has a blank address — is **logged and
 * skipped**, silently, so a test that assumes the setting is present would prove
 * nothing.
 *
 * The update is a read-modify-write: `PUT /crews/{id}` replaces the record, so
 * the current body is sent back with one field changed, carrying `version` for
 * the rowversion guard. That also makes restoring the original value a second
 * call with the same shape.
 */

export interface CrewRecord {
    crewCounter: number;
    name: string;
    code?: string;
    /** FK to `Users.UsersCounter`; null when no notification user is configured. */
    userToNotifyBreakAndMeal?: number | null;
    breakAndMealNotification?: string | null;
    version?: string;
    [key: string]: unknown;
}

export async function getCrew(request: APIRequestContext, id: number): Promise<CrewRecord> {
    const res = await request.get(`crews/${id}`);
    if (!res.ok()) {
        throw new Error(`GET crews/${id} failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as CrewRecord;
}

/**
 * Point the crew's notification user at `usersCounter` (or clear it with `null`),
 * returning the value that was there before so a caller can restore it.
 *
 * Re-reads the crew immediately before writing: the rowversion has to be the
 * current one, and the same call gives us the body to echo back.
 */
export async function setCrewNotifyUser(
    request: APIRequestContext,
    id: number,
    usersCounter: number | null,
): Promise<number | null> {
    const crew = await getCrew(request, id);
    const previous = crew.userToNotifyBreakAndMeal ?? null;
    if (previous === usersCounter) return previous;

    const { crewCounter: _drop, ...body } = crew;
    const res = await request.put(`crews/${id}`, {
        data: { ...body, userToNotifyBreakAndMeal: usersCounter },
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok()) {
        throw new Error(
            `PUT crews/${id} (userToNotifyBreakAndMeal=${usersCounter}) failed with ` +
                `${res.status()}: ${(await res.text()).slice(0, 400)}`,
        );
    }
    return previous;
}
