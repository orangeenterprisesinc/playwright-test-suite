/**
 * @fileoverview Executes a single API request under the configured auth
 * strategy, automatically retrying once — with a freshly fetched OAuth2
 * token — on a 401/403 response.
 *
 * @module auth/requestBuilder
 */
import type { APIRequestContext, APIResponse, TestInfo } from '@playwright/test';
import { ConfigProperties, getConfigValue } from '../enums/configProperties';
import { clearTokenCache, getAccessToken } from './authorizationManager';
import { TestMetrics } from '../context/testMetrics';
import { Logger } from '../utils/logger';

const logger = new Logger('RequestBuilder');

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
    data?: unknown;
    params?: Record<string, string>;
    headers?: Record<string, string>;
}

async function buildAuthHeaders(forceRefresh: boolean): Promise<Record<string, string>> {
    const authType = getConfigValue(ConfigProperties.AUTH_TYPE, 'none').toLowerCase();

    if (authType === 'oauth2') {
        if (forceRefresh) clearTokenCache();
        return { Authorization: `Bearer ${await getAccessToken()}` };
    }
    if (authType === 'apikey') {
        const headerName = getConfigValue(ConfigProperties.API_KEY_HEADER, 'X-API-Key');
        return { [headerName]: getConfigValue(ConfigProperties.API_KEY) };
    }
    return {};
}

/**
 * Sends one HTTP request via `apiRequest`, injecting auth headers for the
 * configured `AUTH_TYPE`. On a 401/403 with `AUTH_TYPE=oauth2`, clears the
 * cached token and retries exactly once with a freshly fetched one.
 *
 * @example
 * ```typescript
 * const response = await executeWithAuthRetry(apiRequest, 'GET', './guarantor/28114/notes', {}, testInfo);
 * expect(response.status()).toBe(200);
 * ```
 */
export async function executeWithAuthRetry(
    apiRequest: APIRequestContext,
    method: HttpMethod,
    url: string,
    options: RequestOptions = {},
    testInfo?: TestInfo,
): Promise<APIResponse> {
    const start = Date.now();
    const authType = getConfigValue(ConfigProperties.AUTH_TYPE, 'none').toLowerCase();

    let response = await apiRequest.fetch(url, {
        method,
        data: options.data,
        params: options.params,
        headers: { ...(await buildAuthHeaders(false)), ...options.headers },
    });

    if ((response.status() === 401 || response.status() === 403) && authType === 'oauth2') {
        logger.warn(`${method} ${url} returned ${response.status()} — refreshing token and retrying once`);
        response = await apiRequest.fetch(url, {
            method,
            data: options.data,
            params: options.params,
            headers: { ...(await buildAuthHeaders(true)), ...options.headers },
        });
    }

    const durationMs = Date.now() - start;
    logger.logResponse(response.status(), durationMs);

    if (testInfo) {
        TestMetrics.responseTimeMs = durationMs;
        TestMetrics.httpStatusCode = response.status();
    }

    return response;
}
