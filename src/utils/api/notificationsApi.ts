import type { APIRequestContext } from '@playwright/test';
import { ConfigProperties, getConfigValue } from '../../config/configProperties';

/**
 * The Notification module's send path — the one place PET Tiger reports whether
 * an email actually left the server.
 *
 * Two things make this the only assertable email channel in the product:
 *
 * - **Its SMTP comes from database preferences**, not the API's environment. The
 *   resolver reads the `RealTimeSMTP*` group and falls back to `WinSMTP*`
 *   (`input/notification_smtp_prefs.go`), both surfaced by `GET`/`PUT
 *   /preferences` as one normalised `smtp*` group. Every other mailer — the
 *   clock-out flag notification included — takes the process-wide sender chosen
 *   from env at startup, which no test can influence.
 * - **`notify-now` reports per recipient.** The job result carries `success` /
 *   `failed` / `skipped` plus the transport's own error string, so a broken
 *   configuration fails loudly instead of silently dropping the message. There is
 *   no outbox table anywhere in the product to inspect instead.
 *
 * ## Port 465, not 587
 *
 * `587` + `smtpUseSsl: false` fails with `smtp auth: unencrypted connection`:
 * the Go client refuses to transmit credentials over a plaintext socket and does
 * not negotiate STARTTLS. Only implicit TLS on 465 authenticates. Note this does
 * NOT match the framework's own `emailReporter`, which works on 587 because
 * nodemailer upgrades the connection for it — a working 587 config in `.env` is
 * not transferable here.
 *
 * ## The password is stored in clear text, and cannot be encrypted from here
 *
 * `GetSmtpDetails` reads it plaintext and legacy declares the column without
 * `Encrypted=true`, so writing an encrypted value would just hand the ciphertext
 * to the mail server as the password. The storage format is the reader's to
 * decide, not the writer's — making this key use the framework's existing
 * `Encrypted=true` capability is a product change, not something a test can do.
 *
 * Consequently {@link ensureSmtpConfigured} **does not write by default**: it
 * asserts the deployment is already configured and explains how to fix it when
 * not, so no credential ever flows from a scheduled run into a database. The
 * write is opt-in per call, for a one-time manual setup.
 */

/** The SMTP fields `GET /preferences` exposes, as one normalised group. */
export interface SmtpPreferences {
    smtpServer?: string;
    smtpPort?: number;
    smtpUser?: string;
    /** Read-only: the API never returns the password itself. */
    smtpPasswordSet?: boolean;
    smtpFromAddress?: string;
    smtpAuthenticate?: boolean;
    smtpUseSsl?: boolean;
}

/** Gmail's implicit-TLS port. 587 cannot authenticate here — see the file header. */
export const SMTP_IMPLICIT_TLS_PORT = 465;

