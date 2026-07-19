/**
 * @fileoverview API-only test TEMPLATE (PET Tiger).
 *
 * Category: **API**. No browser is launched — import { test, expect } from the
 * api.fixture. Use the typed `api` helper for calls:
 *   • api.get / post / put / patch / delete — unauthenticated.
 *   • api.authGet / api.authPost — routed through the configured AUTH_TYPE
 *     (oauth2 / basic / apikey) with automatic retry on 401/403.
 *
 * This is a TEMPLATE: the endpoints below are placeholders. Replace the paths
 * and assertions with real PET Tiger API endpoints (relative to API_URL) and
 * remove `.fixme` to activate each test.
 *
 * @see src/fixtures/api.fixture.ts
 */
import { test, expect } from '../../src/fixtures/api.fixture';

test.describe('API — <resource> endpoints', { tag: ['@API'] }, () => {

    test.fixme('GET <resource> returns 200 and a list', async ({ api }) => {
        // TODO: replace 'guarantors' with a real PET Tiger API path (relative to API_URL).
        const res = await api.get<Array<{ id: string }>>('guarantors?page=1&pageSize=10');
        api.assertStatus(res, 200);
        expect(Array.isArray(res.data)).toBeTruthy();
    });

    test.fixme('authenticated GET retries once on 401/403', async ({ api }) => {
        // authGet injects the configured auth strategy and retries with a fresh token on 401/403.
        const res = await api.authGet('guarantor/28114/notes?page=1&pageSize=1');
        api.assertStatus(res, 200);
    });

    test.fixme('POST <resource> creates and echoes the payload', async ({ api }) => {
        const res = await api.authPost<{ id: string; name: string }>('guarantors', {
            data: { name: 'Test Guarantor' },
        });
        expect(res.status).toBe(201);
        expect(res.data.name).toBe('Test Guarantor');
    });
});
