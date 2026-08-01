/**
 * @fileoverview Block Kit builders for the two Slack messages this framework
 * posts: the per-suite run report and the pre-run reminder.
 *
 * Kept deliberately short. Slack collapses a long message behind "Show more",
 * which hid the Duration row when this carried the HTML email's full field set
 * (commit, projects, node, finished time). Those live in the Allure report and
 * on the run page; the Slack message is a glance, not an archive.
 *
 * Import-free by design (not even the run summary type): scripts/notify/
 * slack-reminder.ts is executed by Node's TypeScript type stripping, which
 * cannot resolve extensionless relative imports. Every input arrives as a plain
 * object so the caller — reporter or CLI — owns the data shaping.
 */
import type { SlackMessage } from './slackApi';

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
    /** Env + CI labels, e.g. `DEV`, `CI`. */
    badges: string[];
    branch: string;
    commit: string;
    /** CI run number, without the `#`. */
    runNumber: string;
    /** Playwright projects that ran, comma-joined. */
    projects: string;
    /** Base URL of the environment under test, e.g. `https://app.ptdev.xyz`. */
    baseUrl: string;
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

/**
 * Slack's native rule. Drawn with `━` characters in a context block it renders
 * flush against the text above and below it; the real block carries its own
 * vertical spacing, which is what makes the message readable.
 */
function divider(): unknown {
    return { type: 'divider' };
}

function linkButton(text: string, url: string): unknown {
    return { type: 'button', text: { type: 'plain_text', text, emoji: true }, url };
}

/** Report buttons — only the destinations that actually exist. */
function reportBlocks(input: RunMessageInput): unknown[] {
    const buttons: unknown[] = [];
    if (input.allureUrl) buttons.push(linkButton('📊 Open Allure Report', input.allureUrl));
    if (input.runUrl) buttons.push(linkButton('🔗 Open GitHub Workflow', input.runUrl));
    if (input.artifactsUrl) buttons.push(linkButton('📦 Download Artifacts', input.artifactsUrl));

    // Say so explicitly, otherwise a report with no Allure button reads as if the
    // report were missing rather than arriving seconds later. Not gated on the
    // buttons: a local run has no CI URLs at all, and the thread upload still
    // happens.
    const threadNote = !input.allureUrl && input.allureInThread;
    if (!buttons.length && !threadNote) return [];

    // No divider and no `*Reports*` heading: a bold one-word section is a whole
    // block of vertical padding to label two self-describing buttons.
    const blocks: unknown[] = [];
    if (buttons.length) blocks.push({ type: 'actions', elements: buttons });
    if (threadNote) {
        blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '📎 Allure report attached in the thread' }] });
    }
    return blocks;
}

function failureBlocks(input: RunMessageInput): unknown[] {
    if (!input.topFailures.length) return [];

    const lines = input.topFailures.map((f) => `• ${f.label}${f.count > 1 ? `  _(${f.count})_` : ''}`);
    if (input.remainingFailures > 0) lines.push(`_+${input.remainingFailures} more..._`);

    return [
        divider(),
        { type: 'section', text: { type: 'mrkdwn', text: `*Top Failures*\n${lines.join('\n')}` } },
    ];
}

/** `https://app.ptdev.xyz/` → `app.ptdev.xyz`, for use as a link label. */
function hostOf(url: string): string {
    return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/**
 * Builds the per-suite run report: one line of counts, one context line of run
 * metadata, the top failing modules, and the report links.
 *
 * The suite name replaces the generic "Playwright" in the header — the dry run
 * posts two of these and they have to be distinguishable at a glance.
 */
export function buildRunMessage(input: RunMessageInput): SlackMessage {
    const icon = input.passed ? '✅' : '❌';
    const headline = `${icon} ${input.suiteName} — ${input.passed ? 'PASSED' : 'FAILED'}`;
    const { passed, failed, flaky, skipped } = input.counts;

    // One line, not a `fields` grid: Slack lays fields out two per row and each
    // `*Label:*\n0` costs two rendered lines, so six counters filled six lines
    // with four zeros. Zeros stay visible — a missing "0 failed" reads as
    // unreported rather than none.
    const stats = [
        `*${passed}* passed`,
        `*${failed}* failed`,
        `*${flaky}* flaky`,
        `*${skipped}* skipped`,
        `*${input.passRate}%* pass rate`,
        `*${input.durationText}*`,
    ].join('  ·  ');

    const context = [
        input.badges.map((b) => `\`${b}\``).join(' '),
        input.executionLabel,
        `\`${input.branch}@${input.commit}\``,
        ...(input.runNumber ? [`run *#${input.runNumber}*`] : []),
        ...(input.baseUrl ? [`<${input.baseUrl}|${hostOf(input.baseUrl)}>`] : []),
        input.projects,
    ]
        .filter(Boolean)
        .join('  ·  ');

    const blocks: unknown[] = [
        { type: 'header', text: { type: 'plain_text', text: headline, emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: stats } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: context }] },
        ...failureBlocks(input),
        ...reportBlocks(input),
    ];

    return {
        // `fallback`, not a top-level `text`: Slack renders top-level text as a
        // line ABOVE the attachment, which duplicated the header verbatim.
        // Notifications and unformatted clients use this instead.
        attachments: [
            {
                color: input.color,
                fallback: `${headline} — ${passed} passed, ${failed} failed, ${flaky} flaky, ${skipped} skipped`,
                blocks,
            },
        ],
    };
}

export interface ReminderInput {
    /** Human-readable start time, e.g. `4:31 PM IST`. */
    startsAt: string;
    /** Minutes until `startsAt`; omitted from the message when 0. */
    leadMinutes: number;
    /** Suite names in execution order. */
    jobs: string[];
    color: string;
}

/** Builds the informational "execution starts soon" reminder. */
export function buildReminderMessage(input: ReminderInput): SlackMessage {
    const headline = '🧪 Scheduled Playwright Dry Run';

    const lead = input.leadMinutes > 0 ? ` (in ~${input.leadMinutes} min)` : '';
    const line = [
        `Starts at *${input.startsAt}*${lead}`,
        ...(input.jobs.length ? [`Jobs: ${input.jobs.map((j) => `*${j}*`).join(' → ')}`] : []),
    ].join('  ·  ');

    const blocks: unknown[] = [
        { type: 'header', text: { type: 'plain_text', text: headline, emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: line } },
    ];

    return {
        attachments: [
            {
                color: input.color,
                fallback: `${headline} — starts at ${input.startsAt} (${input.jobs.join(', ')})`,
                blocks,
            },
        ],
    };
}
