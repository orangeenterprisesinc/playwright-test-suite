/**
 * @fileoverview Configuration property keys and helper functions for environment variable access.
 *
 * This module maps logical configuration property names to their corresponding
 * environment variable keys, providing type-safe access to framework configuration.
 * All properties are resolved via `process.env` at runtime.
 *
 * @module enums/configProperties
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { ConfigProperties, getConfigValue, getConfigBoolean } from '../enums/configProperties';
 *
 * const baseUrl = getConfigValue(ConfigProperties.APP_URL, 'http://localhost:3000');
 * const shouldRetry = getConfigBoolean(ConfigProperties.RETRY, false);
 * ```
 */

/**
 * Enumeration of all framework configuration property keys.
 *
 * Each member maps a logical configuration name to its environment variable key.
 * Use with {@link getConfigValue} or {@link getConfigBoolean} to retrieve values.
 *
 * @enum {string}
 */
export enum ConfigProperties {
    /* ── Application URLs ────────────────────────────── */

    /** Base URL for the web application (env: `BASE_URL`) */
    APP_URL = 'BASE_URL',
    /** Base URL for the API server (env: `API_URL`) */
    API_URL = 'API_URL',

    APP_USERNAME = 'APP_USERNAME',
    APP_PASSWORD = 'APP_PASSWORD',

    /* ── Runtime Configuration ───────────────────────── */

    /** Current environment identifier (env: `ENV`) */
    ENV = 'ENV',
    /** Current test environment identifier (env: `TEST_ENV`) */
    TEST_ENV = 'TEST_ENV',
    /** Execution mode — `'local'` or `'remote'` (env: `RUN_MODE`) */
    RUN_MODE = 'RUN_MODE',
    /** Whether to override existing report files — `'yes'` or `'no'` (env: `OVERRIDE_REPORTS`) */
    OVERRIDE_REPORTS = 'OVERRIDE_REPORTS',
    /** Whether to enable test retries (env: `RETRY`) */
    RETRY = 'RETRY',
    /** Whether to log API response bodies (env: `LOG_RESPONSE`) */
    LOG_RESPONSE = 'LOG_RESPONSE',

    /* ── Authentication ──────────────────────────────── */

    /** Authentication type — e.g., `'oauth2'`, `'basic'`, `'apikey'` (env: `AUTH_TYPE`) */
    AUTH_TYPE = 'AUTH_TYPE',
    /** OAuth2 token endpoint URL (env: `ACCESS_TOKEN_URL`) */
    ACCESS_TOKEN_URL = 'ACCESS_TOKEN_URL',
    /** OAuth2 client ID (env: `CLIENT_ID`) */
    CLIENT_ID = 'CLIENT_ID',
    /** OAuth2 client secret (env: `CLIENT_SECRET`) */
    CLIENT_SECRET = 'CLIENT_SECRET',
    /** OAuth2 scope (env: `SCOPE`) */
    SCOPE = 'SCOPE',
    /** OAuth2 audience (env: `AUDIENCE`) */
    AUDIENCE = 'AUDIENCE',
    /** Authorization header prefix — e.g., `'Bearer'` (env: `AUTH_PREFIX`) */
    AUTH_PREFIX = 'AUTH_PREFIX',
    /** api login username (env: `USERNAME`) */
    AUTH_USERNAME = 'AUTH_USERNAME',
    /** api login password (env: `PASSWORD`) */
    AUTH_PASSWORD = 'AUTH_PASSWORD',
    /** API key for API key authentication (env: `API_KEY`) */
    API_KEY = 'API_KEY',


    BASIC_AUTH_USERNAME = 'BASIC_AUTH_USERNAME',    
    BASIC_AUTH_PASSWORD = 'BASIC_AUTH_PASSWORD',
    /* ── HTTP Headers ────────────────────────────────── */

    /** Default Accept header value (env: `ACCEPT_HEADER`) */
    ACCEPT_HEADER = 'ACCEPT_HEADER',
    /** Default Content-Type header value (env: `CONTENT_TYPE_HEADER`) */
    CONTENT_TYPE_HEADER = 'CONTENT_TYPE_HEADER',

    /* ── Database ────────────────────────────────────── */

