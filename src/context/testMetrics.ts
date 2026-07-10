/**
 * @fileoverview Per-worker singleton test metrics collector.
 *
 * Tracks the currently-executing test's status, duration, API response time,
 * HTTP status code, retry count, and annotation metadata (authors/categories/tags).
 * Safe as a singleton because Playwright workers run one test at a time.
 *
 * @module context/testMetrics
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

class TestMetricsManager {
    testName = '';
    testFile = '';
    project = '';
    status: TestMetricSnapshot['status'] = 'passed';
    durationMs = 0;
    responseTimeMs: number | null = null;
    httpStatusCode: number | null = null;
    errorMessage: string | null = null;
    retryCount = 0;
    authors: string[] = [];
    categories: string[] = [];
    tags: string[] = [];
    startTime: Date = new Date();
    endTime: Date | null = null;

    /** Resets all fields to their defaults. Call at the start of each test. */
    clear(): void {
        this.testName = '';
        this.testFile = '';
        this.project = '';
        this.status = 'passed';
        this.durationMs = 0;
        this.responseTimeMs = null;
        this.httpStatusCode = null;
        this.errorMessage = null;
        this.retryCount = 0;
        this.authors = [];
        this.categories = [];
        this.tags = [];
        this.startTime = new Date();
        this.endTime = null;
    }

    /** Immutable snapshot of the current metrics (arrays shallow-copied). */
    snapshot(): TestMetricSnapshot {
        return {
            testName: this.testName,
            testFile: this.testFile,
            project: this.project,
            status: this.status,
            durationMs: this.durationMs,
            responseTimeMs: this.responseTimeMs,
            httpStatusCode: this.httpStatusCode,
            errorMessage: this.errorMessage,
            retryCount: this.retryCount,
            authors: [...this.authors],
            categories: [...this.categories],
            tags: [...this.tags],
            startTime: this.startTime,
            endTime: this.endTime,
        };
    }
}

export const TestMetrics = new TestMetricsManager();
