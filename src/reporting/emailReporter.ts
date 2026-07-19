/**
 * @fileoverview Custom Playwright reporter that emails a rich run summary.
 *
 * Self-gating: it only sends when `SEND_EMAIL=yes` AND the SMTP settings
 * are present — otherwise it logs one line and does nothing, so local
 * runs and CI runs without SMTP secrets are unaffected.
 *
 * The run data (counts, pass rate, metadata, env badges, failures) comes from
 * the shared {@link RunSummaryCollector}; this file only turns that into HTML.
 * A screenshot-only single-file Allure report is attached (video/trace are
 * dropped there — see {@link ../utils/allureHelper}).
 *
 * Required environment variables when enabled:
 * - `SEND_EMAIL=yes`
 * - `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS / 465 TLS)
 * - `SMTP_USER`, `SMTP_PASSWORD` (omit both for unauthenticated relays)
 * - `EMAIL_FROM`, `EMAIL_TO` (comma-separated recipients)
 *
 * @module reporting/emailReporter
 * @since 1.0.0
 */
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import fs from 'node:fs';
import nodemailer from 'nodemailer';
import { ConfigProperties, getConfigBoolean, getConfigValue } from '../enums/configProperties';
import { prepareLeanEmailReport } from '../utils/allureHelper';
import { Logger } from '../utils/logger';
import { RunSummaryCollector, statusColor, type EnvBadge, type RunSummary, type TestRecord } from './runSummary';

interface ReportAttachment {
    filename: string;
    path: string;
}

const OUTCOME_COLORS = {
    passed: '#22c55e',
    failed: '#ef4444',
    flaky: '#f59e0b',
    skipped: '#6b7280',
} as const;

class EmailReporter implements Reporter {
    private readonly logger = new Logger('EmailReporter');
    private readonly collector = new RunSummaryCollector();

    onBegin(_config: FullConfig, _suite: Suite): void {
        this.collector.onBegin();
    }

    onTestEnd(test: TestCase, result: TestResult): void {
        this.collector.recordTest(test, result);
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

        const summary = this.collector.build(result);
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
                subject: buildSubject(summary),
                html: buildHtml(summary, attachments),
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

    /**
     * Generates the screenshot-only single-file Allure report and attaches its
     * `index.html`. Built entirely under the OS temp dir, so `allure-results/`
     * itself is untouched. The Playwright HTML report has no single-file mode,
     * so it's left out of email; the CI artifact link covers it.
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

function buildSubject(summary: RunSummary): string {
    const envLabel = summary.badges.map((b) => b.label).join(' · ');
    const icon = summary.status === 'passed' ? '✅' : '❌';
    return `${icon} Playwright [${envLabel}] — ${summary.status.toUpperCase()}: ${summary.passed} passed, ${summary.failed} failed, ${summary.flaky} flaky, ${summary.skipped} skipped`;
}

function badgePill(badge: EnvBadge): string {
    return `<span style="display:inline-block;background:${badge.color};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.5px;padding:3px 10px;border-radius:12px;margin-right:6px;">${escapeHtml(badge.label)}</span>`;
}

function statCell(label: string, value: number | string, color: string): string {
    return `
    <td align="center" style="padding:12px 8px;">
      <div style="font-size:24px;font-weight:700;color:${color};line-height:1;">${value}</div>
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-top:4px;">${escapeHtml(label)}</div>
    </td>`;
}

function metaRow(label: string, value: string): string {
    return `
    <tr>
      <td style="padding:6px 12px;font-size:13px;color:#6b7280;white-space:nowrap;">${escapeHtml(label)}</td>
      <td style="padding:6px 12px;font-size:13px;color:#111827;font-family:'SFMono-Regular',Consolas,monospace;">${escapeHtml(value)}</td>
    </tr>`;
}

function failureCard(record: TestRecord): string {
    return `
    <div style="border-left:3px solid ${OUTCOME_COLORS.failed};background:#fef2f2;padding:10px 14px;margin:8px 0;border-radius:0 4px 4px 0;">
      <div style="font-size:14px;font-weight:600;color:#991b1b;">${escapeHtml(record.title)}</div>
      <div style="font-size:12px;color:#6b7280;font-family:'SFMono-Regular',Consolas,monospace;margin-top:2px;">${escapeHtml(record.spec)}${record.project ? ` · ${escapeHtml(record.project)}` : ''}</div>
      ${record.error ? `<div style="font-size:12px;color:#7f1d1d;font-family:'SFMono-Regular',Consolas,monospace;margin-top:6px;white-space:pre-wrap;">${escapeHtml(record.error)}</div>` : ''}
    </div>`;
}

function buildHtml(summary: RunSummary, attachments: ReportAttachment[]): string {
    const banner = statusColor(summary.status);
    const icon = summary.status === 'passed' ? '✅' : '❌';

    const failuresSection = summary.failures.length
        ? `<h3 style="font-size:15px;color:#111827;margin:20px 0 4px;">Failures (${summary.failures.length})</h3>${summary.failures.map(failureCard).join('')}`
        : '';

    const attachmentNote = attachments.length
        ? `<p style="font-size:13px;color:#6b7280;margin:16px 0 0;">📎 Attached: ${attachments.map((a) => escapeHtml(a.filename)).join(', ')} — a self-contained Allure report (screenshots only; open directly in a browser). Full video &amp; trace are in the CI run artifacts.</p>`
        : `<p style="font-size:13px;color:#6b7280;margin:16px 0 0;">The Allure report attachment was skipped (missing or too large) — see the CI run link below.</p>`;

    const runLink = summary.runUrl
        ? `<p style="margin:16px 0 0;"><a href="${summary.runUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;border-radius:6px;">Open the CI run →</a></p>`
        : '';

    return `
<div style="background:#f3f4f6;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="640" align="center" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <tr>
      <td style="background:${banner};padding:20px 24px;">
        <div style="font-size:20px;font-weight:700;color:#ffffff;">${icon} Playwright Run — ${escapeHtml(summary.status.toUpperCase())}</div>
        <div style="margin-top:10px;">${summary.badges.map(badgePill).join('')}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            ${statCell('Total', summary.total, '#111827')}
            ${statCell('Passed', summary.passed, OUTCOME_COLORS.passed)}
            ${statCell('Failed', summary.failed, OUTCOME_COLORS.failed)}
            ${statCell('Flaky', summary.flaky, OUTCOME_COLORS.flaky)}
            ${statCell('Skipped', summary.skipped, OUTCOME_COLORS.skipped)}
            ${statCell('Pass rate', `${summary.passRate}%`, summary.passRate === 100 ? OUTCOME_COLORS.passed : '#111827')}
            ${statCell('Duration', summary.durationText, '#111827')}
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 24px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;">
          ${metaRow('Environment', summary.env)}
          ${metaRow('Trigger', summary.trigger)}
          ${metaRow('Branch', summary.branch)}
          ${metaRow('Commit', summary.commit)}
          ${metaRow('Projects', summary.projects)}
          ${metaRow('Node', summary.nodeVersion)}
          ${metaRow('Finished', summary.finishedAt)}
        </table>
        ${failuresSection}
        ${attachmentNote}
        ${runLink}
      </td>
    </tr>
  </table>
</div>`;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default EmailReporter;
