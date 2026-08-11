/**
 * @fileoverview Test lifecycle manager — per-test start/end bookkeeping and logging.
 */
import type { TestInfo } from '@playwright/test';
import { Logger } from '../../utils/logger';
import { TestMetrics } from '../../context/testMetrics';
import { CurrentTestTracker } from '../../context/testRunContext';

const logger = new Logger('LifecycleManager');

/** Call at the start of each test (e.g. from `test.beforeEach`). */
export function onTestStart(testInfo: TestInfo): void {
    TestMetrics.clear();
    TestMetrics.testName = testInfo.title;
    TestMetrics.testFile = testInfo.file ?? '';
    TestMetrics.project = testInfo.project.name;
    TestMetrics.retryCount = testInfo.retry;
    TestMetrics.startTime = new Date();

    const tagMatches = testInfo.titlePath.join(' ').match(/@[a-zA-Z0-9_-]+/g);
    if (tagMatches) TestMetrics.tags = tagMatches;

    CurrentTestTracker.set({ title: testInfo.title, file: testInfo.file ?? '', retry: testInfo.retry });

    logger.info(`▶ START: ${testInfo.title} [project=${testInfo.project.name}, retry=${testInfo.retry}]`);
}

/** Call at the end of each test (e.g. from `test.afterEach`). */
export function onTestEnd(testInfo: TestInfo): void {
    TestMetrics.durationMs = testInfo.duration;
    TestMetrics.endTime = new Date();
    const status = testInfo.status as TestMetricsStatus;
    TestMetrics.status = status;

    switch (status) {
        case 'passed':
            logger.info(`✅ PASS: ${testInfo.title} (${testInfo.duration}ms)`);
            break;
        case 'failed':
        case 'timedOut':
        case 'interrupted':
            TestMetrics.errorMessage = testInfo.error?.message ?? null;
            logger.error(`❌ FAIL: ${testInfo.title} — ${testInfo.error?.message ?? 'unknown error'}`);
            break;
        case 'skipped':
            logger.warn(`⏭️  SKIP: ${testInfo.title}`);
            break;
    }

    CurrentTestTracker.clear();
}

type TestMetricsStatus = 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';

/** Formats a duration in milliseconds as `HH:MM:SS`. */
export function formatDuration(durationMs: number): string {
    const totalSeconds = Math.floor(durationMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
