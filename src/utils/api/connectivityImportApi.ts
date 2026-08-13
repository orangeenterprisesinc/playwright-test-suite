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
    'IaC-PetTiger-Web. The localhost stack boots MinIO and is unaffected.';

/**
 * Why a stored file never gets parsed: the import worker is switched off.
 *
 * `PT_IMPORT_WORKER_DISABLED=true` is set on the dev API task, so the upload is
 * stored and acknowledged (200, `received`, empty message) and then nothing ever
 * claims it. Indistinguishable from "queued" at the API, which is why this needs
 * spelling out rather than surfacing as a bare timeout.
 */
export const WORKER_DISABLED_REASON =
    'The file was stored successfully but never parsed — the run stayed at "received". On dev ' +
    'staging the connectivity import worker is disabled (PT_IMPORT_WORKER_DISABLED=true on the ' +
    'pettiger-dev-tigerden task; the API logs "import-worker: disabled ... pipeline will not run" ' +
    'at startup), so no uploaded file is ever processed. Tracked as WEBPET-2137 — the fix is one ' +
    'env var, no code change.';

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
    const timeoutMs = opts.timeoutMs ?? 60_000;

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

    const deadline = Date.now() + timeoutMs;
    let last: { status?: string; files?: ImportFileResult[] } = created;
    for (;;) {
        const poll = await upload.get(`connectivity/import/runs/${runId}`);
        if (poll.ok()) {
            last = (await poll.json()) as { status?: string; files?: ImportFileResult[] };
            if (TERMINAL.includes(String(last.status))) break;
        }
        if (Date.now() > deadline) {
            // 'received' specifically means stored-but-unclaimed, so name the cause
            // instead of reporting a bare timeout.
            const stuck = String(last.status) === 'received' ? ` ${WORKER_DISABLED_REASON}` : '';
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
