import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { SESSION_STORAGE_STATE, csrfTokenFromStorageFile } from './sessionContext';
import { ConfigProperties, getConfigValue } from '../../config/configProperties';

/**
 * Uploads a device export into web-pet's Connectivity import and follows the run
 * to a terminal state — the office half of Journey B.
 *
 * ## Why this needs its own request context
 *
 * `sessionApi` pins `Content-Type: application/json` in `extraHTTPHeaders`, and
 * Playwright's fetch keeps an existing content-type when serialising multipart
 * (`setHeader(..., keepExisting)`); the boundary header is dropped and the file is
 * posted as JSON. So the upload gets a context built **without** a pinned
 * content-type, carrying the same session cookies plus the CSRF/Origin pair the
 * mutating endpoints require.
 */

const IMPORT_PATH = 'connectivity/import/single-folder';

export interface ImportFileResult {
    status?: string;
    fileName?: string;
    message?: string;
    [key: string]: unknown;
}

export interface ImportRunResult {
    runId: number;
    /** Rolled-up status: completed | failed | partial (terminal), or the last seen. */
    status: string;
    files: ImportFileResult[];
    /** Whatever the poll returned last, for assertions this helper does not model. */
    raw: unknown;
}

const TERMINAL = ['completed', 'failed', 'partial'];

/**
 * The signature of an environment without object storage.
 *
 * Every ingest route (`single-folder`, `internet`) writes the uploaded bytes with
 * `storage.Put` before the worker parses them, so without storage the upload is
 * recorded `failed` with this message and the run never leaves `received`.
 *
 * Fixed on dev staging 2026-08-12 (WEBPET-1830: the task role was missing
 * `kms:GenerateDataKey` on the bucket's CMK). Still checked, because that fix
 * currently lives only as an AWS console change — the matching Terraform branch
 * is unpushed, so a future `terraform apply` would revert it.
 */
const NO_STORAGE_MESSAGE = 'could not store uploaded file';

export function isStorageUnavailable(run: ImportRunResult): boolean {
    return run.files.some((f) => String(f.message ?? '').includes(NO_STORAGE_MESSAGE));
}

/** Human-readable reason used when storage is missing (WEBPET-1830). */
export const NO_STORAGE_REASON =
    'Connectivity import needs object storage to persist the uploaded file, and this ' +
    'environment could not store it. This was WEBPET-1830 (fixed on dev 2026-08-12 by ' +
    'granting the tigerden task role kms:GenerateDataKey on the app-storage CMK); seeing it ' +
    'again means that console-only policy was reverted — check for a terraform apply on ' +
    'IaC-PetTiger-Web. The containerized stack boots MinIO and is unaffected.';

/**
 * Why a stored file can sit at `received`. Two causes, indistinguishable at the
 * API — both look exactly like "queued" (200, `received`, empty message), which
 * is why this spells them out instead of surfacing a bare timeout.
 *
 * 1. The worker is off (`PT_IMPORT_WORKER_DISABLED=true`) — nothing ever claims
 *    the file. WEBPET-2137 / PET-12482; fixed on dev 2026-08-14.
 * 2. The worker is on but not due yet. It claims files per client on the cadence
 *    in that client's `SrvcRealTimeImportInterval` preference (minutes), so the
 *    wait is up to a full interval. This is the usual cause now.
 */
export const STUCK_AT_RECEIVED_REASON =
    'The file was stored successfully but has not been parsed — the run is still at "received". ' +
    'Two causes look identical here. (a) The import worker is off: check CloudWatch ' +
    '/ecs/pettiger/dev/tigerden for "import-worker: disabled via PT_IMPORT_WORKER_DISABLED=true" ' +
    'at container start (WEBPET-2137 / PET-12482 — fixed on dev 2026-08-14, so this should be ' +
    'absent). (b) More likely: the worker is running but this client is not due yet — it claims ' +
    'queued files every SrvcRealTimeImportInterval minutes (GET /api/preferences → ' +
    'serviceImportInterval). Raise IMPORT_POLL_TIMEOUT_MS above that interval, or ask for ' +
    'PT_IMPORT_POLL_INTERVAL=10s on the dev task to make the tick immediate. Note a preference ' +
    'change only applies from the NEXT due time, so one old interval must lapse first.';

/**
 * A request context that can post multipart as the logged-in user.
 * Dispose it when done (see {@link importDeviceExport}, which owns its own).
 */
export async function createUploadContext(): Promise<APIRequestContext> {
    const baseURL = getConfigValue(ConfigProperties.API_URL);
    const appOrigin = getConfigValue(ConfigProperties.APP_URL);
    if (!baseURL) throw new Error('API_URL is not set — cannot upload a device export');

    const csrf = csrfTokenFromStorageFile();
    if (!csrf) {
        // Without it every mutating call 403s on the CSRF guard, which surfaces as a
        // confusing "import failed" rather than "you have no session".
        throw new Error(
            `No CSRF token in ${SESSION_STORAGE_STATE} — run auth-setup before importing.`,
        );
    }
    return playwrightRequest.newContext({
        baseURL: baseURL.endsWith('/') ? baseURL : `${baseURL}/`,
        storageState: SESSION_STORAGE_STATE,
        extraHTTPHeaders: { Origin: appOrigin, 'X-CSRF-Token': csrf },
    });
}

