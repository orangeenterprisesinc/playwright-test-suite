/**
 * @fileoverview Environment configuration definitions and resolver.
 *
 * Defines per-environment settings (local, dev, qa) including application URLs,
 * API URLs, timeouts, and retry counts. Each environment's URLs are resolved from
 * environment-specific env vars (e.g., `DEV_APP_URL`, `QA_API_URL`) with
 * sensible defaults.
 *
 * @module config/environments
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { getEnvironmentConfig } from '../config/environments';
 *
 * const localConfig = getEnvironmentConfig('local');
 * console.log(localConfig.appUrl); // 'http://localhost:3000' (or BASE_URL)
 * ```
 */
import type {Environment, EnvironmentConfig} from '../types';

/**
 * Pre-defined configuration for each supported environment.
 *
 * URLs are resolved from environment-specific variables at module load time:
 * - `local` → `BASE_URL` / `API_URL` (the same vars the env.local file sets)
 * - `dev` → `DEV_APP_URL` / `DEV_API_URL`
 * - `qa` → `QA_APP_URL` / `QA_API_URL`
 *
 * @const {Record<Environment, EnvironmentConfig>}
 * @private
 */
const environments: Record<Environment, EnvironmentConfig> = {
    local: {
        name: 'local',
        appUrl: process.env.BASE_URL || 'http://localhost:3000',
        apiUrl: process.env.API_URL || 'http://localhost:8080/api',
        timeout: 110000,
        retries: 0,
    },
    dev: {
        name: 'dev',
        appUrl: process.env.DEV_APP_URL || 'https://dev.pet-tiger.example.com',
        apiUrl: process.env.DEV_API_URL || 'https://dev.pet-tiger.example.com/api',
        timeout: 110000,
        retries: 2,
    },
    qa: {
        name: 'qa',
        appUrl: process.env.QA_APP_URL || 'https://qa.pet-tiger.example.com',
        apiUrl: process.env.QA_API_URL || 'https://qa.pet-tiger.example.com/api',
        timeout: 110000,
        retries: 2,
    },
};

/**
 * Retrieves the configuration for a specific environment.
 *
 * Falls back to the `TEST_ENV` environment variable, then to `'local'` if no
 * argument is provided.
 *
 * @param {Environment} [env] - The target environment. Defaults to `process.env.TEST_ENV` or `'local'`
 * @returns {EnvironmentConfig} The configuration for the requested environment
 * @throws {Error} If the requested environment is not defined in the environments map
 *
 * @example
 * ```typescript
 * // Explicit environment
 * const qaConfig = getEnvironmentConfig('qa');
 * console.log(qaConfig.timeout); // 110000
 *
 * // Default from TEST_ENV or 'local'
 * const defaultConfig = getEnvironmentConfig();
 * ```
 */
export function getEnvironmentConfig(env ?: Environment): EnvironmentConfig {
    const envName = env || (process.env.TEST_ENV as Environment) || 'local';
    const config = environments[envName];
    if (!config) {
        throw new Error(
            `Unknown environment: ${envName}. Valid options: ${Object.keys(environments).join(', ')}`,
        );
    }
    return config;
}
