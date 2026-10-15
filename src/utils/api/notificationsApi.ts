import type { APIRequestContext } from '@playwright/test';

/**
 * Read-side helpers for the Notification module's send path — the one place PET Tiger reports whether
 * an email actually left the server. Everything that changes state (mail settings, the notification,
 * Notify Now) happens on screen; see `NotificationsPage` and `PreferencesPage`. What stays here is
 * the GET reads and the teardown delete.
 *
 * Two things make this the only assertable email channel in the product:
 *
 * - **Its SMTP comes from database preferences**, not the API's environment. The
 *   resolver reads the `RealTimeSMTP*` group and falls back to `WinSMTP*`
 *   (`input/notification_smtp_prefs.go`), both surfaced by `GET /preferences` as one normalised
 *   `smtp*` group. Every other mailer — the clock-out flag notification included — takes the
 *   process-wide sender chosen from env at startup, which no test can influence.
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
 * Storing it encrypted is a **deferred phase** (team decision 2026-08-31), so the
 * run types the plaintext settings into Preferences ▸ Connectivity ▸ Notification when a deployment
 * has none. That is deliberate rather than careless: dev resets wipe the
 * preferences, and a run that only *checked* would leave CI red after every reset
 * until someone re-ran a manual setup. `NOTIFY_SMTP_WRITE=0` makes a run read-only.
 *
 * Use a **dedicated sending mailbox**, not a personal account — the recipient can
 * still be a person. That bounds the exposure to a disposable credential until the
 * encryption phase lands.
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

/** What the deployment's mail settings read as, and whether this run changed them. */
export interface SmtpConfigureResult {
    configured: boolean;
    wrote: boolean;
    preferences: SmtpPreferences;
}

/** A host is stored and a password is set. */
export function isSmtpConfigured(prefs: SmtpPreferences): boolean {
    return (prefs.smtpServer ?? '') !== '' && prefs.smtpPasswordSet === true;
}

/** Read the mail settings; never writes. */
export async function readSmtpState(request: APIRequestContext): Promise<SmtpConfigureResult> {
    const preferences = await getSmtpPreferences(request);
    return { configured: isSmtpConfigured(preferences), wrote: false, preferences };
}

/** A filter script a Notification can be built on (`GET /filter-scripts`). */
export interface FilterScript {
    filterScriptCounter: number;
    name: string;
    /**
     * Whether the script produces a report. A notification built on one that does
     * not (dev's `DashBoardTimeInReviewOfCrewProductivity` is the first row the
     * endpoint returns) dispatches as `failed` with `render failed` — there is
     * nothing to render, so the transport never gets a message.
     */
    executeReport?: boolean;
    active?: boolean;
}

export async function listFilterScripts(request: APIRequestContext): Promise<FilterScript[]> {
    const res = await request.get('filter-scripts');
    if (!res.ok()) {
        throw new Error(`GET filter-scripts failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as unknown;
    return (Array.isArray(body) ? body : []) as FilterScript[];
}

/** The id of a notification by exact name, for when the on-screen save does not land on `/setup/notifications/{id}`. */
export async function findNotificationIdByName(request: APIRequestContext, name: string): Promise<number | null> {
    const res = await request.get('notifications');
    if (!res.ok()) {
        throw new Error(`GET notifications failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as unknown;
    const rows = Array.isArray(body)
        ? body
        : ((body as { items?: unknown[]; data?: unknown[] }).items ?? (body as { data?: unknown[] }).data ?? []);
    const wanted = name.trim();
    const hit = (rows as { name?: string; notificationCounter?: number }[]).find((r) => (r.name ?? '').trim() === wanted);
    return hit?.notificationCounter ?? null;
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

/** `ok: false` only when the WEBPET-1907 404 signature outlasted the whole deadline. */
export type NotifyNowResult = { ok: true; job: NotifyJob } | { ok: false; reason: 'job-store-unreachable' };

/**
 * Poll a Notify Now job (fired by the screen's All Recipients button) to a terminal state.
 * All Recipients is the legacy "Yes" arm: every active recipient, **ignoring the per-recipient date
 * limits** — which is what stops a schedule window from silently filtering the recipient out.
 */
export async function pollNotifyNowJob(
    request: APIRequestContext,
    id: number,
    jobId: string,
    opts: { timeoutMs?: number } = {},
): Promise<NotifyNowResult> {
    const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
    for (;;) {
        const res = await request.get(`notifications/${id}/notify-now/${jobId}`);
        if (!res.ok()) {
            const bodyText = await res.text();
            let code: string | undefined;
            try {
                code = (JSON.parse(bodyText) as { code?: string }).code;
            } catch {
                // Not JSON — leaves code undefined and falls through to the throw.
            }
            // 404 not_found right after a 2xx POST is not "no such job": the API keeps
            // Notify Now jobs in a per-process sync.Map (web-pet
            // notification_notify_now_jobs.go, WEBPET-1907), so a poll routed to a
            // different API task than the POST cannot see it. Which task answers is
            // luck, so keep polling inside the deadline rather than dying on the first
            // miss. Only this exact signature is tolerated.
            if (res.status() === 404 && code === 'not_found') {
                if (Date.now() > deadline) return { ok: false, reason: 'job-store-unreachable' };
                await new Promise((r) => setTimeout(r, 2_000));
                continue;
            }
            throw new Error(`GET notify-now job ${jobId} failed with ${res.status()}: ${bodyText.slice(0, 300)}`);
        }
        const job = (await res.json()) as NotifyJob;
        const settled = job.status && job.status !== 'pending' && job.status !== 'running';
        if (settled || Date.now() > deadline) return { ok: true, job };
        await new Promise((r) => setTimeout(r, 2_000));
    }
}
