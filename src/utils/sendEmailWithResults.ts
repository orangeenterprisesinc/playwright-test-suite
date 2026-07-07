/**
 * @fileoverview Email notification service for test execution results.
 *
 * Assembles a summary email (subject + body) based on pass/fail/skip counts
 * and the current Git branch, retrieves recipients from the database, and
 * sends the message via SMTP (nodemailer). Gracefully skips if email is
 * disabled, recipients are not configured, or nodemailer is not installed.
 *
 * @module utils/sendEmailWithResults
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { sendEmail } from '@utils/sendEmailWithResults';
 *
 * await sendEmail(42, 3, 1, '00:12:34');
 * ```
 */
import { Logger } from './logger';
import { FrameworkConstants } from '../constants/frameworkConstants';
import { ConfigProperties, getConfigValue } from '../enums';
import { retrieveRowData } from './databaseConnectionManager';
import fs from 'fs';
import path from 'path';

/**
 * Loads email configuration from `src/data/email_config.json`.
 *
 * @returns {Record<string, string | number>} Parsed email config, or empty object if file not found
 */
function loadEmailConfig(): Record<string, string | number> {
    const configPath = path.resolve(__dirname, '..', 'data', 'email_config.json');
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

const logger = new Logger('SendEmailWithResults');

/**
 * Environment variable keys for SMTP configuration.
 *
 * @enum {string}
 */
export enum EmailProperty {
    FROM_EMAIL = 'FROM_EMAIL',
    EMAIL_PASSWORD = 'EMAIL_PASSWORD',
    SMTP_HOST = 'SMTP_HOST',
    SMTP_PORT = 'SMTP_PORT',
    TO_EMAIL = 'TO_EMAIL',
}

/**
 * Reads an email configuration value from `email_config.json`.
 * @param {EmailProperty} key - Configuration key
 * @returns {string} Value, or empty string if not found
 * @private
 */
function getEmailValue(key: EmailProperty): string {
    const config = loadEmailConfig();
    return config[key] !== undefined ? String(config[key]) : '';
}

/**
 * Returns a time-appropriate greeting ("Good Morning" or "Good Afternoon").
 * @returns {string}
 * @private
 */
function getGreeting(): string {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good Morning' : 'Good Afternoon';
}

/**
 * Formats the current date and time for use in email subjects/bodies.
 * @returns {{ date: string; time: string }} `YYYY-MM-DD` and `hh:mm AM/PM`
 * @private
 */
function formatNow(): { date: string; time: string } {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const h = now.getHours() % 12 || 12;
    const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
    const time = `${pad(h)}:${pad(now.getMinutes())} ${ampm}`;
    return { date, time };
}

/**
 * Builds the email subject line based on the Git branch and timestamp.
 * @param {string} branch - Git branch name
 * @param {string} formattedDate - Date string
 * @param {string} formattedTime - Time string
 * @returns {string} Email subject
 * @private
 */
function buildSubject(branch: string, formattedDate: string, formattedTime: string): string {
    const svc = FrameworkConstants.SERVICE_NAME;
    switch (branch) {
        case 'main':
            return `${svc} - UAT/Staging Test Automation Report for ${formattedDate} at ${formattedTime}`;
        case 'dev-qe':
            return `${svc} - QE Unit Test Automation Report for ${formattedDate} at ${formattedTime}`;
        case 'dry-run':
            return `${svc} - Dry Run Automation Test Report for ${formattedDate} at ${formattedTime}`;
        default:
            return `${svc} - Local Run Automation Test Execution Report ( ${formattedDate} , ${formattedTime} )`;
    }
}

/**
 * Maps a Git branch name to a human-readable environment label.
 * @param {string} branch - Git branch name
 * @returns {string} Environment label (e.g. 'UAT/Staging', 'QE', 'Local')
 * @private
 */
function branchToEnvironmentLabel(branch: string): string {
    switch (branch) {
        case 'main':
            return 'UAT/Staging';
        case 'dev-qe':
            return 'QE';
        case 'dry-run':
            return 'Dry Run';
        default:
            return 'Local';
    }
}

/**
 * Builds the plain-text email body with execution summary and CI/CD details.
 * @param {object} params - Summary parameters
 * @returns {string} Formatted email body
 * @private
 */
function buildBody(params: {
    passedCount: number;
    failedCount: number;
    skippedCount: number;
    executionDuration: string;
    envLabel: string;
    formattedDate: string;
    formattedTime: string;
}): string {
    const total = params.passedCount + params.failedCount + params.skippedCount;
    const branchName = process.env.CI_COMMIT_REF_NAME ?? FrameworkConstants.BRANCH_NAME;
    const repoName = process.env.CI_PROJECT_NAME ?? FrameworkConstants.SERVICE_NAME;
    const pipelineId = process.env.CI_PIPELINE_ID ?? 'N/A';
    const pipelineUrl = process.env.CI_PIPELINE_URL ?? 'N/A';
    const isCI = params.envLabel !== 'Local';

    let body = `${getGreeting()} Team,\n\nPlease find attached the ${FrameworkConstants.SERVICE_NAME} Automation Execution Report.\n\n`;
    body += `Execution Summary:\n==================\n`;
    body += `Project / Module: ${repoName}\n`;
    body += `Execution Environment: ${params.envLabel}\n`;
    body += `Triggered From: ${isCI ? 'CI/CD Pipeline' : 'Local'}\n`;
    if (isCI) body += `Branch: ${branchName}\n`;
    body += `Execution Date & Time: ${params.formattedDate} at ${params.formattedTime}\n`;
    body += `Total Test Cases Executed: ${total}\n`;
    body += `Passed: ${params.passedCount}\nFailed: ${params.failedCount}\nSkipped: ${params.skippedCount}\n`;
    body += `Execution Duration: ${params.executionDuration}\n`;
    if (isCI) {
        body += `Pipeline ID: ${pipelineId}\nPipeline URL: ${pipelineUrl}\n`;
    }
    body += `\nRegards,\nQE Automation Team`;
    return body;
}

/**
 * Sends an email with the test execution results and optionally attaches the Playwright HTML report.
 *
 * @param {number} passedCount - Number of passed tests.
 * @param {number} failedCount - Number of failed tests.
 * @param {number} skippedCount - Number of skipped tests.
 * @param {string} [executionDuration='00:00:00'] - Total execution duration.
 * @param {string} [reportPath] - Optional absolute path to the Playwright HTML report to attach.
 * @returns {Promise<void>}
 * @author Vicky
 */
export async function sendEmail(
    passedCount: number,
    failedCount: number,
    skippedCount: number,
    executionDuration = '00:00:00',
    reportPath?: string,
): Promise<void> {
    const branch = FrameworkConstants.BRANCH_NAME;
    const { date, time } = formatNow();
    const envLabel = branchToEnvironmentLabel(branch);

    // ── Resolve recipient: env TO_EMAIL → DB fallback ──
    let to = getEmailValue(EmailProperty.TO_EMAIL);

    if (!to) {
        // Fallback: try fetching from DB alert_recipients table
        try {
            const runMode = getConfigValue(ConfigProperties.RUN_MODE, 'local').toLowerCase();
            const table =
                runMode === 'remote'
                    ? 'service_automation_runner_manager.atlas_practice_automation_alert_recipients'
                    : 'atlas_practice_automation_alert_recipients';
            const query = `SELECT * FROM ${table} WHERE git_branch = '${branch}';`;
            const recipientRow = await retrieveRowData(query);

            if (!recipientRow.email_enabled || recipientRow.email_enabled.toLowerCase() !== 'yes') {
                logger.info('Email notification is disabled for this branch');
                return;
            }
            to = recipientRow.email_address || '';
        } catch {
            logger.warn('Could not fetch email recipients from DB and TO_EMAIL not set — skipping email');
            return;
        }
    }

    if (!to) {
        logger.warn('No recipient email configured (TO_EMAIL env or DB) — skipping');
        return;
    }

    const fromEmail = getEmailValue(EmailProperty.FROM_EMAIL);
    if (!fromEmail) {
        logger.warn('FROM_EMAIL not configured — skipping email');
        return;
    }

    const subject = buildSubject(branch, date, time);
    const body = buildBody({
        passedCount,
        failedCount,
        skippedCount,
        executionDuration,
        envLabel,
        formattedDate: date,
        formattedTime: time,
    });

    try {
        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.createTransport({
            host: getEmailValue(EmailProperty.SMTP_HOST) || 'smtp.gmail.com',
            port: Number(getEmailValue(EmailProperty.SMTP_PORT) || '587'),
            secure: false,
            auth: {
                user: fromEmail,
                pass: getEmailValue(EmailProperty.EMAIL_PASSWORD),
            },
        });

        // ── Build attachments list ──
        const attachments: { filename: string; path: string }[] = [];

        // Attach Playwright HTML report if provided and exists
        const resolvedReport = reportPath
            || path.join(process.cwd(), 'playwright-report', 'index.html');
        if (fs.existsSync(resolvedReport)) {
            attachments.push({
                filename: 'playwright-report.html',
                path: resolvedReport,
            });
            logger.info(`Attaching Playwright report: ${resolvedReport}`);
        } else {
            logger.warn(`Playwright report not found at: ${resolvedReport}`);
        }

        await transporter.sendMail({
            from: fromEmail,
            to,
            subject,
            text: body,
            attachments,
        });
        logger.info(`Email sent successfully to ${to}`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Cannot find module') || msg.includes('MODULE_NOT_FOUND')) {
            logger.warn('nodemailer is not installed. Run: npm install nodemailer');
        } else {
            logger.error(`Failed to send email: ${msg}`);
        }
    }
}
