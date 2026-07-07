/**
 * @fileoverview Test reporting dashboard with metrics collection and trend analysis.
 *
 * Provides a singleton {@link TestReportingDashboard} that records per-run metrics,
 * tracks historical trends, and offers statistical analysis (pass-rate, flakiness).
 *
 * @module reporting/dashboard
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { TestReportingDashboard } from '@reporting/dashboard';
 *
 * const dashboard = TestReportingDashboard.getInstance();
 * dashboard.recordMetrics({
 *   totalTests: 100, passed: 90, failed: 5,
 *   skipped: 3, flaky: 2, duration: 60000,
 *   timestamp: new Date(),
 * });
 * console.log(dashboard.generateSummary());
 * ```
 */

/**
 * Snapshot of test-run metrics at a point in time.
 *
 * @interface TestMetrics
 * @property {number} totalTests  - Total number of tests executed
 * @property {number} passed      - Tests that passed
 * @property {number} failed      - Tests that failed
 * @property {number} skipped     - Tests that were skipped
 * @property {number} flaky       - Tests flagged as flaky
 * @property {number} duration    - Total duration of the run (ms)
 * @property {number} passRate    - Percentage of passed tests (0–100)
 * @property {number} flakinessRate - Percentage of flaky tests (0–100)
 * @property {Date}   timestamp   - When the metrics were recorded
 */
export interface TestMetrics {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
    duration: number;
    passRate: number;
    flakinessRate: number;
    timestamp: Date;
}

/**
 * A single trend data-point combining metrics with environment context.
 *
 * @interface TrendData
 * @property {Date}        date        - When the trend was recorded
 * @property {TestMetrics}  metrics     - The metrics snapshot
 * @property {string}      environment - Environment name (e.g., 'dev', 'staging')
 * @property {string}      browser     - Browser used (e.g., 'chromium')
 */
export interface TrendData {
    date: Date;
    metrics: TestMetrics;
    environment: string;
    browser: string;
}

/**
 * Configuration options for the reporting dashboard.
 *
 * @interface DashboardConfig
 * @property {number}  [maxTrendDays=30]            - Max days to retain trend data
 * @property {boolean} [enableRealTime=true]        - Enable real-time metric updates
 * @property {boolean} [enableHistoricalData=true]  - Enable historical data retention
 * @property {Array<'html'|'json'|'csv'>} [reportFormats] - Output formats for reports
 */
interface DashboardConfig {
    maxTrendDays?: number;
    enableRealTime?: boolean;
    enableHistoricalData?: boolean;
    reportFormats?: ('html' | 'json' | 'csv')[];
}

/**
 * Singleton dashboard that collects test metrics and provides trend analysis.
 *
 * Use {@link TestReportingDashboard.getInstance} to obtain the shared instance.
 *
 * @class TestReportingDashboard
 *
 * @example
 * ```typescript
 * const dashboard = TestReportingDashboard.getInstance();
 * dashboard.recordMetrics({ totalTests: 50, passed: 45, failed: 3, skipped: 1, flaky: 1, duration: 30000, timestamp: new Date() });
 * const analysis = dashboard.getTrendAnalysis();
 * console.log(analysis.passRateTrend); // 'improving' | 'declining' | 'stable'
 * ```
 */
export class TestReportingDashboard {
    /** @private Singleton instance */
    private static instance: TestReportingDashboard;
    /** @private Historical metrics array */
    private metrics: TestMetrics[] = [];
    /** @private Historical trend data points */
    private trends: TrendData[] = [];
    /** @private Dashboard configuration */
    private config: DashboardConfig;
    /** @private Most recently recorded metrics */
    private currentMetrics: TestMetrics | null = null;

    /**
     * Private constructor — use {@link getInstance} instead.
     * @param {DashboardConfig} [config={}] - Dashboard configuration
     */
    private constructor(config: DashboardConfig = {}) {
        this.config = {
            maxTrendDays: 30,
            enableRealTime: true,
            enableHistoricalData: true,
            reportFormats: ['html', 'json'],
            ...config,
        };
    }

    /**
     * Returns the singleton dashboard instance. Creates one on the first call.
     *
     * @param {DashboardConfig} [config] - Configuration (only used on first call)
     * @returns {TestReportingDashboard} The singleton instance
     */
    static getInstance(config?: DashboardConfig): TestReportingDashboard {
        if (!TestReportingDashboard.instance) {
            TestReportingDashboard.instance = new TestReportingDashboard(config);
        }
        return TestReportingDashboard.instance;
    }

    /**
     * Resets the singleton instance. Useful for test isolation.
     * @returns {void}
     */
    static reset(): void {
        TestReportingDashboard.instance = null as any;
    }