/**
 * POST the envelope, then poll the run until it reaches a terminal status.
 *
 * Returns the run **including the per-file results**, because a `partial` tells
 * you nothing on its own — the per-file message is what says which record failed
 * and why.
 */
export async function importDeviceExport(
    upload: APIRequestContext,
    xml: string,
    opts: { fileName?: string; timeoutMs?: number } = {},
): Promise<ImportRunResult> {
    const fileName = opts.fileName ?? `FromDevice-${Date.now()}.xml`;
    // The worker claims queued files on a PER-CLIENT cadence read from the
    // SrvcRealTimeImportInterval preference — 15 MINUTES on dev staging, not the
    // legacy 2-minute default. 60s is fine wherever PT_IMPORT_POLL_INTERVAL sets
    // a fast tick; raise it via IMPORT_POLL_TIMEOUT_MS to ride out a real cadence.
    const timeoutMs = opts.timeoutMs ?? (Number(process.env.IMPORT_POLL_TIMEOUT_MS) || 60_000);

    const res = await upload.post(IMPORT_PATH, {
        multipart: {
            files: { name: fileName, mimeType: 'application/xml', buffer: Buffer.from(xml, 'utf-8') },
        },
    });
    if (!res.ok()) {
        throw new Error(
            `POST ${IMPORT_PATH} failed with ${res.status()}: ${(await res.text()).slice(0, 400)}`,
        );
    }
    const created = (await res.json()) as { runId?: number; id?: number; files?: ImportFileResult[] };
    const runId = Number(created.runId ?? created.id);
    if (!Number.isFinite(runId)) {
        throw new Error(`Import response carried no run id: ${JSON.stringify(created).slice(0, 300)}`);
    }

    // The upload response already reports a per-file outcome. When every file is
    // terminal there is nothing to wait for — and one case *never* resolves: a file
    // that could not be stored is marked `failed` immediately while the run stays
    // `received` forever, because the worker only claims files whose bytes exist.
    // Polling that would burn the timeout and then report "no terminal status",
    // hiding the real reason.
    const uploadFiles = created.files ?? [];
    if (uploadFiles.length && uploadFiles.every((f) => TERMINAL.includes(String(f.status)))) {
        return {
            runId,
            status: uploadFiles.every((f) => f.status === 'completed') ? 'completed' : 'failed',
            files: uploadFiles,
            raw: created,
        };
    }

    return waitForImportRun(upload, runId, timeoutMs, created);
}

/** Poll one import run until it reaches a terminal status. */
export async function waitForImportRun(
    request: APIRequestContext,
    runId: number,
    timeoutMs: number,
    seed: { status?: string; files?: ImportFileResult[] } = {},
): Promise<ImportRunResult> {
    const deadline = Date.now() + timeoutMs;
    let last: { status?: string; files?: ImportFileResult[] } = seed;
    for (;;) {
        const poll = await request.get(`connectivity/import/runs/${runId}`);
        if (poll.ok()) {
            last = (await poll.json()) as { status?: string; files?: ImportFileResult[] };
            if (TERMINAL.includes(String(last.status))) break;
        }
        if (Date.now() > deadline) {
            // 'received' specifically means stored-but-unclaimed, so name the cause
            // instead of reporting a bare timeout.
            const stuck = String(last.status) === 'received' ? ` ${STUCK_AT_RECEIVED_REASON}` : '';
            throw new Error(
                `Import run ${runId} did not reach a terminal status within ${timeoutMs}ms ` +
                    `(last: ${String(last.status)}).${stuck}`,
            );
        }
        await new Promise((r) => setTimeout(r, 1_000));
    }

    return {
        runId,
        status: String(last.status),
        files: last.files ?? [],
        raw: last,
    };
}

/** What `POST connectivity/import/internet` reports about the pull itself. */
export interface InternetPullResult {
    runId: number;
    filesPulled: number;
    status: string;
    message: string;
}

/**
 * The **internet** transport: ask the office to drain its relay mailbox, the
 * same POST the Connectivity ▸ Import ▸ Internet screen makes. Preferred over
 * `single-folder` because it exercises the WebMail leg a real device sync uses.
 *
 * The route answers HTTP 200 whatever happens, so the body's `status` is the
 * outcome: `ok` pulled files, `no-data` found none, anything else is a closed
 * relay gate. `no-data` is NOT a failure under `workers=2` — every worker shares
 * one office mailbox, so a peer's pull can drain our envelope into its own run.
 * The rows still land in the same client DB, and matching by reference proves
 * ownership either way.
 */
export async function pullFromRelayInternet(
    request: APIRequestContext,
    opts: { timeoutMs?: number } = {},
): Promise<{ pull: InternetPullResult; run?: ImportRunResult }> {
    const timeoutMs = opts.timeoutMs ?? (Number(process.env.IMPORT_POLL_TIMEOUT_MS) || 120_000);

    const res = await request.post('connectivity/import/internet', {
        headers: { 'Content-Type': 'application/json' },
        data: {},
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const pull: InternetPullResult = {
        runId: Number(body.runId ?? 0),
        filesPulled: Number(body.filesPulled ?? 0),
        status: String(body.status ?? ''),
        message: String(body.message ?? ''),
    };

    if (!Number.isFinite(pull.runId) || pull.runId <= 0) return { pull };
    return { pull, run: await waitForImportRun(request, pull.runId, timeoutMs) };
}