export async function getSmtpPreferences(request: APIRequestContext): Promise<SmtpPreferences> {
    const res = await request.get('preferences');
    if (!res.ok()) {
        throw new Error(`GET preferences failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).filter(([k]) => /^smtp/i.test(k))) as SmtpPreferences;
}

/** What {@link ensureSmtpConfigured} found, and whether it changed anything. */
export interface SmtpConfigureResult {
    configured: boolean;
    wrote: boolean;
    preferences: SmtpPreferences;
}

/**
 * Confirm the deployment can send notification mail, writing the settings only
 * when explicitly allowed.
 *
 * **Read-only by default.** A scheduled run must never push a credential into a
 * database that stores it in clear text, so the default is to look and report.
 * Pass `allowWrite` (the spec derives it from `NOTIFY_SMTP_WRITE=1`) for the
 * one-time setup of a fresh deployment.
 *
 * `PUT /preferences` replaces the record, so the current body is read and echoed
 * back with only the SMTP group changed.
 */
export async function ensureSmtpConfigured(
    request: APIRequestContext,
    opts: { allowWrite?: boolean } = {},
): Promise<SmtpConfigureResult> {
    const current = await getSmtpPreferences(request);
    const alreadyConfigured = (current.smtpServer ?? '') !== '' && current.smtpPasswordSet === true;
    if (alreadyConfigured) return { configured: true, wrote: false, preferences: current };
    if (!opts.allowWrite) {
        return { configured: false, wrote: false, preferences: current };
    }

    const host = getConfigValue(ConfigProperties.SMTP_HOST);
    const user = getConfigValue(ConfigProperties.SMTP_USER);
    const password = getConfigValue(ConfigProperties.SMTP_PASSWORD);
    const from = getConfigValue(ConfigProperties.EMAIL_FROM) ?? user;
    if (!host || !user || !password) {
        throw new Error(
            'SMTP_HOST / SMTP_USER / SMTP_PASSWORD are not all set — cannot configure notification SMTP. ' +
                'These come from the environment (CI passes them from repository secrets), never from the repo.',
        );
    }

    const existing = await request.get('preferences');
    const body = (await existing.json()) as Record<string, unknown>;
    const res = await request.put('preferences', {
        data: {
            ...body,
            smtpServer: host,
            smtpPort: SMTP_IMPLICIT_TLS_PORT,
            smtpUser: user,
            smtpPassword: password,
            smtpFromAddress: from,
            smtpAuthenticate: true,
            smtpUseSsl: true,
        },
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok()) {
        throw new Error(`PUT preferences failed with ${res.status()}: ${(await res.text()).slice(0, 400)}`);
    }
    return { configured: true, wrote: true, preferences: await getSmtpPreferences(request) };
}

/** A filter script a Notification can be built on (`GET /filter-scripts`). */
export interface FilterScript {
    filterScriptCounter: number;
    name: string;
}

export async function listFilterScripts(request: APIRequestContext): Promise<FilterScript[]> {
    const res = await request.get('filter-scripts');
    if (!res.ok()) {
        throw new Error(`GET filter-scripts failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as unknown;
    return (Array.isArray(body) ? body : []) as FilterScript[];
}

/** `ReportFormatList` values (`setup/notification.go`). PDF is the safe default. */
export const REPORT_FORMAT = { pdf: 101, htmlAttachment: 106, htmlBody: 107, text: 108 } as const;

/**
 * Create a Notification with one email recipient.
 *
 * `timeOfDay1` must be `HH:MM:SS` — `HH:MM` is rejected as
 * `Invalid first time of day.` `locationType` is deliberately absent: the server
 * derives it and refuses a client-supplied value.
 */
export async function createNotification(
    request: APIRequestContext,
    spec: {
        name: string;
        filterScriptCounter: number;
        emailSubject: string;
        usersCounter: number;
        reportFormat?: number;
    },
): Promise<number> {
    const res = await request.post('notifications', {
        data: {
            name: spec.name,
            filterScriptCounter: spec.filterScriptCounter,
            emailSubject: spec.emailSubject,
            active: true,
            recipients: [
                {
                    usersCounter: spec.usersCounter,
                    timeOfDay1: '08:00:00',
                    reportFormat: spec.reportFormat ?? REPORT_FORMAT.pdf,
                },
            ],
        },
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok()) {
        throw new Error(`POST notifications failed with ${res.status()}: ${(await res.text()).slice(0, 400)}`);
    }
    return ((await res.json()) as { notificationCounter: number }).notificationCounter;
}

/** Best-effort teardown — a cleanup failure must never turn a green assert red. */
export async function deleteNotification(request: APIRequestContext, id: number): Promise<boolean> {
    const detail = await request.get(`notifications/${id}`);
    if (!detail.ok()) return false;
    const { version } = (await detail.json()) as { version?: string };
    const res = await request.delete(`notifications/${id}`, {
        data: { rowversion: version },
        headers: { 'Content-Type': 'application/json' },
    });
    return res.ok();
}

/** One recipient's dispatch outcome. `error` carries the transport's own message. */
export interface NotifyRecipientResult {
    line: number;
    usersCounter?: number;
    name?: string;
    /** `success` · `failed` · `skipped` (an unwired format or location type). */
    status: string;
    error?: string;
}

export interface NotifyJob {
    status?: string;
    message?: string;
    processed?: number;
    total?: number;
    successful?: number;
    failed?: number;
    results?: NotifyRecipientResult[];
}

/**
 * Send the notification now and wait for the job to reach a terminal state.
 *
 * `scope: 'all'` is the legacy "Yes" arm: every active recipient, **ignoring the
 * per-recipient date limits** — which is what stops a schedule window from
 * silently filtering the recipient out of a run.
 */
export async function notifyNow(
    request: APIRequestContext,
    id: number,
    opts: { timeoutMs?: number } = {},
): Promise<NotifyJob> {
    const fired = await request.post(`notifications/${id}/notify-now`, {
        data: { scope: 'all' },
        headers: { 'Content-Type': 'application/json' },
    });
    if (!fired.ok()) {
        throw new Error(`POST notify-now failed with ${fired.status()}: ${(await fired.text()).slice(0, 400)}`);
    }
    const { jobId } = (await fired.json()) as { jobId: string };

    const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
    let job: NotifyJob = {};
    for (;;) {
        const res = await request.get(`notifications/${id}/notify-now/${jobId}`);
        if (!res.ok()) {
            throw new Error(`GET notify-now job failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
        }
        job = (await res.json()) as NotifyJob;
        const settled = job.status && job.status !== 'pending' && job.status !== 'running';
        if (settled || Date.now() > deadline) return job;
        await new Promise((r) => setTimeout(r, 2_000));
    }
}
