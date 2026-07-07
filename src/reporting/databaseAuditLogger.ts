/**
 * @fileoverview Database audit logger for persisting test execution results.
 *
 * Writes test run outcomes (pass/fail, response time, HTTP status, etc.) into a
 * MySQL audit table via the centralised {@link getConnection} from
 * `databaseConnectionManager`. Logging is gated by the
 * {@link ConfigProperties.AUDIT_LOG_DB} config flag.
 *
 * @module reporting/databaseAuditLogger
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { logResult, closePool } from '@reporting/databaseAuditLogger';
 *
 * await logResult({
 *   runId: 'run-001', iterationId: 1,
 *   serviceName: 'UserAPI', testCaseName: 'Login Test',
 *   status: 'PASS', environment: 'dev',
 * });
 * ```
 */
import {Logger} from '../utils/logger';
import {ConfigProperties, getConfigBoolean, getConfigValue} from '../enums/configProperties';
import {FrameworkConstants} from '../constants/frameworkConstants';
import {getConnection} from '../utils/databaseConnectionManager';

/** @private Logger instance for audit operations */
const logger = new Logger('DatabaseAuditLogger');

/**
 * Checks whether database audit logging is enabled via configuration.
 *
 * @returns {boolean} `true` if the `AUDIT_LOG_DB` config property is enabled
 * @private
 */
function isAuditEnabled(): boolean {
    const enabled = getConfigBoolean(ConfigProperties.AUDIT_LOG_DB, false);
    if (!enabled) return false;
    const runMode = getConfigValue(ConfigProperties.RUN_MODE, 'remote').toLowerCase();
    return runMode === 'remote';
}

/**
 * Retrieves a database connection via the centralised databaseConnectionManager
 * instead of maintaining a separate pool.
 *
 * @returns {Promise<unknown>} The database connection, or `null` if unavailable
 * @private
 */
async function getPool(): Promise<unknown> {
    try {
        return await getConnection();
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to get database connection for audit logging: ${msg}`);
        return null;
    }
}


/**
 * Persists a test execution result into the `automation_execution_logs.qe_open_collection_execution_log` audit table.
 *
 * Silently no-ops when audit logging is disabled or the database connection is unavailable.
 *
 * @param {object} params - Test result parameters
 * @param {string} params.runId           - Unique identifier for the test run
 * @param {number} params.iterationId     - Iteration/retry number
 * @param {string} params.serviceName     - Name of the service under test
 * @param {string} params.testCaseName    - Name of the test case
 * @param {string} params.status          - Result status (e.g., 'PASS', 'FAIL')
 * @param {string} params.environment     - Target environment
 * @param {Date}   [params.executionTime] - Timestamp of execution (defaults to now)
 * @param {number|null} [params.responseTimeMs]  - Response time in milliseconds
 * @param {number|null} [params.httpStatusCode]  - HTTP status code
 * @param {string} [params.buildVersion]  - Build/release version
 * @param {string} [params.triggeredBy]   - Who or what triggered the test
 * @param {string} [params.errorMessage]  - Error message for failed tests
 * @returns {Promise<void>}
 *
 * @example
 * ```typescript
 * await logResult({
 *   runId: 'run-abc', iterationId: 1,
 *   serviceName: 'AuthService', testCaseName: 'Login Happy Path',
 *   status: 'PASS', environment: 'staging',
 *   responseTimeMs: 245, httpStatusCode: 200,
 * });
 * ```
 */
export async function logResult(params: {
    runId: string;
    iterationId: number;
    serviceName: string;
    testCaseName: string;
    status: string;
    environment: string;
    executionTime?: Date;
    responseTimeMs?: number | null;
    httpStatusCode?: number | null;
    buildVersion?: string;
    triggeredBy?: string;
    errorMessage?: string;
}): Promise<void> {
    if (!isAuditEnabled()) return;

    const db = await getPool();
    if (!db) return;

    const insertQuery = `
        INSERT INTO \`automation_execution_logs\`.\`qe_open_collection_execution_log\`
        (\`runId\`, \`iterationId\`, \`serviceName\`, \`testCaseName\`, \`status\`,
         \`environment\`, \`executionTime\`, \`responseTimeMs\`, \`httpStatusCode\`,
         \`buildVersion\`, \`triggeredBy\`, \`errorMessage\`)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const env = params.environment || FrameworkConstants.BRANCH_NAME;
    const execTime = params.executionTime ?? new Date();

    const values = [
        params.runId,
        params.iterationId,
        params.serviceName,
        params.testCaseName,
        params.status,
        env,
        execTime,
        params.responseTimeMs ?? null,
        params.httpStatusCode ?? null,
        params.buildVersion ?? '',
        params.triggeredBy ?? '',
        params.errorMessage ?? '',
    ];

    try {
        const conn = db as { execute: (sql: string, values: unknown[]) => Promise<unknown> };
        await conn.execute(insertQuery, values);
        logger.info(`Audit log inserted for "${params.testCaseName}" [${params.status}]`);
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Could not store test result in database: ${msg}`);
    }
}

/**
 * No-op: pool lifecycle is now managed by databaseConnectionManager.closeConnection().
 * Kept for backward-compatibility with global-teardown.ts.
 */
export async function closePool(): Promise<void> {
    logger.info('closePool() is a no-op — pool is managed by databaseConnectionManager');
}
