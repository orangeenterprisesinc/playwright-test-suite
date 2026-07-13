/**
 * @fileoverview Custom Playwright reporter that emails a run summary.
 *
 * Self-gating: it only sends when `SEND_EMAIL=yes` AND the SMTP settings
 * are present — otherwise it logs one line and does nothing, so local
 * runs and CI runs without SMTP secrets are unaffected.
 *
 * Required environment variables when enabled:
 * - `SEND_EMAIL=yes`
 * - `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS / 465 TLS)
 * - `SMTP_USER`, `SMTP_PASSWORD` (omit both for unauthenticated relays)
 * - `EMAIL_FROM`, `EMAIL_TO` (comma-separated recipients)
 *
 * @module reporting/emailReporter
 * @author Gukan
 * @since 1.0.0
 */
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import fs from 'node:fs';
import nodemailer from 'nodemailer';
import { ConfigProperties, getConfigBoolean, getConfigValue, getEnvLabel } from '../enums/configProperties';
import { prepareLeanEmailReport } from '../utils/allureReporting';
import { Logger } from '../utils/logger';

interface ReportAttachment {
    filename: string;
    path: string;
}

/** Final state of one test, keyed by test id (retries overwrite). */
interface TestRecord {
    title: string;
    outcome: 'expected' | 'unexpected' | 'flaky' | 'skipped';
    error?: string;
}

class EmailReporter implements Reporter {
    private readonly logger = new Logger('EmailReporter');
    private readonly records = new Map<string, TestRecord>();
    private startTime = 0;

    onBegin(_config: FullConfig, _suite: Suite): void {
        this.startTime = Date.now();
    }

    onTestEnd(test: TestCase, result: TestResult): void {
        // Later retries overwrite earlier entries, so the map ends up with
        // each test's final outcome.
        this.records.set(test.id, {
            title: test.titlePath().slice(2).join(' › '),
            outcome: test.outcome(),
            error: result.error?.message?.split('\n')[0],
        });
    }

    async onEnd(result: FullResult): Promise<void> {
        if (!getConfigBoolean(ConfigProperties.SEND_EMAIL, false)) {
            this.logger.info('Email notification skipped (SEND_EMAIL != yes)');
            return;
        }

        const host = getConfigValue(ConfigProperties.SMTP_HOST);
        const from = getConfigValue(ConfigProperties.EMAIL_FROM);
        const to = getConfigValue(ConfigProperties.EMAIL_TO);
        if (!host || !from || !to) {
            this.logger.warn('SEND_EMAIL=yes but SMTP_HOST / EMAIL_FROM / EMAIL_TO are not all set — skipping email');
            return;
        }

        const { attachments, cleanup } = await this.prepareAttachments();

        try {
            const user = getConfigValue(ConfigProperties.SMTP_USER);
            const port = parseInt(getConfigValue(ConfigProperties.SMTP_PORT, '587'), 10);
            const transporter = nodemailer.createTransport({
                host,
                port,
                secure: port === 465,
                auth: user
                    ? { user, pass: getConfigValue(ConfigProperties.SMTP_PASSWORD) }
                    : undefined,
            });

            await transporter.sendMail({
                from,
                to,
                subject: this.buildSubject(result),
                html: this.buildHtml(result, attachments),
                attachments,
            });
            this.logger.info(`Email notification sent to: ${to}${attachments.length ? ` with ${attachments.length} report attachment(s)` : ''}`);
        } catch (error: unknown) {
            // Never fail the test run because the notification failed.
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Email notification failed: ${msg}`);
        } finally {
            cleanup();
        }
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

    private buildSubject(result: FullResult): string {
        const { passed, failed, flaky, skipped } = this.counts();
        const env = getEnvLabel();
        const icon = result.status === 'passed' ? '✅' : '❌';
        return `${icon} Playwright [${env}] — ${result.status.toUpperCase()}: ${passed} passed, ${failed} failed, ${flaky} flaky, ${skipped} skipped`;
    }

    private buildHtml(result: FullResult, attachments: ReportAttachment[]): string {
        const { passed, failed, flaky, skipped } = this.counts();
        const durationSec = Math.round((Date.now() - this.startTime) / 1000);
        const env = getEnvLabel();
        const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
            ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
            : '';

        const failures = [...this.records.values()]
            .filter((r) => r.outcome === 'unexpected')
            .map((r) => `<li><b>${escapeHtml(r.title)}</b>${r.error ? `<br><code>${escapeHtml(r.error)}</code>` : ''}</li>`)
            .join('');

        const attachmentNote = attachments.length
            ? `<p>📎 Attached: ${attachments.map((a) => escapeHtml(a.filename)).join(', ')} (self-contained — open directly in a browser)</p>`
            : '<p>The Allure report attachment was skipped (missing or too large) — see the CI run link below.</p>';

        return `
<h2>Playwright run — ${result.status.toUpperCase()}</h2>
<table border="1" cellpadding="6" cellspacing="0">
  <tr><td>Environment</td><td>${escapeHtml(env)}</td></tr>
  <tr><td>Passed</td><td>${passed}</td></tr>
  <tr><td>Failed</td><td>${failed}</td></tr>
  <tr><td>Flaky</td><td>${flaky}</td></tr>
  <tr><td>Skipped</td><td>${skipped}</td></tr>
  <tr><td>Duration</td><td>${durationSec}s</td></tr>
</table>
${failures ? `<h3>Failures</h3><ul>${failures}</ul>` : ''}
${attachmentNote}
${runUrl ? `<p><a href="${runUrl}">Open the CI run (Playwright trace-viewer report is attached there as an artifact)</a></p>` : ''}
`;
    }

    /**
     * Generates the lean single-file Allure report (screenshots/videos/traces
     * stripped, no zip — many mail gateways strip those) and attaches its
     * `index.html` directly. Built entirely under the OS temp dir, so
     * `allure-results/` itself is untouched — the CI artifact and local
     * `report:allure` still get the full multi-file report with every
     * attachment. The Playwright HTML report has no single-file mode, so
     * it's left out of email entirely; the CI artifact link covers it.
     *
     * Always returns a `cleanup()` — call it once the email send settles.
     */
    private async prepareAttachments(): Promise<{ attachments: ReportAttachment[]; cleanup: () => void }> {
        let report: { htmlPath: string; cleanup: () => void };
        try {
            report = await prepareLeanEmailReport('allure-results');
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Allure report generation failed — email won't include it: ${msg}`);
            return { attachments: [], cleanup: () => {} };
        }

        const maxBytes = parseInt(getConfigValue(ConfigProperties.EMAIL_MAX_ATTACHMENT_MB, '20'), 10) * 1024 * 1024;
        const size = fs.statSync(report.htmlPath).size;
        if (size > maxBytes) {
            this.logger.warn(`${report.htmlPath} is ${(size / 1024 / 1024).toFixed(1)}MB, over the ${maxBytes / 1024 / 1024}MB cap — skipping the email attachment`);
            report.cleanup();
            return { attachments: [], cleanup: () => {} };
        }

        return { attachments: [{ filename: 'allure-report.html', path: report.htmlPath }], cleanup: report.cleanup };
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default EmailReporter;
