/**
 * @fileoverview Factory that builds `APIRequestContext` creation options for
 * the configured authentication strategy (OAuth2, Basic, API Key, or none).
 *
 * @module auth/authContextFactory
 *
 * @example
 * ```typescript
 * const authOptions = await buildAuthContextOptions();
 * const context = await playwright.request.newContext({ baseURL, ...authOptions });
 * ```
 */
import { ConfigProperties, getConfigValue } from '../enums/configProperties';
import { getAccessToken } from './authorizationManager';

export type AuthType = 'oauth2' | 'basic' | 'apikey' | 'none';

/** Subset of Playwright's `APIRequestContext` creation options this factory can populate. */
export interface AuthContextOptions {
    extraHTTPHeaders?: Record<string, string>;
    httpCredentials?: { username: string; password: string };
}

function resolveAuthType(): AuthType {
    const raw = getConfigValue(ConfigProperties.AUTH_TYPE, 'none').toLowerCase();
    return raw === 'oauth2' || raw === 'basic' || raw === 'apikey' ? raw : 'none';
}

/**
 * Builds the `APIRequestContext` options for the currently configured
 * `AUTH_TYPE` — spread the result straight into `playwright.request.newContext()`.
 */
export async function buildAuthContextOptions(): Promise<AuthContextOptions> {
    switch (resolveAuthType()) {
        case 'oauth2': {
            const token = await getAccessToken();
            return { extraHTTPHeaders: { Authorization: `Bearer ${token}` } };
        }
        case 'basic':
            return {
                httpCredentials: {
                    username: getConfigValue(ConfigProperties.AUTH_USERNAME),
                    password: getConfigValue(ConfigProperties.AUTH_PASSWORD),
                },
            };
        case 'apikey': {
            const headerName = getConfigValue(ConfigProperties.API_KEY_HEADER, 'X-API-Key');
            return { extraHTTPHeaders: { [headerName]: getConfigValue(ConfigProperties.API_KEY) } };
        }
        default:
            return {};
    }
}
