/**
 * @fileoverview Custom Playwright reporter that posts one run report per suite
 * to Slack — the framework's primary reporting channel (email is deprecated).
 *
 * Gated by {@link shouldNotifySlack}: CI events only, so local and manual runs
 * post nothing. Two delivery routes, in order of preference:
 *
 * 1. **Bot token** (`SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID`) — posts with
 *    `chat.postMessage`, uploads the single-file Allure report into that
 *    message's thread, then edits the message to link the uploaded file from an
 *    "Open Allure Report" button. Needs the `chat:write` + `files:write` scopes.
 * 2. **Incoming Webhook** (`SLACK_WEBHOOK_URL`) — summary only; webhooks cannot
 *    carry files, so the report appears only as a link (`ALLURE_REPORT_URL`).
 *
 * Run data comes from the shared {@link RunSummaryCollector} and the Block Kit
 * layout from {@link buildRunMessage}; this file only shapes one into the other.
 */
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import fs from 'node:fs';
import { ConfigProperties, getConfigValue } from '../../config/configProperties';
import { acquireLeanReport } from '../generate/allure/report';
import { Logger } from '../../utils/logger';
import { buildRunMessage } from './slack/blocks';
import { isSlackDryRun, shouldNotifySlack } from './slack/gate';
import { postMessage, postWebhook, updateMessage, uploadFile, type SlackMessage } from './slack/slackApi';
import { RunSummaryCollector, statusColor, type RunSummary } from '../summary/runSummary';

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
        const botToken = getConfigValue(ConfigProperties.SLACK_BOT_TOKEN);
        const channel = getConfigValue(ConfigProperties.SLACK_CHANNEL_ID);
        const webhookUrl = getConfigValue(ConfigProperties.SLACK_WEBHOOK_URL);
        // Gates the thread note as well as the upload itself — a message that
        // promises "attached in the thread" and then attaches nothing is worse
        // than one that never mentions Allure.
        const attachAllure = getConfigValue(ConfigProperties.SLACK_ATTACH_ALLURE, 'yes').toLowerCase() !== 'no';
        const uploadsAllure = !!(botToken && channel) && attachAllure;

        // Checked before the gate: previewing the layout must not require
        // pretending to be CI, because a developer who exported
        // GITHUB_ACTIONS=true and then forgot SLACK_DRY_RUN would post a laptop
        // run to the team channel.
        if (isSlackDryRun()) {
            const message = this.buildMessage(this.collector.build(result), uploadsAllure);
            this.logger.info(`Slack dry run — payload not sent:\n${JSON.stringify(message, null, 2)}`);
            return;
        }

        const gate = shouldNotifySlack();
        if (!gate.allowed) {
            this.logger.info(`Slack notification skipped (${gate.reason})`);
            return;
        }

        if (!(botToken && channel) && !webhookUrl) {
            this.logger.warn(
                'SEND_SLACK=yes but neither SLACK_BOT_TOKEN+SLACK_CHANNEL_ID nor SLACK_WEBHOOK_URL is set — skipping Slack notification',
            );
            return;
        }

        const summary = this.collector.build(result);
        const message = this.buildMessage(summary, uploadsAllure);

        try {
            if (botToken && channel) {
                const ts = await postMessage(botToken, channel, message);
                this.logger.info('Slack notification sent');

                // Two phases, because the Allure link does not exist until the
                // file is uploaded and the file has to land in this message's
                // thread. Until the edit lands the message says "attached in the
                // thread", which is true; the edit upgrades that to a button.
                if (attachAllure) {
                    const permalink = await this.uploadAllureReport(botToken, channel, ts, summary);
                    if (permalink) {
                        await updateMessage(botToken, channel, ts, this.buildMessage(summary, false, permalink));
                    }
                }
                return;
            }

            await postWebhook(webhookUrl, message);
            this.logger.info(
                'Slack notification sent (webhook — no Allure attachment; set SLACK_BOT_TOKEN + SLACK_CHANNEL_ID to upload it)',
            );
        } catch (error: unknown) {
            // Never fail the test run because the notification failed.
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Slack notification failed: ${msg}`);
        }
    }

    private buildMessage(summary: RunSummary, uploadsAllure: boolean, allureUrl = summary.allureUrl): SlackMessage {
        return buildRunMessage({
            suiteName: resolveSuiteName(),
            executionLabel: resolveExecutionLabel(summary.trigger),
            passed: summary.status === 'passed',
            color: statusColor(summary.status),
            badges: summary.badges.map((b) => b.label),
            branch: summary.branch,
            commit: summary.commit,
            runNumber: summary.runNumber,
            projects: summary.projects,
            baseUrl: summary.baseUrl,
            counts: {
                passed: summary.passed,
                failed: summary.failed,
                flaky: summary.flaky,
                skipped: summary.skipped,
            },
            passRate: summary.passRate,
            durationText: summary.durationText,
            failures: summary.failures.map((f) => ({ title: f.title, spec: f.spec, error: f.error })),
            allureUrl,
            runUrl: summary.runUrl,
            artifactsUrl: summary.runUrl ? `${summary.runUrl}#artifacts` : '',
            allureInThread: uploadsAllure,
        });
    }

    /**
     * Generates the screenshot-only single-file Allure report and uploads it
     * into the report's thread, returning the uploaded file's permalink (`''`
     * when there is nothing to link). Every failure here is logged and
     * swallowed: the summary is already posted, and a missing JVM or an
     * oversized report must not fail the run.
     */
    private async uploadAllureReport(token: string, channel: string, threadTs: string, summary: RunSummary): Promise<string> {
        try {
            const { htmlPath } = await acquireLeanReport();

            const maxBytes = parseInt(getConfigValue(ConfigProperties.SLACK_MAX_UPLOAD_MB, '20'), 10) * 1024 * 1024;
            const size = fs.statSync(htmlPath).size;
            if (size > maxBytes) {
                this.logger.warn(
                    `Allure report is ${(size / 1024 / 1024).toFixed(1)}MB, over the ${maxBytes / 1024 / 1024}MB SLACK_MAX_UPLOAD_MB cap — not uploading it to Slack`,
                );
                return '';
            }

            const permalink = await uploadFile(token, {
                channel,
                filePath: htmlPath,
                filename: 'allure-report.html',
                title: `Allure report — ${summary.passed} passed, ${summary.failed} failed`,
                threadTs,
                comment: 'Allure report (screenshots only — download and open in a browser). Full video & trace are in the CI run artifacts.',
            });
            this.logger.info('Allure report uploaded to Slack');
            return permalink;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Allure report upload to Slack failed: ${msg}`);
            return '';
        }
    }

    /** Reporter output goes to the logger; keep Playwright's stdio clean. */
    printsToStdio(): boolean {
        return false;
    }
}

/**
 * Which suite this run is — the two dry-run jobs post separate reports and must
 * be told apart at a glance. Falls back to the `WEBPET` marker so a workflow
 * that forgets `SLACK_SUITE_NAME` still labels itself correctly.
 */
function resolveSuiteName(): string {
    const configured = getConfigValue(ConfigProperties.SLACK_SUITE_NAME).trim();
    if (configured) return configured;
    return process.env.WEBPET === '1' ? 'WebPet' : 'User Journey';
}

function resolveExecutionLabel(trigger: string): string {
    const configured = getConfigValue(ConfigProperties.SLACK_EXECUTION_LABEL).trim();
    if (configured) return configured;
    return trigger === 'scheduled' ? 'Scheduled Dry Run' : titleCase(trigger);
}

function titleCase(value: string): string {
    return value
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export default SlackReporter;
