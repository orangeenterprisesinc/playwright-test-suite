/**
 * @fileoverview API testing fixtures and helper class.
 *
 * Extends Playwright's base `test` with:
 * - **apiContext** — Raw Playwright `APIRequestContext` with JSON headers
 * - **api** — High-level {@link ApiHelper} with typed methods and auth-retry variants
 * - **authenticatedApi** — Pre-authenticated `APIRequestContext` with Bearer token
 *
 * All fixtures use `playwright.request.newContext()` — independent of the browser context.
 *
 * @module fixtures/api.fixture
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { test, expect } from '../fixtures/api.fixture';
 *
 * test('fetch guarantor notes', async ({ api }) => {
 *   const res = await api.authGet('./guarantor/28114/notes?page=1&pageSize=1');
 *   expect(res.status()).toBe(200);
 * });
 * ```
 */
import { APIRequestContext, APIResponse, expect, test as base } from '@playwright/test';
import { Logger } from '../utils/logger';
import { getCurrentSessionToken } from '../auth/authorizationManager';
import { executeWithAuthRetry, type AuthRequestOptions } from '../auth/requestBuilder';
import type { ApiResponse } from '../types';

/** Ensures the base URL always ends with `/` for correct relative-path resolution. */
function normaliseBaseUrl(raw?: string): string {
    const url = raw || '';
    return url.endsWith('/') ? url : `${url}/`;
}

/**
 * High-level wrapper around Playwright's `APIRequestContext`.
 *
 * Provides typed HTTP methods, authenticated variants with auto-retry on 401/403,
 * response parsing into {@link ApiResponse}, and assertion helpers.
 */
export class ApiHelper {
    private readonly request: APIRequestContext;
    private readonly logger: Logger;

    constructor(request: APIRequestContext) {
        this.request = request;
        this.logger = new Logger('ApiHelper');
    }

    // ── Raw (unauthenticated) HTTP methods ────────────────────────────

    async get<T>(endpoint: string, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
        this.logger.info(`GET ${endpoint}`);
        const res = await this.request.get(endpoint, { headers: options?.headers });
        return this.parseResponse<T>(res);
    }

    async post<T>(endpoint: string, data?: unknown, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
        this.logger.info(`POST ${endpoint}`);
        const res = await this.request.post(endpoint, { data, headers: options?.headers });
        return this.parseResponse<T>(res);
    }

    async put<T>(endpoint: string, data?: unknown, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
        this.logger.info(`PUT ${endpoint}`);
        const res = await this.request.put(endpoint, { data, headers: options?.headers });
        return this.parseResponse<T>(res);
    }

    async patch<T>(endpoint: string, data?: unknown, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
        this.logger.info(`PATCH ${endpoint}`);
        const res = await this.request.patch(endpoint, { data, headers: options?.headers });
        return this.parseResponse<T>(res);
    }

    async delete<T>(endpoint: string, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
        this.logger.info(`DELETE ${endpoint}`);
        const res = await this.request.delete(endpoint, { headers: options?.headers });
        return this.parseResponse<T>(res);
    }

    async head(endpoint: string, options?: { headers?: Record<string, string> }): Promise<ApiResponse<void>> {
        this.logger.info(`HEAD ${endpoint}`);
        const res = await this.request.head(endpoint, { headers: options?.headers });
        return { status: res.status(), statusText: res.statusText(), data: undefined as unknown as void, headers: res.headers() };
    }

    // ── Authenticated HTTP methods (Bearer token + auto-retry on 401/403) ─

    async authGet(endpoint: string, options?: AuthRequestOptions): Promise<APIResponse> {
        this.logger.info(`AUTH GET ${endpoint}`);
        return executeWithAuthRetry(this.request, 'GET', endpoint, options);
    }

    async authPost(endpoint: string, data?: unknown, options?: AuthRequestOptions): Promise<APIResponse> {
        this.logger.info(`AUTH POST ${endpoint}`);
        return executeWithAuthRetry(this.request, 'POST', endpoint, { ...options, data });
    }

