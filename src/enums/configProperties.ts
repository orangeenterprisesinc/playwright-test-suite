/**
 * @fileoverview Configuration property keys and helper functions for environment variable access.
 *
 * This module maps logical configuration property names to their corresponding
 * environment variable keys, providing type-safe access to framework configuration.
 * All properties are resolved via `process.env` at runtime.
 *
 * Variable names follow the original demo framework's convention
 * (`BASE_URL`, `USER_NAME`, `PASSWORD`) so the existing CI secrets keep
 * working unchanged.
 *
 * @module enums/configProperties
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { ConfigProperties, getConfigValue, getConfigBoolean } from '../enums/configProperties';
 *
 * const baseUrl = getConfigValue(ConfigProperties.APP_URL, 'http://localhost:3000');
 * const userName = getConfigValue(ConfigProperties.USER_NAME);
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

    /* ── Application Login ───────────────────────────── */

    /** Application login username (env: `USER_NAME`) */
    USER_NAME = 'USER_NAME',
    /** Application login password (env: `PASSWORD`) */
    PASSWORD = 'PASSWORD',

    /* ── Runtime Configuration ───────────────────────── */

    /** Current test environment identifier (env: `TEST_ENV`) */
    TEST_ENV = 'TEST_ENV',
    /** Retry count override (env: `RETRY`) */
    RETRY = 'RETRY',
    /** Active test data source — `'json'` or `'csv'` (env: `TEST_DATA_SOURCE`) */
    TEST_DATA_SOURCE = 'TEST_DATA_SOURCE',

    /* ── Email Notification ──────────────────────────── */

    /** Whether to email the run summary — `'yes'`/`'no'` (env: `SEND_EMAIL`) */
    SEND_EMAIL = 'SEND_EMAIL',
    /** SMTP server host (env: `SMTP_HOST`) */
    SMTP_HOST = 'SMTP_HOST',
    /** SMTP server port — 587 STARTTLS / 465 TLS (env: `SMTP_PORT`) */
    SMTP_PORT = 'SMTP_PORT',
    /** SMTP username (env: `SMTP_USER`) */
    SMTP_USER = 'SMTP_USER',
    /** SMTP password / app password (env: `SMTP_PASSWORD`) */
    SMTP_PASSWORD = 'SMTP_PASSWORD',
    /** Sender address (env: `EMAIL_FROM`) */
    EMAIL_FROM = 'EMAIL_FROM',
    /** Comma-separated recipient list (env: `EMAIL_TO`) */
    EMAIL_TO = 'EMAIL_TO',
    /** Max size (MB) per report zip attached to the email — larger ones are dropped, keeping only the link (env: `EMAIL_MAX_ATTACHMENT_MB`) */
    EMAIL_MAX_ATTACHMENT_MB = 'EMAIL_MAX_ATTACHMENT_MB',

    /* ── Slack Notification ──────────────────────────── */

    /** Whether to post the run summary to Slack — `'yes'`/`'no'` (env: `SEND_SLACK`) */
    SEND_SLACK = 'SEND_SLACK',
    /** Slack Incoming Webhook URL (env: `SLACK_WEBHOOK_URL`) */
    SLACK_WEBHOOK_URL = 'SLACK_WEBHOOK_URL',
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
 * ```
 */
export function getConfigBoolean(key: ConfigProperties, fallback: boolean = false): boolean {
    const raw = process.env[key];
    if (!raw) return fallback;
    return ['yes', 'true', '1'].includes(raw.toLowerCase());
}
