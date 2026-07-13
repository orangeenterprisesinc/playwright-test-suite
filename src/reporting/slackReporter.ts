/**
 * @fileoverview Custom Playwright reporter that posts a run summary to Slack.
 *
 * Self-gating: it only posts when `SEND_SLACK=yes` AND `SLACK_WEBHOOK_URL` is
 * present — otherwise it logs one line and does nothing, so local runs and CI
 * runs without the webhook secret are unaffected.
 *
 * Uses a Slack Incoming Webhook (not a bot token) — no OAuth flow, just a URL
 * created in the target Slack workspace. See README for setup steps.
 *
 * Required environment variables when enabled:
 * - `SEND_SLACK=yes`
 * - `SLACK_WEBHOOK_URL` (from the workspace's Incoming Webhook app config)
 *
 * @module reporting/slackReporter
 * @author Gukan
 * @since 1.0.0
 */
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import https from 'node:https';
import { ConfigProperties, getConfigBoolean, getConfigValue } from '../enums/configProperties';
import { Logger } from '../utils/logger';

/** Final state of one test, keyed by test id (retries overwrite). */
interface TestRecord {
    title: string;
    outcome: 'expected' | 'unexpected' | 'flaky' | 'skipped';
    error?: string;
}

/** Slack caps a single text block at 3000 characters. */
const MAX_FAILURE_LIST_CHARS = 2500;

class SlackReporter implements Reporter {
    private readonly logger = new Logger('SlackReporter');
    private readonly records = new Map<string, TestRecord>();
    private startTime = 0;

    onBegin(): void {
        this.startTime = Date.now();
    }

    onTestEnd(test: TestCase, result: TestResult): void {
        this.records.set(test.id, {
            title: test.titlePath().slice(2).join(' › '),
            outcome: test.outcome(),
            error: result.error?.message?.split('\n')[0],
        });
    }

    async onEnd(result: FullResult): Promise<void> {
        if (!getConfigBoolean(ConfigProperties.SEND_SLACK, false)) {
            this.logger.info('Slack notification skipped (SEND_SLACK != yes)');
            return;
        }

        const webhookUrl = getConfigValue(ConfigProperties.SLACK_WEBHOOK_URL);
        if (!webhookUrl) {
            this.logger.warn('SEND_SLACK=yes but SLACK_WEBHOOK_URL is not set — skipping Slack notification');
            return;
        }

        try {
            const { status, body } = await this.post(webhookUrl, this.buildPayload(result));
            if (status < 200 || status >= 300) {
                this.logger.error(`Slack notification failed: ${status} ${body}`);
                return;
            }
            this.logger.info('Slack notification sent');
        } catch (error: unknown) {
            // Never fail the test run because the notification failed.
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Slack notification failed: ${msg}`);
        }
    }

    /**
     * POSTs JSON via Node's `https` module with `agent: false` — global
     * `fetch` (undici) pools a keep-alive socket that crashes the process on
     * exit on Windows (`UV_HANDLE_CLOSING` assertion in libuv), turning a
     * green run into a non-zero exit code. A one-shot, non-pooled request
     * avoids that entirely.
     */
    private post(url: string, payload: unknown): Promise<{ status: number; body: string }> {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify(payload);
            const req = https.request(
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

    /** Reporter output goes to the logger; keep Playwright's stdio clean. */
    printsToStdio(): boolean {
        return false;
    }

    private counts() {
        let passed = 0, failed = 0, flaky = 0, skipped = 0;
        for (const r of this.records.values()) {
            if (r.outcome === 'expected') passed++;
            else if (r.outcome === 'unexpected') failed++;
            else if (r.outcome === 'flaky') flaky++;
            else skipped++;
        }
        return { passed, failed, flaky, skipped };
    }

    private buildPayload(result: FullResult): { text: string; blocks: unknown[] } {
        const { passed, failed, flaky, skipped } = this.counts();
        const durationSec = Math.round((Date.now() - this.startTime) / 1000);
        const env = getConfigValue(ConfigProperties.TEST_ENV, 'local');
        const icon = result.status === 'passed' ? '✅' : '❌';
        const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
            ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
            : '';

        const headerText = `${icon} *Playwright [${env}] — ${result.status.toUpperCase()}*`;
        const summaryText = `Passed: *${passed}*  Failed: *${failed}*  Flaky: *${flaky}*  Skipped: *${skipped}*  Duration: *${durationSec}s*`;

        const blocks: unknown[] = [
            { type: 'section', text: { type: 'mrkdwn', text: headerText } },
            { type: 'section', text: { type: 'mrkdwn', text: summaryText } },
        ];

        const failures = [...this.records.values()].filter((r) => r.outcome === 'unexpected');
        if (failures.length) {
            let list = failures.map((r) => `• *${r.title}*${r.error ? `\n  \`${r.error}\`` : ''}`).join('\n');
            if (list.length > MAX_FAILURE_LIST_CHARS) {
                list = `${list.slice(0, MAX_FAILURE_LIST_CHARS)}\n… (${failures.length} total failures, truncated)`;
            }
            blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Failures:*\n${list}` } });
        }

        if (runUrl) {
            blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `<${runUrl}|Open the CI run>` } });
        }

        return {
            // `text` is the fallback shown in notifications/unfurl previews.
            text: `${headerText} — ${passed} passed, ${failed} failed, ${flaky} flaky, ${skipped} skipped`,
            blocks,
        };
    }
}

export default SlackReporter;
