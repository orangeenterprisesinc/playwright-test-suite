/**
 * @fileoverview Barrel export for the authentication module.
 *
 * Re-exports token management functions, the authenticated request builder,
 * and related types.
 *
 * @module auth
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { getCurrentSessionToken, executeWithAuthRetry } from '../auth';
 * import type { AuthRequestOptions } from '../auth';
 * ```
 */
export { getCurrentSessionToken, refreshToken, invalidateToken } from './authorizationManager';
export { executeWithAuthRetry } from './requestBuilder';
export type { AuthRequestOptions, AuthType } from './requestBuilder';