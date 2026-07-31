/**
 * @fileoverview Configuration property keys and helper functions for environment variable access.
 *
 * This module maps logical configuration property names to their corresponding
 * environment variable keys, providing type-safe access to framework configuration.
 * All properties are resolved via `process.env` at runtime.
 *
 * Variable names use the standard convention (`BASE_URL`, `USER_NAME`,
 * `PASSWORD`) that the CI secrets are configured against.
 *
 * Any value may be stored encrypted as `ENC(...)` — {@link getConfigValue}
 * decrypts transparently (see src/config/secrets.ts). Because every consumer in
 * the suite already reads config through this accessor, encryption required no
 * call-site changes.
 */
import { decryptIfNeeded } from './secrets';

/**
 * Enumeration of all framework configuration property keys.
 *
 * Each member maps a logical configuration name to its environment variable key.
 * Use with {@link getConfigValue} or {@link getConfigBoolean} to retrieve values.
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
    /**
     * Comma-separated recipient list (env: `EMAIL_TO`).
     *
     * Now a *fallback*: {@link ../reporting/recipients} routes per branch/trigger
     * from {@link EMAIL_RECIPIENTS_FILE} first and only falls back to this when
     * that file is missing, unreadable, or has no matching row.
     */
    EMAIL_TO = 'EMAIL_TO',
    /** Per-branch/trigger recipient routing table; CSV (env: `EMAIL_RECIPIENTS_FILE`, default `config/notifications/recipients.csv`) */
    EMAIL_RECIPIENTS_FILE = 'EMAIL_RECIPIENTS_FILE',
    /** Max size (MB) per report zip attached to the email — larger ones are dropped, keeping only the link (env: `EMAIL_MAX_ATTACHMENT_MB`) */
    EMAIL_MAX_ATTACHMENT_MB = 'EMAIL_MAX_ATTACHMENT_MB',

    /* ── Slack Notification ──────────────────────────── */

    /** Whether to post the run summary to Slack — `'yes'`/`'no'` (env: `SEND_SLACK`) */
    SEND_SLACK = 'SEND_SLACK',
    /** Slack Incoming Webhook URL (env: `SLACK_WEBHOOK_URL`) */
    SLACK_WEBHOOK_URL = 'SLACK_WEBHOOK_URL',

    /* ── Allure Report ───────────────────────────────── */

    /** "owner" label applied to every test in the Allure report (env: `ALLURE_OWNER`, default `QA`) */
    ALLURE_OWNER = 'ALLURE_OWNER',

    /* ── S3 Report Upload ────────────────────────────── */

    /** Public URL of this run's uploaded artifacts, injected by CI (env: `REPORT_S3_URL`) */
    REPORT_URL = 'REPORT_S3_URL',

    /* ── ELK Dashboard Notification ───────────────────── */

    /** Whether to push the run summary to ELK — `'yes'`/`'no'` (env: `SEND_RESULT_ELK`) */
    SEND_RESULT_ELK = 'SEND_RESULT_ELK',
    /** Elasticsearch/ELK ingest endpoint URL (env: `ELK_URL`) */
    ELK_URL = 'ELK_URL',

    /* ── Database (test-data cleanup) ────────────────── */

    /** SQL Server host[,port] for test-data cleanup (env: `DB_SERVER`, e.g. `localhost,1433`) */
    DB_SERVER = 'DB_SERVER',
    /** Client (tenant) database that holds the app's Users (env: `DB_CLIENT`) */
    DB_CLIENT = 'DB_CLIENT',
    /** Global/master database holding the cross-tenant Users rows (env: `DB_MASTER`) */
    DB_MASTER = 'DB_MASTER',
    /** Use Windows integrated auth (`sqlcmd -E`) — `'yes'`/`'no'` (env: `DB_TRUSTED`) */
    DB_TRUSTED = 'DB_TRUSTED',
    /** SQL-auth username when not using trusted auth (env: `DB_USER`) */
    DB_USER = 'DB_USER',
    /** SQL-auth password when not using trusted auth (env: `DB_PASSWORD`) */
    DB_PASSWORD = 'DB_PASSWORD',
    /** Path to the `sqlcmd` executable; defaults to `sqlcmd` on PATH (env: `SQLCMD_PATH`) */
    SQLCMD_PATH = 'SQLCMD_PATH',
    /** Master switch for DB-based test-user cleanup — `'yes'`/`'no'` (env: `DB_CLEANUP`) */
    DB_CLEANUP = 'DB_CLEANUP',

    /* ── Authentication (OAuth2 / Basic / API Key) ───── */

    /** API authentication strategy — `'oauth2'` | `'basic'` | `'apikey'` | `'none'` (env: `AUTH_TYPE`) */
    AUTH_TYPE = 'AUTH_TYPE',
    /** OAuth2 client-credentials token endpoint (env: `ACCESS_TOKEN_URL`) */
    ACCESS_TOKEN_URL = 'ACCESS_TOKEN_URL',
    /** OAuth2 client id (env: `CLIENT_ID`) */
    CLIENT_ID = 'CLIENT_ID',
    /** OAuth2 client secret (env: `CLIENT_SECRET`) */
    CLIENT_SECRET = 'CLIENT_SECRET',
    /** Basic auth username for API requests (env: `AUTH_USERNAME`) */
    AUTH_USERNAME = 'AUTH_USERNAME',
    /** Basic auth password for API requests (env: `AUTH_PASSWORD`) */
    AUTH_PASSWORD = 'AUTH_PASSWORD',
    /** API key value, sent via {@link API_KEY_HEADER} (env: `API_KEY`) */
    API_KEY = 'API_KEY',
    /** Header name the API key is sent under (env: `API_KEY_HEADER`) */
    API_KEY_HEADER = 'API_KEY_HEADER',
}

/**
 * Retrieves a string configuration value from environment variables.
 *
 * Looks up the environment variable corresponding to the given {@link ConfigProperties} key.
 * Returns the fallback value if the environment variable is not set.
 *
 * Values stored as `ENC(...)` are decrypted here (see src/config/secrets.ts), so
 * a credential can be protected at rest without touching any call site. Plaintext
 * passes through untouched, so encryption is opt-in per key.
 *
 * @throws {Error} When the value is `ENC(...)` but `SECRET_KEY` is missing or wrong
 */
export function getConfigValue(key: ConfigProperties, fallback: string = ''): string {
    const raw = process.env[key];
    if (raw === undefined) return fallback;
    return decryptIfNeeded(raw);
}

/**
 * Retrieves a boolean configuration value from environment variables.
 *
 * Interprets `'yes'`, `'true'`, and `'1'` (case-insensitive) as `true`.
 * All other values (including unset) return the fallback.
 */
export function getConfigBoolean(key: ConfigProperties, fallback: boolean = false): boolean {
    const raw = process.env[key];
    if (!raw) return fallback;
    return ['yes', 'true', '1'].includes(raw.toLowerCase());
}

/**
 * Environment label for report headers — the resolved `TEST_ENV`, tagged
 * `[ci]` when running under GitHub Actions. Distinguishes "ran against
 * local on a laptop" from "ran against local in CI" — the latter usually
 * means `TEST_ENV` wasn't set for the CI job and it fell back to the
 * `local` default, which is worth surfacing rather than hiding.
 */
export function getEnvLabel(): string {
    const env = getConfigValue(ConfigProperties.TEST_ENV, 'local');
    return process.env.CI ? `${env} [ci]` : env;
}
