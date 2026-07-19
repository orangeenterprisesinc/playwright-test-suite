/**
 * @fileoverview Custom Playwright reporter that pushes a run summary to an
 * ELK/Elasticsearch ingest endpoint.
 *
 * Self-gating: it only posts when `SEND_RESULT_ELK=yes` AND `ELK_URL` is
 * present — otherwise it logs one line and does nothing, so local runs and
 * CI runs without an ELK endpoint configured are unaffected. Mirrors the
 * self-gating pattern used by {@link ./emailReporter} and {@link ./slackReporter}.
 *
 * The payload is built from the shared {@link RunSummaryCollector}, so it
 * carries the same counts/metadata (env, branch, commit, trigger, pass rate)
 * as the email and Slack reports.
 *
 * Required environment variables when enabled:
 * - `SEND_RESULT_ELK=yes`
 * - `ELK_URL` (ingest endpoint the run summary is POSTed to)
 *
 * @module reporting/dashboard
 */
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import http from 'node:http';
import https from 'node:https';
import { ConfigProperties, getConfigBoolean, getConfigValue } from '../enums/configProperties';
import { Logger } from '../utils/logger';
import { RunSummaryCollector } from './runSummary';

class DashboardReporter implements Reporter {
    private readonly logger = new Logger('DashboardReporter');
    private readonly collector = new RunSummaryCollector();

    onBegin(): void {
        this.collector.onBegin();
    }

    onTestEnd(test: TestCase, result: TestResult): void {
        this.collector.recordTest(test, result);
    }

    async onEnd(result: FullResult): Promise<void> {
        if (!getConfigBoolean(ConfigProperties.SEND_RESULT_ELK, false)) {
            this.logger.info('ELK push skipped (SEND_RESULT_ELK != yes)');
            return;
        }

        const elkUrl = getConfigValue(ConfigProperties.ELK_URL);
        if (!elkUrl) {
            this.logger.warn('SEND_RESULT_ELK=yes but ELK_URL is not set — skipping ELK push');
            return;
        }

        const summary = this.collector.build(result);
        const payload = {
            environment: summary.env,
            isCI: summary.isCI,
            status: summary.status,
            passed: summary.passed,
            failed: summary.failed,
            flaky: summary.flaky,
            skipped: summary.skipped,
            total: summary.total,
            passRate: summary.passRate,
            durationMs: summary.durationMs,
            branch: summary.branch,
            commit: summary.commit,
            trigger: summary.trigger,
            projects: summary.projects,
            runUrl: summary.runUrl,
            finishedAt: summary.finishedAt,
            tests: summary.records,
        };

        try {
            const { status, body } = await this.post(elkUrl, payload);
            if (status < 200 || status >= 300) {
                this.logger.error(`ELK push failed: ${status} ${body}`);
                return;
            }
            this.logger.info('ELK push sent');
        } catch (error: unknown) {
            // Never fail the test run because the notification failed.
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`ELK push failed: ${msg}`);
        }
    }

    /** Reporter output goes to the logger; keep Playwright's stdio clean. */
    printsToStdio(): boolean {
        return false;
    }

    private post(url: string, payload: unknown): Promise<{ status: number; body: string }> {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify(payload);
            const client = url.startsWith('https') ? https : http;
            const req = client.request(
                url,
                {
                    method: 'POST',
                    agent: false,
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body),
                        Connection: 'close',
                    },
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => chunks.push(chunk));
                    res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
                },
            );
            req.on('error', reject);
            req.end(body);
        });
    }
}

export default DashboardReporter;
