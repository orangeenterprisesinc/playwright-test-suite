/**
 * @fileoverview Framework-wide constants including paths, service metadata, and helper methods.
 *
 * Provides a frozen, immutable object ({@link FrameworkConstants}) containing all directory paths,
 * file paths, service names, and utility methods used across the framework. Values are resolved
 * once at module load time from `process.cwd()` and environment variables.
 *
 * @module constants/frameworkConstants
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { FrameworkConstants } from '../constants/frameworkConstants';
 *
 * console.log(FrameworkConstants.PROJECT_ROOT);    // '/path/to/project'
 * console.log(FrameworkConstants.BRANCH_NAME);     // 'main' | 'dev-qe' | 'local' | ...
 * console.log(FrameworkConstants.getReportPath('LoginTest'));
 * ```
 */
import path from 'path';
import {ConfigProperties, getConfigValue} from '../enums/configProperties';

/** Absolute path to the project root directory (resolved from `process.cwd()`). */
const PROJECT_ROOT = process.cwd();

/**
 * Generates a formatted date-time string for the current moment.
 *
 * @returns {string} Date-time in `YYYY-MM-DD_HH-MM-SS` format
 * @private
 */
function todayDateTime(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

/**
 * Frozen object containing all framework-level constants, directory paths,
 * and utility methods.
 *
 * All path properties are absolute paths resolved from the project root.
 * Dynamic getters (`BRANCH_NAME`, `ENVIRONMENT`) are evaluated on each access
 * to reflect the latest environment variable state.
 *
 * @const {Readonly<object>} FrameworkConstants
 *
 * @property {string} PROJECT_ROOT - Absolute path to the project root
 * @property {string} SRC_DIR - Absolute path to `src/`
 * @property {string} TEST_DIR - Absolute path to `tests/`
 * @property {string} DATA_DIR - Absolute path to `src/data/`
 * @property {string} EXTENT_REPORT_DIR - Extent report output directory
 * @property {string} TEST_RESULTS_DIR - Test results output directory
 * @property {string} SCREENSHOTS_DIR - Screenshots output directory
 * @property {string} ALLURE_RESULTS_DIR - Allure results directory
 * @property {string} RUNNER_LIST_PATH - Path to `runnerList.json`
 * @property {string} TEST_DATA_JSON - Path to JSON test data file
 * @property {string} TEST_DATA_CSV - Path to CSV test data file
 * @property {string} TEST_DATA_EXCEL - Path to Excel test data file
 * @property {string} TEST_DATA_DB - Path to SQLite test data file
 * @property {string} ENV_FILE - Path to `.env` file
 * @property {string} SERVICE_NAME - Name of the service under test
 * @property {string} TODAY_DATE_TIME - Formatted date-time snapshot at module load
 * @property {string} BRANCH_NAME - Current CI/CD branch name (dynamic getter)
 * @property {string} ENVIRONMENT - Current environment name (dynamic getter)
 * @property {number} MAX_RESPONSE_TIME_MS - Maximum acceptable API response time (2000ms)
 *
 * @example
 * ```typescript
 * // Access directory paths
 * const dataDir = FrameworkConstants.DATA_DIR;
 *
 * // Access dynamic properties
 * const branch = FrameworkConstants.BRANCH_NAME; // e.g., 'main' or 'local'
 * const env = FrameworkConstants.ENVIRONMENT;     // e.g., 'dev' or 'dry-run'
 *
 * // Generate report path
 * const reportPath = FrameworkConstants.getReportPath('LoginTest');
 * ```
 */
export const FrameworkConstants = Object.freeze({
    /** Absolute path to the project root directory. */
    PROJECT_ROOT,
    /** Absolute path to the `src/` directory. */
    SRC_DIR: path.join(PROJECT_ROOT, 'src'),
    /** Absolute path to the `tests/` directory. */
    TEST_DIR: path.join(PROJECT_ROOT, 'tests'),
    /** Absolute path to the `src/data/` directory. */
    DATA_DIR: path.join(PROJECT_ROOT, 'src', 'data'),
    /** Absolute path to the extent report output directory. */
    EXTENT_REPORT_DIR: path.join(PROJECT_ROOT, 'extent-test-output'),
    /** Absolute path to the test results directory. */
    TEST_RESULTS_DIR: path.join(PROJECT_ROOT, 'test-results'),
    /** Absolute path to the screenshots directory. */
    SCREENSHOTS_DIR: path.join(PROJECT_ROOT, 'test-results', 'screenshots'),
    /** Absolute path to the Allure results directory. */
    ALLURE_RESULTS_DIR: path.join(PROJECT_ROOT, 'allure-results'),
    /** Absolute path to the runner list JSON file. */
    RUNNER_LIST_PATH: path.join(PROJECT_ROOT, 'src', 'data', 'runnerManager.json'),
    /** Absolute path to the JSON test data file. */
    TEST_DATA_JSON: path.join(PROJECT_ROOT, 'src', 'data', 'runnerManager.json'),
    /** Absolute path to the CSV test data file. */
    TEST_DATA_CSV: path.join(PROJECT_ROOT, 'src', 'data', 'runnerManager.csv'),
    /** Absolute path to the Excel test data file. */
    TEST_DATA_EXCEL: path.join(PROJECT_ROOT, 'src', 'data', 'runnerManager.xlsx'),
    /** Absolute path to the SQLite test data file. */
    TEST_DATA_DB: path.join(PROJECT_ROOT, 'src', 'data', 'runnerManager.db'),
    /** Absolute path to the `.env` file. */
    ENV_FILE: path.join(PROJECT_ROOT, '.env'),
    /** Name of the service under test (from `SERVICE_NAME` env var or default). */
    SERVICE_NAME: getConfigValue(ConfigProperties.SERVICE_NAME, 'Playwright-POM-Framework'),
    /** Formatted date-time string captured at module load time (`YYYY-MM-DD_HH-MM-SS`). */
    TODAY_DATE_TIME: todayDateTime(),

    /**
     * The current Git branch name, resolved from CI environment variables.
     *
     * Checks `CI_COMMIT_REF_NAME` (GitLab) and `GITHUB_REF_NAME` (GitHub Actions).
     * Falls back to `'local'` if not running in CI or if the branch is not in the allowed list.
     *
     * @returns {string} One of `'main'`, `'dev-qe'`, `'dry-run'`, `'staging'`, or `'local'`
     */
    get BRANCH_NAME(): string {
        const ref = process.env.CI_COMMIT_REF_NAME || process.env.GITHUB_REF_NAME || 'local';
        const allowed = ['main', 'dev-qe', 'dry-run', 'staging'];
        return allowed.includes(ref) ? ref : 'local';
    },

    /**
     * The current deployment environment, resolved from the `ENV` environment variable.
     *
     * @returns {string} Environment name (e.g., `'dev'`, `'stag'`, `'prod'`) or `'dry-run'` as default
     */
    get ENVIRONMENT(): string {
        return (
            getConfigValue(ConfigProperties.TEST_ENV, '') ||
            getConfigValue(ConfigProperties.ENV, 'dry-run')
        );
    },

    /**
     * Generates the file path for an HTML test report.
     *
     * When override is enabled, reports use a fixed filename. Otherwise, reports
     * are organized into timestamped subdirectories.
     *
     * @param {string} [className=''] - Test class or suite name for the report filename
     * @param {boolean} [override] - Force override mode; defaults to the `OVERRIDE_REPORTS` config value
     * @returns {string} Absolute path to the report HTML file
     *
     * @example
     * ```typescript
     * // With override: 'result-test-output/Playwright-POM-Framework_Report.html'
     * const path1 = FrameworkConstants.getReportPath('LoginTest', true);
     *
     * // Without override: 'result-test-output/2024-01-15_10-30-00/LoginTest_Automation_Report.html'
     * const path2 = FrameworkConstants.getReportPath('LoginTest', false);
     * ```
     */
    getReportPath(className: string = '', override?: boolean): string {
        const shouldOverride =
            override ??
            getConfigValue(ConfigProperties.OVERRIDE_REPORTS, 'yes').toLowerCase() === 'yes';
        const reportDir = path.join(PROJECT_ROOT, 'result-test-output');

        if (shouldOverride) {
            return path.join(reportDir, `${FrameworkConstants.SERVICE_NAME}_Report.html`);
        }
        return path.join(reportDir, todayDateTime(), `${className}_Automation_Report.html`);
    },

    /**
     * Generates the file path for saving API response output.
     *
     * @param {string} endpointName - Name or identifier for the API endpoint
     * @param {('JSON' | 'XML' | 'TXT')} [responseType='JSON'] - Response format/extension
     * @returns {string} Absolute path to the response output file
     *
     * @example
     * ```typescript
     * const jsonPath = FrameworkConstants.getResponseOutputPath('getUsers');
     * // 'response-test-output/getUsers.json'
     *
     * const xmlPath = FrameworkConstants.getResponseOutputPath('getUsers', 'XML');
     * // 'response-test-output/getUsers.xml'
     * ```
     */
    getResponseOutputPath(
        endpointName: string,
        responseType: 'JSON' | 'XML' | 'TXT' = 'JSON',
    ): string {
        const ext = responseType.toLowerCase();
        return path.join(PROJECT_ROOT, 'response-test-output', `${endpointName}.${ext}`);
    },

    /** Maximum acceptable API response time in milliseconds (default: 2000ms). */
    MAX_RESPONSE_TIME_MS: 2000,
});
