/**
 * Posts the "execution starts soon" Slack reminder for the scheduled dry run.
 *
 * Usage:
 *   npm run notify:reminder                # post (subject to the Slack gate)
 *   npm run notify:reminder -- --dry-run   # print the payload, post nothing
 *
 * Node runs this .ts file directly via type stripping, exactly like
 * scripts/config/secret.ts — hence the `.ts` extensions on the imports below and
 * the `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` flag in the npm script.
 * That also constrains what it may import: src/reporting/deliver/slack/{gate,
 * blocks,slackApi}.ts all resolve to node builtins only, so nothing here needs
 * a transpiler. Reading credentials from process.env rather than
 * configProperties keeps it that way (CI injects them in plaintext).
 */
import { buildReminderMessage } from '../../src/reporting/deliver/slack/blocks.ts';
import { shouldNotifySlack } from '../../src/reporting/deliver/slack/gate.ts';
import { postMessage, postWebhook } from '../../src/reporting/deliver/slack/slackApi.ts';

const DEFAULT_STARTS_AT = '4:00 PM IST';
const DEFAULT_JOBS = 'User Journey,WebPet';
const INFO_COLOR = '#3b82f6';

const dryRun = process.argv.slice(2).includes('--dry-run');

const message = buildReminderMessage({
    startsAt: process.env.REMINDER_STARTS_AT || DEFAULT_STARTS_AT,
    jobs: (process.env.REMINDER_JOBS || DEFAULT_JOBS)
        .split(',')
        .map((job) => job.trim())
        .filter(Boolean),
    color: INFO_COLOR,
});

if (dryRun) {
    console.log(JSON.stringify(message, null, 2));
    process.exit(0);
}

const gate = shouldNotifySlack();
if (!gate.allowed) {
    console.log(`Slack reminder skipped (${gate.reason})`);
    process.exit(0);
}

const botToken = process.env.SLACK_BOT_TOKEN ?? '';
const channel = process.env.SLACK_CHANNEL_ID ?? '';
const webhookUrl = process.env.SLACK_WEBHOOK_URL ?? '';

try {
    if (botToken && channel) {
        await postMessage(botToken, channel, message);
    } else if (webhookUrl) {
        await postWebhook(webhookUrl, message);
    } else {
        console.log(
            '::warning::Slack reminder skipped — set SLACK_BOT_TOKEN + SLACK_CHANNEL_ID or SLACK_WEBHOOK_URL',
        );
        process.exit(0);
    }
    console.log('Slack reminder sent');
} catch (error: unknown) {
    // Unlike the reporter (which must never fail a test run) this is a standalone
    // step, so a broken token should show up red rather than pass silently.
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`::error::Slack reminder failed: ${msg}`);
    process.exit(1);
}
