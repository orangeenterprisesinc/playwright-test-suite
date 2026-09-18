import { expect, type APIRequestContext } from '@playwright/test';

/**
 * The tenant preferences a Journey B scenario reads or arranges. Partial PUT only: the API
 * writes exactly the keys sent and ignores nulls, so a restore posts the snapshot back as is.
 * `assignRollsDaily` is never sent from here — flipping it true clears AlternateCode on EVERY
 * Employee row and nothing puts that back.
 */
export async function getPreferences(request: APIRequestContext): Promise<Record<string, unknown>> {
    const res = await request.get('preferences');
    expect(res.ok(), `GET preferences failed with ${res.status()}`).toBe(true);
    return (await res.json()) as Record<string, unknown>;
}

export async function putPreferences(request: APIRequestContext, data: Record<string, unknown>): Promise<void> {
    const put = await request.put('preferences', { headers: { 'Content-Type': 'application/json' }, data });
    expect(put.ok(), `PUT preferences failed with ${put.status()}: ${(await put.text()).slice(0, 300)}`).toBe(true);
}
