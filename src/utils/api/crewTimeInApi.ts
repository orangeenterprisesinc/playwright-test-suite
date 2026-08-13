import type { APIRequestContext } from '@playwright/test';

/**
 * Crew time-in through the office API — the same write `/scan/crew-time-in`
 * performs.
 *
 * Journey B's real transport is the device: capture on the handheld, export, and
 * let the office import it. Where that import cannot run (dev staging has no
 * object storage, so every ingest route fails at `storage.Put`), this creates the
 * identical punches directly so the office half of the journey — the punches
 * landing and appearing on Transfer to Job Cards — is still exercised.
 *
 * It is a **substitute for the transport, not for the assertions**: callers must
 * say so in the report, because it proves the office landing, not the
 * device→office pipeline.
 *
 * Verified against dev staging 2026-08-11: returns 201 with one reference per
 * employee, and the rows come back linked to the requested crew/job/field/ranch.
 * Office-created rows carry `programCreated: false`, where imported ones are
 * `true` — a useful tell when reading the data later.
 */

export interface CrewTimeInRequest {
    /** `YYYY-MM-DDTHH:mm:ss` — the punch time. */
    dateTime: string;
    crewCounter: number;
    employeeIds: number[];
    ranchCounter: number;
    fieldCounter: number;
    jobCounter: number;
    crewTableCounter?: number | null;
}

export interface CrewTimeInResult {
    created: number;
    /** One per employee, in the order the server created them. */
    references: string[];
}

export async function createCrewTimeIn(
    request: APIRequestContext,
    body: CrewTimeInRequest,
): Promise<CrewTimeInResult> {
    const res = await request.post('time-cards/crew-time-in', {
        data: { crewTableCounter: null, ...body },
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok()) {
        throw new Error(
            `POST time-cards/crew-time-in failed with ${res.status()}: ${(await res.text()).slice(0, 400)}`,
        );
    }
    const payload = (await res.json()) as { created?: number; references?: string[] };
    return {
        created: Number(payload.created ?? 0),
        references: payload.references ?? [],
    };
}

/** `YYYY-MM-DDTHH:mm:ss` for a day at a fixed time — deterministic, never `now`. */
export function punchTime(hour = 7, minute = 15, date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:${pad(minute)}:00`;
}
