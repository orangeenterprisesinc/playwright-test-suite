/**
 * @fileoverview Environment configuration definitions and resolver.
 *
 * Defines per-environment settings (dev, stag, prod, qe) including application URLs,
 * API URLs, timeouts, and retry counts. Each environment's URLs are resolved from
 * environment-specific env vars (e.g., `DEV_APP_URL`, `STAG_API_URL`) with
 * sensible defaults for local development.
 *
 * @module config/environments
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { getEnvironmentConfig } from '../config/environments';
 *
 * const devConfig = getEnvironmentConfig('dev');
 * console.log(devConfig.appUrl); // 'http://localhost:3000' (or DEV_APP_URL)
 * ```
 */
import type {Environment, EnvironmentConfig} from '../types';

/**
 * Pre-defined configuration for each supported environment.
 *
 * URLs are resolved from environment-specific variables at module load time:
 * - `dev` → `DEV_APP_URL` / `DEV_API_URL`
 * - `stag` → `STAG_APP_URL` / `STAG_API_URL`
 * - `prod` → `PROD_APP_URL` / `PROD_API_URL`
 * - `qe` → `QE_APP_URL` / `QE_API_URL`
 *
 * @const {Record<Environment, EnvironmentConfig>}
 * @private
 */
const environments: Record<Environment, EnvironmentConfig> = {
    dev: {
        name: 'dev',
        appUrl: process.env.DEV_APP_URL || 'http://localhost:3000',
        apiUrl: process.env.DEV_API_URL || 'http://localhost:3001/api',
        timeout: 60000,
        retries: 0,
    },
    stag: {
        name: 'stag',
        appUrl: process.env.STAG_APP_URL || 'https://staging.example.com',
        apiUrl: process.env.STAG_API_URL || 'https://staging-api.example.com',
        timeout: 30000,
        retries: 2,
    },
    prod: {
        name: 'prod',
        appUrl: process.env.PROD_APP_URL || 'https://www.example.com',
        apiUrl: process.env.PROD_API_URL || 'https://api.example.com',
        timeout: 30000,
        retries: 3,
    },
    qe: {
        name: 'qe',
        appUrl: process.env.QE_APP_URL || 'https://www.example.com',
        apiUrl: process.env.QE_API_URL || 'https://api.example.com',
        timeout: 30000,
        retries: 3,
    },
};

/**
 * Retrieves the configuration for a specific environment.
 *
 * Falls back to the `TEST_ENV` environment variable, then to `'qe'` if no
 * argument is provided.
 *
 * @param {Environment} [env] - The target environment. Defaults to `process.env.TEST_ENV` or `'qe'`
 * @returns {EnvironmentConfig} The configuration for the requested environment
 * @throws {Error} If the requested environment is not defined in the environments map
 *
 * @example
 * ```typescript
 * // Explicit environment
 * const stagConfig = getEnvironmentConfig('stag');
 * console.log(stagConfig.timeout); // 30000
 *
 * // Default from TEST_ENV or 'qe'
 * const defaultConfig = getEnvironmentConfig();
 * ```
 */
export function getEnvironmentConfig(env ?: Environment): EnvironmentConfig {
    const envName = env || (process.env.TEST_ENV as Environment) || 'qe';
    const config = environments[envName];
    if (!config) {
        throw new Error(
            `Unknown environment: ${envName}. Valid options: ${Object.keys(environments).join(', ')}`,
        );
    }
    return config;
}