/**
 * @fileoverview OAuth2 client-credentials token manager with in-memory caching.
 *
 * Fetches an access token from `ACCESS_TOKEN_URL` using `CLIENT_ID`/`CLIENT_SECRET`
 * and caches it until shortly before it expires, refreshing automatically on
 * the next call past that point. Only relevant when `AUTH_TYPE=oauth2` —
 * other auth strategies never call this module.
 *
 * @module auth/authorizationManager
 */
import { ConfigProperties, getConfigValue } from '../enums/configProperties';
import { AuthenticationError } from '../core/frameworkExceptions';
import { Logger } from '../utils/logger';

const logger = new Logger('AuthorizationManager');

/** Refresh this many ms before actual expiry, so a cached token never expires mid-request. */
const EXPIRY_SAFETY_MARGIN_MS = 5000;

interface CachedToken {
    accessToken: string;
    expiresAt: number;
}

interface TokenResponse {
    access_token: string;
    expires_in?: number;
    token_type?: string;
}

let cachedToken: CachedToken | null = null;

async function requestNewToken(): Promise<CachedToken> {
    const tokenUrl = getConfigValue(ConfigProperties.ACCESS_TOKEN_URL);
    const clientId = getConfigValue(ConfigProperties.CLIENT_ID);
    const clientSecret = getConfigValue(ConfigProperties.CLIENT_SECRET);

    if (!tokenUrl || !clientId || !clientSecret) {
        throw new AuthenticationError(
            'AUTH_TYPE=oauth2 but ACCESS_TOKEN_URL / CLIENT_ID / CLIENT_SECRET are not all set',
        );
    }

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
    });

    logger.info(`Requesting OAuth2 token from ${tokenUrl}`);
    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    if (!response.ok) {
        throw new AuthenticationError(`OAuth2 token request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as TokenResponse;
    if (!data.access_token) {
        throw new AuthenticationError('OAuth2 token response did not include an access_token');
    }

    const ttlMs = (data.expires_in ?? 300) * 1000;
    return {
        accessToken: data.access_token,
        expiresAt: Date.now() + ttlMs - EXPIRY_SAFETY_MARGIN_MS,
    };
}

/** Returns the cached token if still valid, otherwise fetches and caches a new one. */
export async function getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
        return cachedToken.accessToken;
    }
    cachedToken = await requestNewToken();
    return cachedToken.accessToken;
}

/** Discards the cached token, forcing the next {@link getAccessToken} call to fetch a fresh one. */
export function clearTokenCache(): void {
    cachedToken = null;
}
