/**
 * @fileoverview Test flakiness detection and scoring.
 *
 * {@link FlakinessDetector} records per-test pass/fail results and computes a
 * flakiness score (0–100). Tests with pass rates between 10 % and 90 % are
 * flagged as flaky.
 *
 * @module utils/flakinessDetector
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { FlakinessDetector } from '@utils/flakinessDetector';
 *
 * const detector = new FlakinessDetector();
 * detector.recordResult('Login Test', true, 1200);
 * detector.recordResult('Login Test', false, 1100, 'timeout');
 * console.log(detector.getFlakyTests());
 * ```
 */

/**
 * Single test execution record.
 *
 * @interface TestResult
 * @property {string} testName - Name of the test
 * @property {boolean} passed - Whether the execution passed
 * @property {number} duration - Execution duration in ms
 * @property {Date} timestamp - When the result was recorded
 * @property {string} [error] - Error message when failed
 */
export interface TestResult {
    testName: string;
    passed: boolean;
    duration: number;
    timestamp: Date;
    error?: string;
}

/**
 * Aggregated flakiness metrics for a test.
 *
 * @interface FlakinessMetrics
 * @property {string} testName - Name of the test
 * @property {number} totalRuns - Total number of executions recorded
 * @property {number} passCount - Number of passes
 * @property {number} failCount - Number of failures
 * @property {number} passRate - Ratio of passes to total runs (0–1)
 * @property {number} flakinessScore - Score from 0 (stable) to 100 (maximally flaky)
 * @property {number} avgDuration - Mean execution duration in ms
 * @property {Date} lastRun - Timestamp of the most recent execution
 */
export interface FlakinessMetrics {
    testName: string;
    totalRuns: number;
    passCount: number;
    failCount: number;
    passRate: number;
    flakinessScore: number;
    avgDuration: number;
    lastRun: Date;
}

/**
 * Tracks test execution results and calculates flakiness scores.
 *
 * @class FlakinessDetector
 */
export class FlakinessDetector {
    /** @private Per-test result history */
    private results: Map<string, TestResult[]> = new Map();

    /**
     * Records a single test execution result.
     *
     * @param {string} testName - Name of the test
     * @param {boolean} passed - Whether it passed
     * @param {number} [duration=0] - Execution duration in ms
     * @param {string} [error] - Error message if failed
     */
    recordResult(testName: string, passed: boolean, duration: number = 0, error?: string): void {
        if (!this.results.has(testName)) this.results.set(testName, []);
        this.results
            .get(testName)!
            .push({ testName, passed, duration, timestamp: new Date(), error });
    }

    /**
     * Computes flakiness metrics for a specific test.
     *
     * @param {string} testName - Name of the test
     * @returns {FlakinessMetrics | null} Metrics, or `null` if no results exist
     */
    getMetrics(testName: string): FlakinessMetrics | null {
        const testResults = this.results.get(testName);
        if (!testResults || testResults.length === 0) return null;
        const passCount = testResults.filter((r) => r.passed).length;
        const failCount = testResults.length - passCount;
        const passRate = passCount / testResults.length;
        const avgDuration =
            testResults.reduce((sum, r) => sum + r.duration, 0) / testResults.length;
        const flakinessScore = 100 - Math.abs(passRate - 0.5) * 2 * 100;
        return {
            testName,
            totalRuns: testResults.length,
            passCount,
            failCount,
            passRate,
            flakinessScore,
            avgDuration,
            lastRun: testResults[testResults.length - 1].timestamp,
        };
    }

    /**
     * Returns metrics for all tests flagged as flaky (pass rate between 10 % and 90 %),
     * sorted by descending flakiness score.
     *
     * @returns {FlakinessMetrics[]}
     */
    getFlakyTests(): FlakinessMetrics[] {
        const flaky: FlakinessMetrics[] = [];
        for (const [testName] of this.results) {
            const metrics = this.getMetrics(testName);
            if (metrics && metrics.passRate > 0.1 && metrics.passRate < 0.9) flaky.push(metrics);
        }
        return flaky.sort((a, b) => b.flakinessScore - a.flakinessScore);
    }

    /** Returns metrics for all recorded tests, sorted by descending flakiness score. */
    getAllMetrics(): FlakinessMetrics[] {
        const metrics: FlakinessMetrics[] = [];
        for (const [testName] of this.results) {
            const metric = this.getMetrics(testName);
            if (metric) metrics.push(metric);
        }
        return metrics.sort((a, b) => b.flakinessScore - a.flakinessScore);
    }

    /**
     * Returns raw execution history for a test.
     * @param {string} testName - Name of the test
     * @returns {TestResult[]} Execution records (empty array if none)
     */
    getHistory(testName: string): TestResult[] {
        return this.results.get(testName) || [];
    }

    /** Generates a human-readable flakiness detection report. */
    generateReport(): string {
        const flaky = this.getFlakyTests();
        const all = this.getAllMetrics();
        let report = `Flakiness Detection Report\nTotal Tests: ${all.length}\nFlaky Tests: ${flaky.length}\n`;
        if (flaky.length > 0) {
            flaky.forEach((metric, index) => {
                report += `${index + 1}. ${metric.testName} - Pass Rate: ${(metric.passRate * 100).toFixed(1)}%\n`;
            });
        }
        return report;
    }

    /** Exports all metrics as a JSON string. */
    exportAsJson(): string {
        return JSON.stringify(this.getAllMetrics(), null, 2);
    }

    /** Exports all metrics as a CSV string with a header row. */
    exportAsCsv(): string {
        const metrics = this.getAllMetrics();
        let csv =
            'Test Name,Total Runs,Pass Count,Fail Count,Pass Rate,Flakiness Score,Avg Duration\n';
        metrics.forEach((metric) => {
            csv += `"${metric.testName}",${metric.totalRuns},${metric.passCount},${metric.failCount},${(metric.passRate * 100).toFixed(1)}%,${metric.flakinessScore.toFixed(1)},${metric.avgDuration.toFixed(0)}\n`;
        });
        return csv;
    }

    /** Clears all recorded results. */
    clear(): void {
        this.results.clear();
    }

    /** Returns the number of distinct tests with recorded results. */
    getTotalTestCount(): number {
        return this.results.size;
    }
}