    /** Path to the audit log SQLite database (env: `AUDIT_LOG_DB`) */
    AUDIT_LOG_DB = 'AUDIT_LOG_DB',
    /** Database host for remote connections (env: `DB_HOST`) */
    DB_HOST = 'DB_HOST',
    /** Database port for remote connections (env: `DB_PORT`) */
    DB_PORT = 'DB_PORT',
    /** Database username (env: `DB_USER`) */
    DB_USER = 'DB_USER',
    /** Database password (env: `DB_PASSWORD`) */
    DB_PASSWORD = 'DB_PASSWORD',
    /** Database name (env: `DB_NAME`) */
    DB_NAME = 'DB_NAME',


        /* ── Dev Database ─────────────────────────────────── */

    /** Dev database host (env: `DEV_DB_HOST`) */
    DEV_DB_HOST = 'DEV_DB_HOST',
    /** Dev database port (env: `DEV_DB_PORT`) */
    DEV_DB_PORT = 'DEV_DB_PORT',
    /** Dev database username (env: `DEV_DB_USER`) */
    DEV_DB_USER = 'DEV_DB_USER',
    /** Dev database password (env: `DEV_DB_PASSWORD`) */
    DEV_DB_PASSWORD = 'DEV_DB_PASSWORD',
    /** Dev database schema name (env: `DEV_DB_NAME`) */
    DEV_DB_NAME = 'DEV_DB_NAME',

    /* ── Reporting & Integrations ────────────────────── */

    /** Elasticsearch URL for ELK dashboard integration (env: `ELASTICSEARCH_URL`) */
    ELASTICSEARCH_URL = 'ELASTICSEARCH_URL',
    /** Whether to send results to ELK — `'yes'` or `'no'` (env: `SEND_RESULT_ELK`) */
    SEND_RESULT_ELK = 'SEND_RESULT_ELK',

    /* ── CI/CD ───────────────────────────────────────── */

    /** CI pipeline identifier (env: `CI_PIPELINE_ID`) */
    CI_PIPELINE_ID = 'CI_PIPELINE_ID',
    /** CI commit branch/ref name (env: `CI_COMMIT_REF_NAME`) */
    CI_COMMIT_REF_NAME = 'CI_COMMIT_REF_NAME',

    /* ── Framework Metadata ──────────────────────────── */

    /** Name of the service being tested (env: `SERVICE_NAME`) */
    SERVICE_NAME = 'SERVICE_NAME',
}

/**
 * Retrieves a string configuration value from environment variables.
 *
 * Looks up the environment variable corresponding to the given {@link ConfigProperties} key.
 * Returns the fallback value if the environment variable is not set.
 *
 * @param {ConfigProperties} key - The configuration property key to look up
 * @param {string} [fallback=''] - Default value if the environment variable is not set
 * @returns {string} The environment variable value, or the fallback
 *
 * @example
 * ```typescript
 * // Returns process.env.BASE_URL or 'http://localhost:3000' if not set
 * const appUrl = getConfigValue(ConfigProperties.APP_URL, 'http://localhost:3000');
 *
 * // Returns process.env.ENV or empty string if not set
 * const env = getConfigValue(ConfigProperties.ENV);
 * ```
 */
export function getConfigValue(key: ConfigProperties, fallback: string = ''): string {
    return process.env[key] ?? fallback;
}

/**
 * Retrieves a boolean configuration value from environment variables.
 *
 * Interprets `'yes'`, `'true'`, and `'1'` (case-insensitive) as `true`.
 * All other values (including unset) return the fallback.
 *
 * @param {ConfigProperties} key - The configuration property key to look up
 * @param {boolean} [fallback=false] - Default value if the environment variable is not set
 * @returns {boolean} The interpreted boolean value, or the fallback
 *
 * @example
 * ```typescript
 * // Returns true if process.env.RETRY is 'yes', 'true', or '1'
 * const shouldRetry = getConfigBoolean(ConfigProperties.RETRY, false);
 *
 * // Returns true if process.env.SEND_RESULT_ELK is 'yes'
 * const sendToElk = getConfigBoolean(ConfigProperties.SEND_RESULT_ELK);
 * ```
 */
export function getConfigBoolean(key: ConfigProperties, fallback: boolean = false): boolean {
    const raw = process.env[key];
    if (!raw) return fallback;
    return ['yes', 'true', '1'].includes(raw.toLowerCase());
}
