import { expect, type APIRequestContext } from '@playwright/test';

/**
 * `GET session/me` — the licensed module flags as the API reports them. The API reads PT_MODULES,
 * not TigerMaster, so a flag can read false on dev while the feature works (PET-12689).
 */
export async function getSessionModules(request: APIRequestContext): Promise<Record<string, unknown>> {
    const res = await request.get('session/me');
    expect(res.ok(), `GET session/me failed with ${res.status()}`).toBe(true);
    return ((await res.json()) as { modules?: Record<string, unknown> }).modules ?? {};
}
