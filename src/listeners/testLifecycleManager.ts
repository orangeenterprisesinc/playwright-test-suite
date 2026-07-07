/**
 * @fileoverview Test lifecycle manager that tracks test execution state and suite-level statistics.
 *
 * Provides hooks for test start/end events, maintains pass/fail/skip counters,
 * and populates {@link TestMetrics} with per-test metadata (authors, categories, tags).
 *
 * @module listeners/testLifecycleManager
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { onTestStart, onTestEnd, getSuiteStats, formatDuration } from '@listeners';
 *
 * test.beforeEach(async ({}, testInfo) => {
 *   onTestStart(testInfo);
 * });
 *
 * test.afterEach(async ({}, testInfo) => {
 *   onTestEnd(testInfo);
 *   const stats = getSuiteStats();
 *   console.log(`Pass rate: ${stats.passed}/${stats.total}`);
 *   console.log(`Duration: ${formatDuration(stats.durationMs)}`);
 * });
 * ```
 */
import type {TestInfo} from '@playwright/test';
import {Logger} from '../utils/logger';
import {TestMetrics} from '../context/testMetrics';
// @ts-ignore
import {getAnnotation} from '../annotations/frameworkAnnotation';

/** @private Logger instance for lifecycle events */
const logger = new Logger('LifecycleManager');

/** @private Running count of passed tests in current suite */
let passedCount = 0;
/** @private Running count of failed tests in current suite */
let failedCount = 0;
/** @private Running count of skipped tests in current suite */
let skippedCount = 0;
/** @private Timestamp when the suite started (epoch ms) */
let suiteStartTime = 0;

/**
 * Resets all suite-level counters and records the suite start time.
 *
 * Call this at the beginning of a test suite (e.g., in `globalSetup` or the
 * first `beforeAll` hook) to start fresh statistics collection.
 *
 * @returns {void}
 *
 * @example
 * ```typescript
 * resetSuiteCounters();
 * // passedCount, failedCount, skippedCount → 0
 * // suiteStartTime → Date.now()
 * ```
 */
export function resetSuiteCounters(): void {
    passedCount = 0;
    failedCount = 0;
    skippedCount = 0;
    suiteStartTime = Date.now();
}


/**
 * Returns the current suite-level execution statistics.
 *
 * @returns {{ passed: number; failed: number; skipped: number; total: number; durationMs: number }}
 *   An object containing:
 *   - `passed` — Number of tests that passed
 *   - `failed` — Number of tests that failed (including timed-out / interrupted)
 *   - `skipped` — Number of tests that were skipped
 *   - `total` — Sum of passed + failed + skipped
 *   - `durationMs` — Elapsed time since {@link resetSuiteCounters} was called
 *
 * @example
 * ```typescript
 * const stats = getSuiteStats();
 * console.log(`${stats.passed}/${stats.total} passed in ${stats.durationMs}ms`);
 * ```
 */
export function getSuiteStats() {
    return {
        passed: passedCount,
        failed: failedCount,
        skipped: skippedCount,
        total: passedCount + failedCount + skippedCount,
        durationMs: Date.now() - suiteStartTime,
    };
}


/**
 * Hook called at the start of each test.
 *
 * Clears stale {@link TestMetrics}, sets the current test's metadata (name, file,
 * project, retry count), resolves framework annotations (authors, categories),
 * and extracts `@tag` markers from the test title path.
 *
 * @param {TestInfo} testInfo - Playwright's TestInfo for the current test
 * @returns {void}
 *
 * @example
 * ```typescript
 * test.beforeEach(async ({}, testInfo) => {
 *   onTestStart(testInfo);
 * });
 * ```
 */
export function onTestStart(testInfo: TestInfo): void {
    TestMetrics.clear();
    TestMetrics.testName = testInfo.title;
    TestMetrics.testFile = testInfo.file ?? '';
    TestMetrics.project = testInfo.project.name;
    TestMetrics.retryCount = testInfo.retry;
    TestMetrics.startTime = new Date();
    const annotation = getAnnotation(testInfo.title);
    if (annotation) {
        TestMetrics.authors = annotation.authors;
        TestMetrics.categories = annotation.categories;
    }
    const fullTitle = testInfo.titlePath.join(' ');
    const tagMatches = fullTitle.match(/@[a-zA-Z0-9_-]+/g);
    if (tagMatches) {
        TestMetrics.tags = tagMatches;
    }

    logger.info(
        `▶ START: ${testInfo.title} [project=${testInfo.project.name}, retry=${testInfo.retry}]`,
    );
}


/**
 * Hook called at the end of each test.
 *
 * Records the test duration, end time, and status in {@link TestMetrics}.
 * Increments the appropriate suite counter (passed / failed / skipped) and
 * logs the result with a status emoji.
 *
 * @param {TestInfo} testInfo - Playwright's TestInfo for the completed test
 * @returns {void}
 *
 * @example
 * ```typescript
 * test.afterEach(async ({}, testInfo) => {
 *   onTestEnd(testInfo);
 * });
 * ```
 */
export function onTestEnd(testInfo: TestInfo): void {
    const durationMs = testInfo.duration;
    TestMetrics.durationMs = durationMs;
    TestMetrics.endTime = new Date();
    const status = testInfo.status as 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
    TestMetrics.status = status;

    switch (status) {
        case 'passed':
            passedCount++;
            logger.info(`✅ PASS: ${testInfo.title} (${durationMs}ms)`);
            break;
        case 'failed':
        case 'timedOut':
        case 'interrupted':
            failedCount++;
            TestMetrics.errorMessage = testInfo.error?.message ?? null;
            logger.error(
                `❌ FAIL: ${testInfo.title} — ${testInfo.error?.message ?? 'unknown error'}`,
            );
            break;
        case 'skipped':
            skippedCount++;
            logger.warn(`⏭️  SKIP: ${testInfo.title}`);
            break;
    }

    logger.info('────────────────────────────────────────────────────────────');
}


/**
 * Formats a duration in milliseconds into a human-readable `HH:MM:SS` string.
 *
 * @param {number} durationMs - Duration in milliseconds
 * @returns {string} Formatted string in `HH:MM:SS` format (zero-padded)
 *
 * @example
 * ```typescript
 * formatDuration(3661000); // '01:01:01'
 * formatDuration(500);     // '00:00:00'
 * ```
 */
export function formatDuration(durationMs: number): string {
    const totalSeconds = Math.floor(durationMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}