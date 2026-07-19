/**
 * @fileoverview Custom Playwright reporter that posts a rich run summary to Slack.
 *
 * Self-gating: it only posts when `SEND_SLACK=yes` AND `SLACK_WEBHOOK_URL` is
 * present — otherwise it logs one line and does nothing, so local runs and CI
 * runs without the webhook secret are unaffected.
 *
 * Uses a Slack Incoming Webhook (not a bot token) — no OAuth flow, just a URL
 * created in the target Slack workspace. The run data (counts, pass rate,
 * metadata, env badges, failures) comes from the shared
 * {@link RunSummaryCollector}; this file only turns that into Slack Block Kit.
 *
 * Required environment variables when enabled:
 * - `SEND_SLACK=yes`
 * - `SLACK_WEBHOOK_URL` (from the workspace's Incoming Webhook app config)
 *
 * @module reporting/slackReporter
 * @since 1.0.0
 */
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import https from 'node:https';
import { ConfigProperties, getConfigBoolean, getConfigValue } from '../enums/configProperties';
import { Logger } from '../utils/logger';
import { RunSummaryCollector, statusColor, type RunSummary } from './runSummary';

/** Slack caps a single text block at 3000 characters. */
const MAX_FAILURE_LIST_CHARS = 2500;

class SlackReporter implements Reporter {
    private readonly logger = new Logger('SlackReporter');
    private readonly collector = new RunSummaryCollector();

    onBegin(): void {
        this.collector.onBegin();
    }

    onTestEnd(test: TestCase, result: TestResult): void {
        this.collector.recordTest(test, result);
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
            const { status, body } = await this.post(webhookUrl, buildPayload(this.collector.build(result)));
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
}

function buildPayload(summary: RunSummary): { text: string; attachments: unknown[] } {
    const icon = summary.status === 'passed' ? '✅' : '❌';
    const envLabel = summary.badges.map((b) => `\`${b.label}\``).join(' ');
    const headerText = `${icon} Playwright — ${summary.status.toUpperCase()}`;

    const blocks: unknown[] = [
        { type: 'header', text: { type: 'plain_text', text: `${icon} Playwright — ${summary.status.toUpperCase()}`, emoji: true } },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: `*Passed:*\n${summary.passed}` },
                { type: 'mrkdwn', text: `*Failed:*\n${summary.failed}` },
                { type: 'mrkdwn', text: `*Flaky:*\n${summary.flaky}` },
                { type: 'mrkdwn', text: `*Skipped:*\n${summary.skipped}` },
                { type: 'mrkdwn', text: `*Pass rate:*\n${summary.passRate}%` },
                { type: 'mrkdwn', text: `*Duration:*\n${summary.durationText}` },
            ],
        },
        {
            type: 'context',
            elements: [
                { type: 'mrkdwn', text: `${envLabel}  •  *${summary.trigger}*  •  \`${summary.branch}@${summary.commit}\`  •  ${summary.projects}` },
            ],
        },
    ];

    if (summary.failures.length) {
        let list = summary.failures.map((r) => `• *${r.title}*\n   \`${r.spec}\`${r.error ? `\n   ${r.error}` : ''}`).join('\n');
        if (list.length > MAX_FAILURE_LIST_CHARS) {
            list = `${list.slice(0, MAX_FAILURE_LIST_CHARS)}\n… (${summary.failures.length} total failures, truncated)`;
        }
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Failures:*\n${list}` } });
    }

    if (summary.runUrl) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `<${summary.runUrl}|Open the CI run →>  _(full video & trace in artifacts)_` } });
    }

    return {
        // `text` is the fallback shown in notifications / unfurl previews.
        text: `${headerText} — ${summary.passed} passed, ${summary.failed} failed, ${summary.flaky} flaky, ${summary.skipped} skipped`,
        // A coloured attachment wrapper gives the message a green/red side bar.
        attachments: [{ color: statusColor(summary.status), blocks }],
    };
}

export default SlackReporter;
