/**
 * @fileoverview Factory for creating authenticated Playwright {@link APIRequestContext} instances.
 *
 * Depending on the requested {@link AuthType}, this module builds a standalone
 * request context with the appropriate credentials (HTTP Basic, API Key, or a
 * plain context for header-based OAuth2 flows).
 *
 * @module auth/authContextFactory
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { createContextForAuth } from '@auth/authContextFactory';
 *
 * const { context, shouldDispose } = await createContextForAuth('basic');
 * const res = await context.get('./users');
 * if (shouldDispose) await context.dispose();
 * ```
 */
import { request as playwrightRequest, APIRequestContext } from '@playwright/test';
import { ConfigProperties, getConfigValue } from '../enums/configProperties';
import { AuthType } from './requestBuilder';

/**
 * Creates a standalone {@link APIRequestContext} configured for the given auth type.
 *
 * @param {AuthType} authType - The authentication strategy to use (`'basic'`, `'oauth2'`, `'apikey'`, or `'none'`)
 * @returns {Promise<{ context: APIRequestContext; shouldDispose: boolean }>}
 *   An object containing the request context and a flag indicating whether the
 *   caller is responsible for disposing it.
 *
 * @throws Will propagate any Playwright errors if context creation fails.
 */
export async function createContextForAuth(
  authType: AuthType
): Promise<{ context: APIRequestContext; shouldDispose: boolean }> {

  const baseURL = getConfigValue(ConfigProperties.API_URL);

  switch (authType) {
    case 'basic': {
      const username = getConfigValue(ConfigProperties.BASIC_AUTH_USERNAME);
      const password = getConfigValue(ConfigProperties.BASIC_AUTH_PASSWORD);

      const context = await playwrightRequest.newContext({
        baseURL,
        httpCredentials: {
          username,
          password,
        },
      });

      return { context, shouldDispose: true };
    }

    default: {
      // Use lightweight context for header-based auth
      const context = await playwrightRequest.newContext({ baseURL });
      return { context, shouldDispose: true };
    }
  }
}
