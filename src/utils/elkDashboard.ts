/**
 * @fileoverview ELK (Elasticsearch) integration for test result reporting.
 *
 * Pushes individual test-case results to an Elasticsearch endpoint when the
 * framework is configured for remote execution and ELK reporting is enabled.
 *
 * @module utils/elkDashboard
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { sendResultToElk, pushTestMetricToElk } from '@utils/elkDashboard';
 *
 * await sendResultToElk('Login Test', 'PASSED', { durationMs: 1200 });
 * ```
 */
import { Logger } from './logger';
import { ConfigProperties, getConfigValue } from '../enums/configProperties';

const logger = new Logger('ELKDashboard');

/**
 * Document shape pushed to the Elasticsearch index.
 *
 * @interface ElkDocument
 * @property {string} testcasename - Test case name
 * @property {string} status - Pass / fail / skip status
 * @property {string} executionTime - ISO-8601 timestamp
 * @property {number} [durationMs] - Duration in milliseconds
 * @property {number | null} [httpStatusCode] - HTTP status code (if applicable)
 * @property {string} [environment] - Target environment
 * @property {string} [branch] - Git branch
 * @property {string} [runId] - Unique run identifier
 */
interface ElkDocument {
    testcasename: string;
    status: string;
    executionTime: string;
    durationMs?: number;
    httpStatusCode?: number | null;
    environment?: string;
    branch?: string;
    runId?: string;
}

/**
 * Checks whether ELK reporting is enabled (requires `SEND_RESULT_ELK=yes` + `RUN_MODE=remote`).
 * @returns {boolean}
 * @private
 */
function isElkEnabled(): boolean {
    const sendResult = getConfigValue(ConfigProperties.SEND_RESULT_ELK, 'no');
    const runMode = getConfigValue(ConfigProperties.RUN_MODE, 'local');
    return sendResult.toLowerCase() === 'yes' && runMode.toLowerCase() === 'remote';
}

/**
 * Pushes a single test result document to the configured Elasticsearch URL.
 *
 * Silently returns if ELK is disabled or the URL is not configured.
 *
 * @param {string} testCaseName - Name of the test case
 * @param {string} status - Result status (e.g. `'PASSED'`, `'FAILED'`)
 * @param {Partial<Omit<ElkDocument, 'testcasename'|'status'|'executionTime'>>} [extras={}] - Additional fields
 */
export async function sendResultToElk(
    testCaseName: string,
    status: string,
    extras: Partial<Omit<ElkDocument, 'testcasename' | 'status' | 'executionTime'>> = {},
): Promise<void> {
    if (!isElkEnabled()) {
        return;
    }

    const elasticUrl = getConfigValue(ConfigProperties.ELASTICSEARCH_URL, '');
    if (!elasticUrl) {
        logger.warn('ELASTICSEARCH_URL is not configured — skipping ELK push');
        return;
    }

    const document: ElkDocument = {
        testcasename: testCaseName,
        status,
        executionTime: new Date().toISOString(),
        ...extras,
    };

    try {
        const response = await fetch(elasticUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(document),
        });

        if (response.status === 201) {
            logger.info(`ELK push OK for "${testCaseName}" → ${status}`);
        } else {
            const body = await response.text().catch(() => '');
            logger.warn(
                `ELK push returned HTTP ${response.status} (expected 201) for "${testCaseName}": ${body}`,
            );
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`ELK push failed for "${testCaseName}": ${msg}`);
    }
}

/**
 * Convenience wrapper that maps a test metric snapshot into an ELK document.
 *
 * @param {object} snapshot - Test execution snapshot
 * @param {string} [runId] - Run identifier
 * @param {string} [environment] - Target environment
 * @param {string} [branch] - Git branch name
 */
export async function pushTestMetricToElk(
    snapshot: {
        testName: string;
        status: string;
        durationMs?: number;
        httpStatusCode?: number | null;
    },
    runId?: string,
    environment?: string,
    branch?: string,
): Promise<void> {
    await sendResultToElk(snapshot.testName, snapshot.status, {
        durationMs: snapshot.durationMs,
        httpStatusCode: snapshot.httpStatusCode,
        runId,
        environment,
        branch,
    });
}
