/**
 * @fileoverview Lightweight performance metric collection and reporting.
 * @module utils/performanceMonitor
 */
export interface PerformanceMetric {
    avg: number;
    min: number;
    max: number;
    count: number;
    total: number;
}

export class PerformanceMonitor {
    private metrics: Map<string, number[]> = new Map();
    private startTimes: Map<string, number> = new Map();

    /** Measures the execution time of an async function. */
    async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
        const start = performance.now();
        try {
            return await fn();
        } finally {
            this.recordMetric(name, performance.now() - start);
        }
    }

    /** Starts a manual timer for a named operation. Call {@link end} to stop it. */
    start(name: string): void {
        this.startTimes.set(name, performance.now());
    }

    /** Stops the timer started by {@link start} and records the duration. */
    end(name: string): number {
        const startTime = this.startTimes.get(name);
        if (!startTime) throw new Error(`No start time found for metric: ${name}`);
        const duration = performance.now() - startTime;
        this.recordMetric(name, duration);
        this.startTimes.delete(name);
        return duration;
    }

    getMetric(name: string): PerformanceMetric | null {
        const durations = this.metrics.get(name);
        if (!durations || durations.length === 0) return null;

        const total = durations.reduce((a, b) => a + b, 0);
        return { avg: total / durations.length, min: Math.min(...durations), max: Math.max(...durations), count: durations.length, total };
    }

    getAllMetrics(): Record<string, PerformanceMetric> {
        const report: Record<string, PerformanceMetric> = {};
        for (const name of this.metrics.keys()) {
            const metric = this.getMetric(name);
            if (metric) report[name] = metric;
        }
        return report;
    }

    getReport(): string {
        const metrics = this.getAllMetrics();
        if (Object.keys(metrics).length === 0) return 'No metrics recorded';

        let report = '\n=== Performance Report ===\n';
        for (const [name, metric] of Object.entries(metrics)) {
            report += `\n${name}:\n  Average: ${metric.avg.toFixed(2)}ms\n  Min: ${metric.min.toFixed(2)}ms\n  Max: ${metric.max.toFixed(2)}ms\n  Total: ${metric.total.toFixed(2)}ms\n  Count: ${metric.count}\n`;
        }
        return report;
    }

    /** Operations whose average duration exceeds `thresholdMs`. */
    getSlowOperations(thresholdMs: number = 1000): Array<{ name: string; metric: PerformanceMetric }> {
        return Object.entries(this.getAllMetrics())
            .filter(([, metric]) => metric.avg > thresholdMs)
            .map(([name, metric]) => ({ name, metric }));
    }

    clear(): void {
        this.metrics.clear();
        this.startTimes.clear();
    }

    clearMetric(name: string): void {
        this.metrics.delete(name);
        this.startTimes.delete(name);
    }

    exportAsJson(): string {
        return JSON.stringify(this.getAllMetrics(), null, 2);
    }

    exportAsCsv(): string {
        let csv = 'Operation,Average(ms),Min(ms),Max(ms),Total(ms),Count\n';
        for (const [name, metric] of Object.entries(this.getAllMetrics())) {
            csv += `${name},${metric.avg.toFixed(2)},${metric.min.toFixed(2)},${metric.max.toFixed(2)},${metric.total.toFixed(2)},${metric.count}\n`;
        }
        return csv;
    }

    private recordMetric(name: string, duration: number): void {
        if (!this.metrics.has(name)) this.metrics.set(name, []);
        this.metrics.get(name)!.push(duration);
    }
}
