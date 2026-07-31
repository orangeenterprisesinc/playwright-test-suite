/**
 * @fileoverview Block Kit builders for the two Slack messages this framework
 * posts: the per-suite run report and the pre-run reminder.
 *
 * Deliberately import-free (not even the run summary type): scripts/notify/
 * slack-reminder.ts is executed by Node's TypeScript type stripping, which
 * cannot resolve extensionless relative imports. Every input arrives as a plain
 * object so the caller — reporter or CLI — owns the data shaping.
 */
import type { SlackMessage } from './slackApi';

const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━';
const BOT_NAME = '🧪 Playwright QA Bot';
const FOOTER = 'Generated automatically by Playwright QA Bot';

/** One line of the Top Failures list: a module (feature area) and how many of its tests failed. */
export interface FailureGroup {
    label: string;
    count: number;
}

export interface RunMessageInput {
    /** Suite identity, e.g. `User Journey` or `WebPet` — one report per suite, never merged. */
    suiteName: string;
    /** How the run was started, e.g. `Scheduled Dry Run`. */
    executionLabel: string;
    passed: boolean;
    /** Hex colour for the attachment's side bar. */
    color: string;
    environment: string;
    branch: string;
    /** CI run number, without the `#`. */
    runNumber: string;
    counts: { passed: number; failed: number; flaky: number; skipped: number };
    passRate: number;
    durationText: string;
    /** Up to five modules with failures, most-failing first. */
    topFailures: FailureGroup[];
    /** Failed tests not represented by the lines above — rendered as `+N more...`. */
    remainingFailures: number;
    allureUrl: string;
    runUrl: string;
    artifactsUrl: string;
    /** True when the Allure report is being uploaded into this message's thread. */
    allureInThread: boolean;
}

function divider(): unknown {
    return { type: 'context', elements: [{ type: 'mrkdwn', text: RULE }] };
}

function linkButton(text: string, url: string): unknown {
    return { type: 'button', text: { type: 'plain_text', text, emoji: true }, url };
}

/** `*Reports*` buttons — only the destinations that actually exist. */
function reportBlocks(input: RunMessageInput): unknown[] {
    const buttons: unknown[] = [];
    if (input.allureUrl) buttons.push(linkButton('📊 Open Allure Report', input.allureUrl));
    if (input.runUrl) buttons.push(linkButton('🔗 Open GitHub Workflow', input.runUrl));
    if (input.artifactsUrl) buttons.push(linkButton('📦 Download Artifacts', input.artifactsUrl));
    if (!buttons.length) return [];

    const blocks: unknown[] = [
        divider(),
        { type: 'section', text: { type: 'mrkdwn', text: '*Reports*' } },
        { type: 'actions', elements: buttons },
    ];
    // Say so explicitly, otherwise a report with no Allure button reads as if the
    // report were missing rather than arriving seconds later.
    if (!input.allureUrl && input.allureInThread) {
        blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '📎 Allure report attached in the thread' }] });
    }
    return blocks;
}

function failureBlocks(input: RunMessageInput): unknown[] {
    if (!input.topFailures.length) return [];

    const lines = input.topFailures.map((f) => `• ${f.label}${f.count > 1 ? `  _(${f.count})_` : ''}`);
    if (input.remainingFailures > 0) lines.push(`\n_+${input.remainingFailures} more..._`);

    return [
        divider(),
        { type: 'section', text: { type: 'mrkdwn', text: `*Top Failures*\n${lines.join('\n')}` } },
    ];
}

/** Builds the per-suite run report. */
export function buildRunMessage(input: RunMessageInput): SlackMessage {
    const icon = input.passed ? '🟢' : '🔴';
    const headline = `${icon} ${input.suiteName.toUpperCase()} ${input.passed ? 'PASSED' : 'FAILED'}`;
    const { passed, failed, flaky, skipped } = input.counts;

    const blocks: unknown[] = [
        { type: 'context', elements: [{ type: 'mrkdwn', text: BOT_NAME }] },
        divider(),
        { type: 'header', text: { type: 'plain_text', text: headline, emoji: true } },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: `*Environment*\n${input.environment.toUpperCase()}` },
                { type: 'mrkdwn', text: `*Execution*\n${input.executionLabel}` },
                { type: 'mrkdwn', text: `*Branch*\n\`${input.branch}\`` },
                { type: 'mrkdwn', text: `*Run*\n${input.runNumber ? `#${input.runNumber}` : 'n/a'}` },
            ],
        },
        divider(),
        { type: 'section', text: { type: 'mrkdwn', text: '*Summary*' } },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: `*Passed*\n${passed}` },
                { type: 'mrkdwn', text: `*Failed*\n${failed}` },
                { type: 'mrkdwn', text: `*Flaky*\n${flaky}` },
                { type: 'mrkdwn', text: `*Skipped*\n${skipped}` },
                { type: 'mrkdwn', text: `*Duration*\n${input.durationText}` },
                { type: 'mrkdwn', text: `*Pass rate*\n${input.passRate}%` },
            ],
        },
        ...failureBlocks(input),
        ...reportBlocks(input),
        divider(),
        { type: 'context', elements: [{ type: 'mrkdwn', text: FOOTER }] },
    ];

    return {
        text: `${headline} — ${passed} passed, ${failed} failed, ${flaky} flaky, ${skipped} skipped`,
        attachments: [{ color: input.color, blocks }],
    };
}

export interface ReminderInput {
    /** Human-readable start time, e.g. `4:00 PM IST`. */
    startsAt: string;
    /** Suite names in execution order. */
    jobs: string[];
    color: string;
}

/** Builds the informational "execution starts soon" reminder. */
export function buildReminderMessage(input: ReminderInput): SlackMessage {
    const headline = '🧪 Scheduled Playwright Dry Run';

    const blocks: unknown[] = [
        { type: 'header', text: { type: 'plain_text', text: headline, emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: `Execution starts at *${input.startsAt}*.` } },
        divider(),
        { type: 'section', text: { type: 'mrkdwn', text: `*Jobs*\n${input.jobs.map((j) => `• ${j}`).join('\n')}` } },
        divider(),
        { type: 'context', elements: [{ type: 'mrkdwn', text: '_This is only an informational reminder._' }] },
    ];

    return {
        text: `${headline} — starts at ${input.startsAt} (${input.jobs.join(', ')})`,
        attachments: [{ color: input.color, blocks }],
    };
}