    /**
     * Records a set of test metrics. `passRate` and `flakinessRate` are computed
     * automatically and should not be supplied.
     *
     * @param {Omit<TestMetrics, 'passRate' | 'flakinessRate'>} metrics - Raw metrics to record
     * @returns {void}
     *
     * @example
     * ```typescript
     * dashboard.recordMetrics({
     *   totalTests: 100, passed: 90, failed: 5,
     *   skipped: 3, flaky: 2, duration: 60000,
     *   timestamp: new Date(),
     * });
     * ```
     */
    recordMetrics(metrics: Omit<TestMetrics, 'passRate' | 'flakinessRate'>): void {
        const passRate = metrics.totalTests > 0 ? (metrics.passed / metrics.totalTests) * 100 : 0;
        const flakinessRate =
            metrics.totalTests > 0 ? (metrics.flaky / metrics.totalTests) * 100 : 0;

        const fullMetrics: TestMetrics = {
            ...metrics,
            passRate,
            flakinessRate,
            timestamp: new Date(),
        };

        this.metrics.push(fullMetrics);
        this.currentMetrics = fullMetrics;
    }

    /**
     * Records a trend data-point and prunes entries older than `maxTrendDays`.
     *
     * @param {Omit<TrendData, 'date'>} data - Trend data (date is set automatically)
     * @returns {void}
     */
    recordTrend(data: Omit<TrendData, 'date'>): void {
        this.trends.push({
            ...data,
            date: new Date(),
        });

        // Keep only recent trends
        const maxDays = this.config.maxTrendDays || 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - maxDays);
        this.trends = this.trends.filter((t) => t.date > cutoffDate);
    }

    /**
     * Returns the most recently recorded metrics snapshot.
     * @returns {TestMetrics | null} Current metrics or `null` if none recorded
     */
    getCurrentMetrics(): TestMetrics | null {
        return this.currentMetrics;
    }

    /**
     * Returns a copy of all historically recorded metrics.
     * @returns {TestMetrics[]} Array of all recorded metrics snapshots
     */
    getAllMetrics(): TestMetrics[] {
        return [...this.metrics];
    }

    /**
     * Returns a copy of all historical trend data-points.
     * @returns {TrendData[]} Array of trend entries
     */
    getTrendData(): TrendData[] {
        return [...this.trends];
    }

    /**
     * Computes the average pass rate over the most recent N days.
     *
     * @param {number} [days=7] - Number of days to look back
     * @returns {number} Average pass rate (0–100), or `0` if no data
     */
    getAveragePassRate(days: number = 7): number {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const recentMetrics = this.metrics.filter((m) => m.timestamp > cutoffDate);
        if (recentMetrics.length === 0) return 0;

        const totalPassRate = recentMetrics.reduce((sum, m) => sum + m.passRate, 0);
        return totalPassRate / recentMetrics.length;
    }

    /**
     * Computes the average flakiness rate over the most recent N days.
     *
     * @param {number} [days=7] - Number of days to look back
     * @returns {number} Average flakiness rate (0–100), or `0` if no data
     */
    getAverageFlakinessRate(days: number = 7): number {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const recentMetrics = this.metrics.filter((m) => m.timestamp > cutoffDate);
        if (recentMetrics.length === 0) return 0;

        const totalFlakinessRate = recentMetrics.reduce((sum, m) => sum + m.flakinessRate, 0);
        return totalFlakinessRate / recentMetrics.length;
    }

    /**
     * Analyses 7-day vs 14-day trends to determine whether pass-rate and
     * flakiness are improving, declining, or stable.
     *
     * @returns {{ passRateTrend: 'improving'|'declining'|'stable', flakinessRateTrend: 'improving'|'declining'|'stable', averagePassRate: number, averageFlakinessRate: number }}
     */
    getTrendAnalysis(): {
        passRateTrend: 'improving' | 'declining' | 'stable';
        flakinessRateTrend: 'improving' | 'declining' | 'stable';
        averagePassRate: number;
        averageFlakinessRate: number;
    } {
        const week1PassRate = this.getAveragePassRate(7);
        const week2PassRate = this.getAveragePassRate(14);

        const week1FlakinessRate = this.getAverageFlakinessRate(7);
        const week2FlakinessRate = this.getAverageFlakinessRate(14);

        const passRateTrend =
            week1PassRate > week2PassRate + 2
                ? 'improving'
                : week1PassRate < week2PassRate - 2
                    ? 'declining'
                    : 'stable';

        const flakinessRateTrend =
            week1FlakinessRate < week2FlakinessRate - 2
                ? 'improving'
                : week1FlakinessRate > week2FlakinessRate + 2
                    ? 'declining'
                    : 'stable';

        return {
            passRateTrend,
            flakinessRateTrend,
            averagePassRate: week1PassRate,
            averageFlakinessRate: week1FlakinessRate,
        };
    }


    /**
     * Generates a human-readable summary string of the current metrics.
     *
     * @returns {string} Multi-line summary, or `'No metrics recorded'` if empty
     */
    generateSummary(): string {
        const current = this.currentMetrics;
        if (!current) return 'No metrics recorded';

        return `
Test Report Summary
===================
Total Tests: ${current.totalTests}
Passed: ${current.passed} (${current.passRate.toFixed(2)}%)
Failed: ${current.failed}
Skipped: ${current.skipped}
Flaky: ${current.flaky} (${current.flakinessRate.toFixed(2)}%)
Duration: ${current.duration}ms
Timestamp: ${current.timestamp.toISOString()}
    `.trim();
    }

    /**
     * Clears all stored metrics, trends, and the current snapshot.
     * @returns {void}
     */
    clear(): void {
        this.metrics = [];
        this.trends = [];
        this.currentMetrics = null;
    }
}
