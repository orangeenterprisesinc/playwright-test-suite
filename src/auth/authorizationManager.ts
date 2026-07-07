/**
 * @fileoverview OAuth2 client-credentials authorization manager with token caching.
 *
 * Handles token acquisition, caching, auto-refresh, and invalidation for OAuth2
 * client-credentials flow. Tokens are cached in memory and automatically refreshed
 * when they expire (based on `expires_in` from the token response).
 *
 * @module auth/authorizationManager
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { getCurrentSessionToken, refreshToken, invalidateToken } from '../auth/authorizationManager';
 *
 * const token = await getCurrentSessionToken(); // Uses cached token if valid
 * await refreshToken();                         // Force-refreshes the token
 * invalidateToken();                            // Clears the cached token
 * ```
 */
import { Logger } from '../utils/logger';
import { ConfigProperties, getConfigValue } from '../enums/configProperties';


const logger = new Logger('AuthorizationManager');

/** Default token time-to-live in seconds if the server doesn't provide `expires_in`. */
const DEFAULT_TOKEN_TTL_SECONDS = 3500;

/**
 * Internal token cache structure.
 * @interface TokenCache
 * @private
 */
interface TokenCache {
    /** The OAuth2 access token string. */
    accessToken: string;
    /** Timestamp (epoch ms) when the token expires. */
    expiresAt: number;
}

/** @private Module-level cached token (null when no valid token exists). */
let cachedToken: TokenCache | null = null;

/**
 * Fetches a new OAuth2 access token from the configured token endpoint.
 *
 * Reads client credentials from environment variables (Base64-encoded), sends a
 * `client_credentials` grant request, and caches the resulting token.
 *
 * @returns {Promise<string>} The newly acquired access token
 * @throws {Error} If the token request fails (non-2xx response)
 * @private
 */
async function fetchNewToken(): Promise<string> {
    const tokenUrl = getConfigValue(ConfigProperties.ACCESS_TOKEN_URL);
    const clientId = getConfigValue(ConfigProperties.CLIENT_ID);
    const clientSecret = getConfigValue(ConfigProperties.CLIENT_SECRET);
    const audience = getConfigValue(ConfigProperties.AUDIENCE);
    const username = getConfigValue(ConfigProperties.AUTH_USERNAME);
    const password = getConfigValue(ConfigProperties.AUTH_PASSWORD);

    const params = new URLSearchParams({
        grant_type: 'password',
        client_id: clientId,
        client_secret: clientSecret,
        username: username,
        password: password,
    });

    if (audience) params.append('audience', audience);

    const scope = getConfigValue(ConfigProperties.SCOPE);
    if (scope) params.append('scope', scope);

    logger.info(`Requesting token from ${tokenUrl} for client ${clientId}`);

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token request failed [${response.status}]: ${text}`);
    }

    const json = await response.json() as {
        access_token: string;
        expires_in?: number;
    };

    const expiresIn = json.expires_in ?? DEFAULT_TOKEN_TTL_SECONDS;

    cachedToken = {
        accessToken: json.access_token,
        expiresAt: Date.now() + expiresIn * 1000,
    };

    logger.info('User authenticated successfully');

    return json.access_token;
}


/**
 * Returns the current session token, fetching a new one if the cache is empty or expired.
 *
 * @returns {Promise<string>} A valid OAuth2 access token
 *
 * @example
 * ```typescript
 * const token = await getCurrentSessionToken();
 * headers['Authorization'] = `Bearer ${token}`;
 * ```
 */
export async function getCurrentSessionToken(): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt) {
        return cachedToken.accessToken;
    }
    return fetchNewToken();
}

/**
 * Forces a token refresh by invalidating the cache and fetching a new token.
 *
 * @returns {Promise<string>} The newly acquired access token
 */
export async function refreshToken(): Promise<string> {
    cachedToken = null;
    return fetchNewToken();
}

/**
 * Invalidates the cached token without fetching a new one.
 *
 * The next call to {@link getCurrentSessionToken} will trigger a fresh token request.
 */
export function invalidateToken(): void {
    cachedToken = null;
}
