/**
 * @fileoverview Lightweight performance metric collection and reporting.
 *
 * {@link PerformanceMonitor} records execution durations for named operations
 * and exposes statistical summaries (avg, min, max, count, total) with
 * export options (JSON, CSV, plain text).
 *
 * @module utils/performanceMonitor
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { PerformanceMonitor } from '@utils/performanceMonitor';
 *
 * const pm = new PerformanceMonitor();
 * const result = await pm.measure('login', async () => loginFlow(page));
 * console.log(pm.getReport());
 * ```
 */

/**
 * Aggregated statistics for a named operation.
 *
 * @interface PerformanceMetric
 * @property {number} avg   - Mean duration (ms)
 * @property {number} min   - Shortest duration (ms)
 * @property {number} max   - Longest duration (ms)
 * @property {number} count - Number of recordings
 * @property {number} total - Sum of all durations (ms)
 */
export interface PerformanceMetric {
    avg: number;
    min: number;
    max: number;
    count: number;
    total: number;
}

/**
 * Collects and reports on execution-time metrics for named operations.
 *
 * @class PerformanceMonitor
 */
export class PerformanceMonitor {
    /** @private Map of operation name → recorded durations */
    private metrics: Map<string, number[]> = new Map();
    /** @private Map of operation name → start timestamp (via `start()`) */
    private startTimes: Map<string, number> = new Map();

    /**
     * Measure the execution time of an async function
     * @param {string} name - Name of the metric
     * @param {() => Promise<T>} fn - Async function to measure
     * @returns {Promise<T>} The result of the function
     */
    async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
        const start = performance.now();
        try {
            return await fn();
        } finally {
            const duration = performance.now() - start;
            this.recordMetric(name, duration);
        }
    }

    /**
     * Starts a manual timer for a named operation. Call {@link end} to stop it.
     * @param {string} name - Operation name
     */
    start(name: string): void {
        this.startTimes.set(name, performance.now());
    }


    /**
     * Stops the manual timer started by {@link start} and records the duration.
     *
     * @param {string} name - Operation name (must match a prior `start()` call)
     * @returns {number} Elapsed time in milliseconds
     * @throws {Error} If no matching `start()` call was made
     */
    end(name: string): number {
        const startTime = this.startTimes.get(name);
        if (!startTime) {
            throw new Error(`No start time found for metric: ${name}`);
        }
        const duration = performance.now() - startTime;
        this.recordMetric(name, duration);
        this.startTimes.delete(name);
        return duration;
    }

    /**
     * Returns aggregated statistics for a single named operation.
     *
     * @param {string} name - Operation name
     * @returns {PerformanceMetric | null} Metric summary, or `null` if not recorded
     */
    getMetric(name: string): PerformanceMetric | null {
        const durations = this.metrics.get(name);
        if (!durations || durations.length === 0) return null;

        const total = durations.reduce((a, b) => a + b, 0);
        return {
            avg: total / durations.length,
            min: Math.min(...durations),
            max: Math.max(...durations),
            count: durations.length,
            total,
        };
    }

    /** Returns metrics for all recorded operations. */
    getAllMetrics(): Record<string, PerformanceMetric> {
        const report: Record<string, PerformanceMetric> = {};
        for (const [name] of this.metrics) {
            const metric = this.getMetric(name);
            if (metric) {
                report[name] = metric;
            }
        }
        return report;
    }


    /** Generates a human-readable performance report string. */
    getReport(): string {
        const metrics = this.getAllMetrics();
        if (Object.keys(metrics).length === 0) {
            return 'No metrics recorded';
        }

        let report = '\n=== Performance Report ===\n';
        for (const [name, metric] of Object.entries(metrics)) {
            report += `\n${name}:\n`;
            report += `  Average: ${metric.avg.toFixed(2)}ms\n`;
            report += `  Min: ${metric.min.toFixed(2)}ms\n`;
            report += `  Max: ${metric.max.toFixed(2)}ms\n`;
            report += `  Total: ${metric.total.toFixed(2)}ms\n`;
            report += `  Count: ${metric.count}\n`;
        }
        return report;
    }

    /**
     * Returns operations whose average duration exceeds the threshold.
     *
     * @param {number} [thresholdMs=1000] - Duration threshold in ms
     * @returns {Array<{ name: string; metric: PerformanceMetric }>} Slow operations
     */
    getSlowOperations(
        thresholdMs: number = 1000,
    ): Array<{ name: string; metric: PerformanceMetric }> {
        const metrics = this.getAllMetrics();
        return Object.entries(metrics)
            .filter(([, metric]) => metric.avg > thresholdMs)
            .map(([name, metric]) => ({ name, metric }));
    }

    /** Clears all recorded metrics and pending timers. */
    clear(): void {
        this.metrics.clear();
        this.startTimes.clear();
    }

    /**
     * Clears recorded data for a single operation.
     * @param {string} name - Operation name
     */
    clearMetric(name: string): void {
        this.metrics.delete(name);
        this.startTimes.delete(name);
    }

    /** Exports all metrics as a pretty-printed JSON string. */
    exportAsJson(): string {
        return JSON.stringify(this.getAllMetrics(), null, 2);
    }

    /** Exports all metrics as a CSV string with a header row. */
    exportAsCsv(): string {
        const metrics = this.getAllMetrics();
        let csv = 'Operation,Average(ms),Min(ms),Max(ms),Total(ms),Count\n';
        for (const [name, metric] of Object.entries(metrics)) {
            csv += `${name},${metric.avg.toFixed(2)},${metric.min.toFixed(2)},${metric.max.toFixed(2)},${metric.total.toFixed(2)},${metric.count}\n`;
        }
        return csv;
    }


    /**
     * Records a single duration sample for the named operation.
     * @param {string} name - Operation name
     * @param {number} duration - Duration in milliseconds
     * @private
     */
    private recordMetric(name: string, duration: number): void {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, []);
        }
        this.metrics.get(name)!.push(duration);
    }
}
