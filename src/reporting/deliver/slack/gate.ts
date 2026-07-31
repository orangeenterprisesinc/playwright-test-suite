/**
 * @fileoverview Decides whether a run is allowed to post to Slack.
 *
 * Slack is a CI-results channel: the scheduled dry run and nothing else. Local
 * runs (`npm test`, `npx playwright test`, `--debug`, `--ui`) and manual
 * workflow_dispatch / repository_dispatch runs stay silent, so the channel never
 * fills with noise from someone debugging a selector.
 *
 * Reads process.env directly instead of going through configProperties: none of
 * these keys is ever an `ENC(...)` secret, and staying import-free lets
 * scripts/notify/slack-reminder.ts (run by Node's type stripping, which cannot
 * resolve extensionless relative imports) apply the same gate rather than a
 * second copy of it. The keys are documented in src/config/configProperties.ts.
 */

/** Events allowed to notify when `SLACK_NOTIFY_EVENTS` is unset. */
const DEFAULT_NOTIFY_EVENTS = 'schedule';

export interface GateDecision {
    allowed: boolean;
    /** Why it was refused — logged verbatim, so it must name the offending setting. */
    reason: string;
}

function isTruthy(value: string | undefined): boolean {
    return !!value && ['yes', 'true', '1'].includes(value.toLowerCase());
}

export function shouldNotifySlack(): GateDecision {
    if (!isTruthy(process.env.SEND_SLACK)) {
        return { allowed: false, reason: 'SEND_SLACK is not yes' };
    }
    if (process.env.GITHUB_ACTIONS !== 'true') {
        return { allowed: false, reason: 'not a GitHub Actions run — Slack reports CI results only' };
    }

    const event = process.env.GITHUB_EVENT_NAME ?? '';
    const allowedEvents = (process.env.SLACK_NOTIFY_EVENTS || DEFAULT_NOTIFY_EVENTS)
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);

    if (!allowedEvents.includes(event)) {
        return {
            allowed: false,
            reason: `event '${event || 'unknown'}' is not in SLACK_NOTIFY_EVENTS (${allowedEvents.join(', ')})`,
        };
    }
    return { allowed: true, reason: '' };
}

/** True when the payload should be printed instead of posted (`SLACK_DRY_RUN=1`). */
export function isSlackDryRun(): boolean {
    return isTruthy(process.env.SLACK_DRY_RUN);
}
