/**
 * @fileoverview Standalone Playwright fixtures for API-only test specs — no
 * browser page is created. For UI (or mixed UI+API) specs, use
 * {@link ../fixtures/base.fixture} instead.
 *
 * @module fixtures/api.fixture
 *
 * @example
 * ```typescript
 * import { test } from '../../src/fixtures/api.fixture';
 *
 * test('GET /users returns 200', async ({ api }) => {
 *   const response = await api.get<{ id: number }[]>('users');
 *   api.assertStatus(response, 200);
 * });
 * ```
 */
import { APIRequestContext, expect, test as base } from '@playwright/test';
import { ConfigProperties, getConfigValue } from '../enums/configProperties';
import { buildAuthContextOptions } from '../auth/authContextFactory';
import { executeWithAuthRetry, type HttpMethod, type RequestOptions } from '../auth/requestBuilder';
import { Logger } from '../utils/logger';

/** Result of an {@link ApiHelper} call — parsed JSON body plus the HTTP status. */
export interface ApiCallResult<T> {
    status: number;
    data: T;
}

/** Typed HTTP helpers bound to the current test's API request context. */
export interface ApiHelper {
    get<T>(url: string, options?: RequestOptions): Promise<ApiCallResult<T>>;
    post<T>(url: string, options?: RequestOptions): Promise<ApiCallResult<T>>;
    put<T>(url: string, options?: RequestOptions): Promise<ApiCallResult<T>>;
    patch<T>(url: string, options?: RequestOptions): Promise<ApiCallResult<T>>;
    delete<T>(url: string, options?: RequestOptions): Promise<ApiCallResult<T>>;
    /** Same as {@link get}, but routed through the configured auth strategy with auto-retry on 401/403. */
    authGet<T>(url: string, options?: RequestOptions): Promise<ApiCallResult<T>>;
    /** Same as {@link post}, but routed through the configured auth strategy with auto-retry on 401/403. */
    authPost<T>(url: string, options?: RequestOptions): Promise<ApiCallResult<T>>;
    assertStatus(response: { status: number }, expected: number): void;
    assertSuccess(response: { status: number }): void;
}

type CustomFixtures = {
    /** Raw, unauthenticated API request context scoped to `API_URL`. */
    apiContext: APIRequestContext;
    /** API request context pre-configured with the current `AUTH_TYPE` strategy. */
    authenticatedApi: APIRequestContext;
    /** Typed HTTP helper bound to {@link apiContext}. */
    api: ApiHelper;
};

function resolveApiBaseUrl(): string {
    const raw = getConfigValue(ConfigProperties.API_URL);
    return raw.endsWith('/') ? raw : `${raw}/`;
}

export const test = base.extend<CustomFixtures>({
    apiContext: async ({ playwright }, use) => {
        const context = await playwright.request.newContext({ baseURL: resolveApiBaseUrl() });
        await use(context);
        await context.dispose();
    },

    authenticatedApi: async ({ playwright }, use) => {
        const authOptions = await buildAuthContextOptions();
        const context = await playwright.request.newContext({ baseURL: resolveApiBaseUrl(), ...authOptions });
        await use(context);
        await context.dispose();
    },

    api: async ({ apiContext }, use, testInfo) => {
        const logger = new Logger('ApiHelper');

        const call = async <T>(method: HttpMethod, url: string, options?: RequestOptions): Promise<ApiCallResult<T>> => {
            const start = Date.now();
            const response = await apiContext.fetch(url, {
                method,
                data: options?.data,
                params: options?.params,
                headers: options?.headers,
            });
            logger.logResponse(response.status(), Date.now() - start);
            return { status: response.status(), data: (await response.json().catch(() => undefined)) as T };
        };

        const authCall = async <T>(method: HttpMethod, url: string, options?: RequestOptions): Promise<ApiCallResult<T>> => {
            const response = await executeWithAuthRetry(apiContext, method, url, options, testInfo);
            return { status: response.status(), data: (await response.json().catch(() => undefined)) as T };
        };

        const helper: ApiHelper = {
            get: (url, options) => call('GET', url, options),
            post: (url, options) => call('POST', url, options),
            put: (url, options) => call('PUT', url, options),
            patch: (url, options) => call('PATCH', url, options),
            delete: (url, options) => call('DELETE', url, options),
            authGet: (url, options) => authCall('GET', url, options),
            authPost: (url, options) => authCall('POST', url, options),
            assertStatus: (response, expected) => expect(response.status).toBe(expected),
            assertSuccess: (response) => expect(response.status).toBeGreaterThanOrEqual(200),
        };

        await use(helper);
    },
});

export { expect };