    async authPut(endpoint: string, data?: unknown, options?: AuthRequestOptions): Promise<APIResponse> {
        this.logger.info(`AUTH PUT ${endpoint}`);
        return executeWithAuthRetry(this.request, 'PUT', endpoint, { ...options, data });
    }

    async authPatch(endpoint: string, data?: unknown, options?: AuthRequestOptions): Promise<APIResponse> {
        this.logger.info(`AUTH PATCH ${endpoint}`);
        return executeWithAuthRetry(this.request, 'PATCH', endpoint, { ...options, data });
    }

    async authDelete(endpoint: string, options?: AuthRequestOptions): Promise<APIResponse> {
        this.logger.info(`AUTH DELETE ${endpoint}`);
        return executeWithAuthRetry(this.request, 'DELETE', endpoint, options);
    }

    // ── Response logging (unauthenticated methods only) ──────────────

    /**
     * Logs full API response details to the console and log file.
     * Called automatically by {@link parseResponse} for unauthenticated requests.
     * Authenticated requests are logged by `executeWithAuthRetry` instead.
     */
    private logResponseDetails(status: number, statusText: string, url: string, body: unknown): void {
        this.logger.info(`Response Status: ${status} ${statusText}`);
        this.logger.info(`Response URL: ${url}`);
        this.logger.info(`Response Body:\n${JSON.stringify(body, null, 2)}`);
    }

    // ── Response parsing ──────────────────────────────────────────────

    private async parseResponse<T>(response: APIResponse): Promise<ApiResponse<T>> {
        let data: T;
        try {
            data = (await response.json()) as T;
        } catch {
            data = (await response.text()) as unknown as T;
        }
        const parsed = { status: response.status(), statusText: response.statusText(), data, headers: response.headers() };
        this.logResponseDetails(parsed.status, parsed.statusText, response.url(), parsed.data);
        return parsed;
    }

    // ── Assertion helpers ─────────────────────────────────────────────

    /** Asserts the response has a 2xx status code. */
    assertSuccess<T>(response: ApiResponse<T>, message?: string): void {
        const ok = response.status >= 200 && response.status < 300;
        expect(ok, message ?? `Expected 2xx but got ${response.status} ${response.statusText}`).toBeTruthy();
    }

    /** Asserts the response has an exact HTTP status code. */
    assertStatus<T>(response: ApiResponse<T>, expected: number, message?: string): void {
        expect(response.status, message ?? `Expected ${expected} but got ${response.status}`).toBe(expected);
    }
}

// ─── Fixture types ─────────────────────────────────────────────────────

type ApiFixtures = {
    /** Raw Playwright API request context with JSON headers (unauthenticated). */
    apiContext: APIRequestContext;
    /** High-level API helper with typed responses and auth-retry variants. */
    api: ApiHelper;
    /** Pre-authenticated API request context with Bearer token in default headers. */
    authenticatedApi: APIRequestContext;
};

// ─── Test extension ────────────────────────────────────────────────────

export const test = base.extend<ApiFixtures>({
    apiContext: async ({ playwright }, use) => {
        const ctx = await playwright.request.newContext({
            baseURL: normaliseBaseUrl(process.env.API_URL),
            extraHTTPHeaders: { Accept: 'application/json', 'Content-Type': 'application/json' },
        });
        await use(ctx);
        await ctx.dispose();
    },

    api: async ({ apiContext }, use) => {
        await use(new ApiHelper(apiContext));
    },

    authenticatedApi: async ({ playwright }, use) => {
        const token = await getCurrentSessionToken();
        const ctx = await playwright.request.newContext({
            baseURL: normaliseBaseUrl(process.env.API_URL),
            extraHTTPHeaders: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
        });
        await use(ctx);
        await ctx.dispose();
    },
});

export { expect };
