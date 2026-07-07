/**
 * @fileoverview Singleton test metrics collector for per-test execution data.
 *
 * Tracks individual test run metrics including status, duration, API response time,
 * HTTP status codes, retry counts, and annotation metadata (authors, categories, tags).
 * Designed to be populated during test execution and snapshotted for reporting.
 *
 * @module context/testMetrics
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { TestMetrics } from '../context/testMetrics';
 *
 * TestMetrics.clear();
 * TestMetrics.testName = 'loginTest';
 * TestMetrics.status = 'passed';
 * TestMetrics.durationMs = 1234;
 * const snap = TestMetrics.snapshot();
 * ```
 */

/**
 * Immutable snapshot of metrics for a single test execution.
 *
 * @interface TestMetricSnapshot
 * @property {string} testName - Name of the test
 * @property {string} testFile - File path of the test
 * @property {string} project - Playwright project name
 * @property {('passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted')} status - Test outcome
 * @property {number} durationMs - Total test duration in milliseconds
 * @property {number | null} responseTimeMs - API response time (if applicable)
 * @property {number | null} httpStatusCode - HTTP status code (if applicable)
 * @property {string | null} errorMessage - Error message (if test failed)
 * @property {number} retryCount - Number of retries attempted
 * @property {string[]} authors - Test authors from annotations
 * @property {string[]} categories - Test categories from annotations
 * @property {string[]} tags - Test tags
 * @property {Date} startTime - Test start timestamp
 * @property {Date | null} endTime - Test end timestamp (null if still running)
 */
export interface TestMetricSnapshot {
    testName: string;
    testFile: string;
    project: string;
    status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
    durationMs: number;
    responseTimeMs: number | null;
    httpStatusCode: number | null;
    errorMessage: string | null;
    retryCount: number;
    authors: string[];
    categories: string[];
    tags: string[];
    startTime: Date;
    endTime: Date | null;
}

/**
 * Mutable singleton that accumulates metrics during a single test execution.
 *
 * Call {@link clear} before each test and {@link snapshot} after to capture results.
 *
 * @class TestMetricsManager
 * @private — Use the exported {@link TestMetrics} singleton instance.
 */
class TestMetricsManager {
    /** @private */
    private _testName = '';
    /** Name of the currently executing test. */
    get testName() { return this._testName; }
    set testName(value: string) { this._testName = value; }

    /** @private */
    private _testFile = '';
    /** File path of the currently executing test. */
    get testFile() { return this._testFile; }
    set testFile(value: string) { this._testFile = value; }

    /** @private */
    private _project = '';
    /** Playwright project name (e.g., `'chromium'`). */
    get project() { return this._project; }
    set project(value: string) { this._project = value; }

    /** @private */
    private _status: TestMetricSnapshot['status'] = 'passed';
    /** Test execution outcome. */
    get status() { return this._status; }
    set status(value: TestMetricSnapshot['status']) { this._status = value; }

    /** @private */
    private _durationMs = 0;
    /** Total test duration in milliseconds. */
    get durationMs() { return this._durationMs; }
    set durationMs(value: number) { this._durationMs = value; }

    /** @private */
    private _responseTimeMs: number | null = null;
    /** API response time in milliseconds (null if not an API test). */
    get responseTimeMs() { return this._responseTimeMs; }
    set responseTimeMs(value: number | null) { this._responseTimeMs = value; }

    /** @private */
    private _httpStatusCode: number | null = null;
    /** HTTP status code from the API response (null if not applicable). */
    get httpStatusCode() { return this._httpStatusCode; }
    set httpStatusCode(value: number | null) { this._httpStatusCode = value; }

    /** @private */
    private _errorMessage: string | null = null;
    /** Error message if the test failed (null for passing tests). */
    get errorMessage() { return this._errorMessage; }
    set errorMessage(value: string | null) { this._errorMessage = value; }

    /** @private */
    private _retryCount = 0;
    /** Number of retry attempts for this test. */
    get retryCount() { return this._retryCount; }
    set retryCount(value: number) { this._retryCount = value; }

    /** @private */
    private _authors: string[] = [];
    /** Authors assigned to this test via annotations. */
    get authors() { return this._authors; }
    set authors(value: string[]) { this._authors = value; }

    /** @private */
    private _categories: string[] = [];
    /** Categories assigned to this test (e.g., `['SMOKE', 'REGRESSION']`). */
    get categories() { return this._categories; }
    set categories(value: string[]) { this._categories = value; }

    /** @private */
    private _tags: string[] = [];
    /** Arbitrary tags attached to the test. */
    get tags() { return this._tags; }
    set tags(value: string[]) { this._tags = value; }

    /** @private */
    private _startTime: Date = new Date();
    /** When the test started executing. */
    get startTime() { return this._startTime; }
    set startTime(value: Date) { this._startTime = value; }

    /** @private */
    private _endTime: Date | null = null;
    /** When the test finished executing (null if still running). */
    get endTime() { return this._endTime; }
    set endTime(value: Date | null) { this._endTime = value; }

    /**
     * Resets all metric fields to their default values.
     * Should be called at the start of each test (typically in `beforeEach`).
     */
    clear(): void {
        this._testName = '';
        this._testFile = '';
        this._project = '';
        this._status = 'passed';
        this._durationMs = 0;
        this._responseTimeMs = null;
        this._httpStatusCode = null;
        this._errorMessage = null;
        this._retryCount = 0;
        this._authors = [];
        this._categories = [];
        this._tags = [];
        this._startTime = new Date();
        this._endTime = null;

    }

    /**
     * Creates an immutable snapshot of the current test metrics.
     * Arrays are shallow-copied to prevent external mutation.
     *
     * @returns {TestMetricSnapshot} Snapshot of all current metric values
     */
    snapshot(): TestMetricSnapshot {
        return {
            testName: this._testName,
            testFile: this._testFile,
            project: this._project,
            status: this._status,
            durationMs: this._durationMs,
            responseTimeMs: this._responseTimeMs,
            httpStatusCode: this._httpStatusCode,
            errorMessage: this._errorMessage,
            retryCount: this._retryCount,
            authors: [...this._authors],
            categories: [...this._categories],
            tags: [...this._tags],
            startTime: this._startTime,
            endTime: this._endTime,

        };
    }
}

/**
 * Pre-initialized singleton instance of the test metrics manager.
 *
 * @const {TestMetricsManager}
 *
 * @example
 * ```typescript
 * import { TestMetrics } from '../context/testMetrics';
 *
 * TestMetrics.clear();
 * TestMetrics.testName = 'searchProducts';
 * TestMetrics.status = 'passed';
 * TestMetrics.durationMs = 2345;
 * const metrics = TestMetrics.snapshot();
 * ```
 */
export const TestMetrics = new TestMetricsManager();