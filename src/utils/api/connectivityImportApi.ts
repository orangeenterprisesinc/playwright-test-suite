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
 * `storage.Put` before the worker parses them, so where `S3_ENDPOINT` is unset the
 * upload is recorded `failed` with this message and the run never leaves
 * `received`. Dev staging deliberately has no S3 (tests/webpet/README.md), while
 * the localhost stack boots MinIO.
 */
const NO_STORAGE_MESSAGE = 'could not store uploaded file';

export function isStorageUnavailable(run: ImportRunResult): boolean {
    return run.files.some((f) => String(f.message ?? '').includes(NO_STORAGE_MESSAGE));
}

/** Human-readable reason used when storage is missing (WEBPET-1830). */
export const NO_STORAGE_REASON =
    'Connectivity import needs object storage to persist the uploaded file, and this ' +
    'environment has none (S3_ENDPOINT is deliberately unset on dev staging — WEBPET-1830). ' +
    'Run against the localhost stack, which boots MinIO, or ask DevOps to configure S3 for ' +
    'the dev API.';

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
            throw new Error(
                `Import run ${runId} did not reach a terminal status within ${timeoutMs}ms ` +
                    `(last: ${String(last.status)})`,
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
