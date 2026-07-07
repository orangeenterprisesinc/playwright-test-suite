/**
 * @fileoverview Custom Playwright reporter that sends email notifications after test execution.
 *
 * Unlike `globalTeardown`, a reporter's `onEnd` hook fires **after** all tests complete
 * and has direct access to the {@link FullResult} summary — no need to read `results.json`.
 * The Playwright HTML report (`playwright-report/index.html`) is attached to the email.
 *
 * @module reporting/emailReporter
 * @author Vicky
 * @since 1.0.0
 */
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { sendEmail } from '../utils/sendEmailWithResults';
import { Logger } from '../utils/logger';
import path from 'path';

const logger = new Logger('EmailReporter');

/**
 * Playwright custom reporter that sends an email summary when all tests finish.
 *
 * Tracks pass/fail/skip counts via {@link onTestEnd} and sends the email with
 * the Playwright HTML report attached in {@link onEnd}.
 *
 * @class EmailReporter
 * @implements {Reporter}
 *
 * @example
 * ```typescript
 * // playwright.config.ts
 * reporter: [
 *   ['./src/reporting/emailReporter.ts'],
 * ],
 * ```
 */
class EmailReporter implements Reporter {
    private passed = 0;
    private failed = 0;
    private skipped = 0;
    private startTime = 0;

    onBegin(): void {
        this.startTime = Date.now();
    }

    /**
     * Called after each test finishes. Tracks pass/fail/skip counts.
     *
     * @param {TestCase} _test - The test case that just finished
     * @param {TestResult} result - The result of the test
     */
    onTestEnd(_test: TestCase, result: TestResult): void {
        switch (result.status) {
            case 'passed':
                this.passed++;
                break;
            case 'failed':
            case 'timedOut':
                this.failed++;
                break;
            case 'skipped':
                this.skipped++;
                break;
        }
    }

    /**
     * Called after all tests have finished. Sends the email notification
     * with the Playwright HTML report attached.
     *
     * @param {FullResult} result - Playwright's full result object with status
     */
    async onEnd(result: FullResult): Promise<void> {
        const durationMs = Date.now() - this.startTime;
        const durationStr = new Date(durationMs).toISOString().substring(11, 19);

        logger.info(`Test run finished with status: ${result.status}`);
        logger.info(`Results — Passed: ${this.passed}, Failed: ${this.failed}, Skipped: ${this.skipped}, Duration: ${durationStr}`);

        // Resolve path to the Playwright HTML report
        const reportPath = path.join(process.cwd(), 'playwright-report', 'index.html');

        try {
            await sendEmail(this.passed, this.failed, this.skipped, durationStr, reportPath);
            logger.info('Email notification sent successfully');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.warn(`Email notification failed: ${msg}`);
        }
    }
}

export default EmailReporter;

