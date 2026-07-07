/**
 * @fileoverview Authenticated API request builder with automatic token retry.
 *
 * Provides {@link executeWithAuthRetry}, which wraps Playwright's `APIRequestContext`
 * methods with automatic Bearer token injection, 401/403 retry with token refresh,
 * response time tracking, and optional response body logging.
 *
 * @module auth/requestBuilder
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { executeWithAuthRetry } from '../auth/requestBuilder';
 *
 * const response = await executeWithAuthRetry(request, 'GET', '/api/users', {
 *   params: { page: 1 },
 * });
 * expect(response.status()).toBe(200);
 * ```
 */
import type { APIRequestContext, APIResponse, TestInfo } from '@playwright/test';
import { allure } from 'allure-playwright';
import { Logger } from '../utils/logger';
import { TestMetrics } from '../context/testMetrics';
import { getCurrentSessionToken, refreshToken } from './authorizationManager';


const logger = new Logger('RequestBuilder');

/** Maximum number of attempts before giving up on auth errors. */
const MAX_AUTH_RETRY_ATTEMPTS = 2;
/** Delay between auth retry attempts in milliseconds. */
const AUTH_RETRY_DELAY_MS = 500;

/**
 * Pauses execution for the specified duration.
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 * @private
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Options for authenticated API requests.
 *
 * @interface AuthRequestOptions
 * @property {Record<string, string>} [headers] - Additional HTTP headers (merged with Authorization)
 * @property {unknown} [data] - Request body (for POST, PUT, PATCH)
 * @property {Record<string, string | number | boolean>} [params] - URL query parameters
 */
/**
 * Supported authentication types.
 *
 * @typedef {'oauth2' | 'basic' | 'apikey'} AuthType
 */
export type AuthType = 'oauth2' | 'basic' | 'apikey';

export interface AuthRequestOptions {
    headers?: Record<string, string>;
    data?: unknown;
    params?: Record<string, string | number | boolean>;
}

/**
 * Executes an authenticated HTTP request with automatic token refresh on 401/403 responses.
 *
 * Automatically:
 * 1. Injects a `Bearer` token from {@link getCurrentSessionToken}
 * 2. Retries with a refreshed token if the response is 401 or 403
 * 3. Records response time and HTTP status in {@link TestMetrics}
 * 4. Optionally logs the response body (controlled by `LOG_RESPONSE` env var)
 *
 * @param {APIRequestContext} request - Playwright's API request context
 * @param {('GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD')} method - HTTP method
 * @param {string} url - Request URL (absolute or relative to baseURL)
 * @param {AuthRequestOptions} [options={}] - Additional request options
 * @returns {Promise<APIResponse>} The API response
 * @throws {Error} If all retry attempts are exhausted
 *
 * @example
 * ```typescript
 * const response = await executeWithAuthRetry(request, 'POST', '/api/users', {
 *   data: { name: 'Alice', email: 'alice@example.com' },
 *   headers: { 'X-Custom': 'value' },
 * });
 * ```
 */
export async function executeWithAuthRetry(
    request: APIRequestContext,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD',
    url: string,
    options: AuthRequestOptions = {},
    testInfo?: TestInfo,
): Promise<APIResponse> {
    let response: APIResponse | null = null;

    for (let attempt = 1; attempt <= MAX_AUTH_RETRY_ATTEMPTS; attempt++) {
        const token = await getCurrentSessionToken();
        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            ...options.headers,
        };

        const startTime = Date.now();
        try {
            const reqOptions = {
                headers,
                data: options.data,
                params: options.params,
            };

            switch (method) {
                case 'GET':
                    response = await request.get(url, reqOptions);
                    break;
                case 'POST':
                    response = await request.post(url, reqOptions);
                    break;
                case 'PUT':
                    response = await request.put(url, reqOptions);
                    break;
                case 'PATCH':
                    response = await request.patch(url, reqOptions);
                    break;
                case 'DELETE':
                    response = await request.delete(url, reqOptions);
                    break;
                case 'HEAD':
                    response = await request.head(url, reqOptions);
                    break;
            }

            const elapsed = Date.now() - startTime;

            // ── Parse and log full response ───────────────────────
            let responseBody: unknown;
            try {
                responseBody = await response.json();
            } catch {
                responseBody = await response.text();
            }

            const responseData = {
                url: response.url(),
                status: response.status(),
                statusText: response.statusText(),
                headers: response.headers(),
                body: responseBody,
            };

            const responseJson = JSON.stringify(responseData, null, 2);

            // ── Print to console / log file ───────────────────────
            logger.info(`API Response Status: ${response.status()} ${response.statusText()}`);
            logger.info(`API Response URL: ${response.url()}`);
            logger.info(`API Response Body:\n${JSON.stringify(responseBody, null, 2)}`);

            // ── Attach to Playwright HTML report ──────────────────
            if (testInfo) {
                await testInfo.attach('API Response', {
                    body: responseJson,
                    contentType: 'application/json',
                });
            }

            // ── Attach to Allure report ───────────────────────────
            await allure.attachment(
                'API Response',
                responseJson,
                'application/json',
            );

            TestMetrics.httpStatusCode = response.status();
            TestMetrics.responseTimeMs = elapsed;

            if (
                (response.status() === 401 || response.status() === 403) &&
                attempt < MAX_AUTH_RETRY_ATTEMPTS
            ) {
                logger.warn(
                    `Auth error (${response.status()}) on attempt ${attempt}, refreshing token…`,
                );
                await refreshToken();
                await sleep(AUTH_RETRY_DELAY_MS);
                continue;
            }

            logger.info(`${method} ${url} → ${response.status()} (${elapsed}ms)`);

            return response;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error(`${method} ${url} failed on attempt ${attempt}: ${msg}`);
            TestMetrics.errorMessage = msg;

            if (attempt < MAX_AUTH_RETRY_ATTEMPTS) {
                await sleep(AUTH_RETRY_DELAY_MS);
            } else {
                throw error;
            }
        }
    }
    throw new Error(`${method} ${url} failed after ${MAX_AUTH_RETRY_ATTEMPTS} attempts`);
}
