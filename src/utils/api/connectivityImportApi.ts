import { request as playwrightRequest, type APIRequestContext, type TestInfo } from '@playwright/test';
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

/**
 * The single reader of IMPORT_POLL_TIMEOUT_MS. The default matches what CI sets:
 * the observed worker claim latency is 3-7 minutes even at
 * serviceImportInterval=1 (see STUCK_AT_RECEIVED_REASON), so the old per-site
 * guesses (60_000/120_000) and even 180_000 lost to it — a local B4 run on
 * 2026-09-16 was still unclaimed at 5.5 minutes. The circuit breaker below is
 * what keeps a dead environment from spending this budget over and over.
 */
export function importPollTimeoutMs(): number {
    return Number(process.env.IMPORT_POLL_TIMEOUT_MS) || 420_000;
}

/** A shared time budget for one delivery's whole wait chain. */
export interface ImportDeadline {
    readonly at: number;
    readonly totalMs: number;
    remainingMs(): number;
}

/**
 * Consecutive per-worker deliveries whose deadline was exhausted, reset by any
 * success. Backs the circuit breaker in {@link newImportDeadline} — worker-local
 * because each Playwright worker is its own process.
 */
let consecutiveExhaustedDeliveries = 0;
const CIRCUIT_OPEN_AFTER = 2;
const CIRCUIT_CAPPED_MS = 60_000;

/** Recorded by the poll loops below on every delivery's outcome. */
export function noteDeliveryOutcome(exhausted: boolean): void {
    consecutiveExhaustedDeliveries = exhausted ? consecutiveExhaustedDeliveries + 1 : 0;
}

/** Whether this worker should shorten its next wait. */
export function importCircuitBreakerState(): { open: boolean; consecutiveExhausted: number } {
    return {
        open: consecutiveExhaustedDeliveries >= CIRCUIT_OPEN_AFTER,
        consecutiveExhausted: consecutiveExhaustedDeliveries,
    };
}

/** The one-line hook every delivery site uses to surface the breaker in the report. */
export function annotateIfImportCircuitOpen(testInfo: TestInfo): void {
    const state = importCircuitBreakerState();
    if (state.open) {
        testInfo.annotations.push({
            type: 'import-circuit-open',
            description:
                `${state.consecutiveExhausted} consecutive deliveries hit the import deadline in this ` +
                'worker — shortening the wait so the run still reports.',
        });
    }
}

/**
 * One budget for a whole delivery's wait chain (upload/pull -> terminal ->
 * office read), so chained polls share it instead of each consuming a full one.
 * From the third consecutive worker-local exhaustion onward it caps at 60s so a
 * dead environment still reports inside the run's time budget — the failure
 * reason and every assertion stay exactly as they are; only the wait shortens.
 */
export function newImportDeadline(totalMs = importPollTimeoutMs()): ImportDeadline {
    const cappedMs =
        consecutiveExhaustedDeliveries >= CIRCUIT_OPEN_AFTER ? Math.min(totalMs, CIRCUIT_CAPPED_MS) : totalMs;
    const at = Date.now() + cappedMs;
    return { at, totalMs: cappedMs, remainingMs: () => Math.max(0, at - Date.now()) };
}

/**
 * A Journey B spec's overall timeout: the project timeout plus two full import
 * deadlines, since a delivery can wait out an import-run terminal status AND a
 * separate office-read poll on the same budget-sized wait. Explicit in the spec
 * (`test.setTimeout(journeyBTestTimeoutMs(testInfo))`) rather than `test.slow()`'s
 * flat 3x multiplier, which under-covers a single 180-420s import deadline.
 */
export function journeyBTestTimeoutMs(testInfo: TestInfo): number {
    return testInfo.project.timeout + 2 * importPollTimeoutMs();
}

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
 * 2. The worker is on and dev's `serviceImportInterval` preference already reads
 *    1 minute — yet claims have still been observed 3-7 minutes after upload
 *    (2026-09-16 journey-B triage, runs 2037/2046/2053/2054/2057/2058/2067/2068).
 *    That gap is a dev scheduler defect, not a preference to raise; the poll
 *    timeout below is sized to ride it out, not to fix it.
 */
export const STUCK_AT_RECEIVED_REASON =
    'The file was stored successfully but has not been parsed — the run is still at "received". ' +
    'Two causes look identical here. (a) The import worker is off: check CloudWatch ' +
    '/ecs/pettiger/dev/tigerden for "import-worker: disabled via PT_IMPORT_WORKER_DISABLED=true" ' +
    'at container start (WEBPET-2137 / PET-12482 — fixed on dev 2026-08-14, so this should be ' +
    "absent). (b) More likely: dev's serviceImportInterval preference already reads 1 minute " +
    '(GET /api/preferences), yet the worker has been observed claiming a file 3-7 minutes after ' +
    'upload regardless — a dev scheduler defect, not a preference to raise (tracked once a WEBPET ' +
    'ticket exists; see the 2026-09-16 journey-B triage). IMPORT_POLL_TIMEOUT_MS is a per-delivery ' +
    'deadline sized to ride this out, not a fix for the underlying latency.';

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
    opts: { fileName?: string; timeoutMs?: number; deadline?: ImportDeadline; testInfo?: TestInfo } = {},
): Promise<ImportRunResult> {
    const fileName = opts.fileName ?? `FromDevice-${Date.now()}.xml`;
    // Share the caller's deadline when given (deliverAndVerifyCards, B5/B6's own
    // mint) instead of minting a fresh one — a shared budget must not be renewed
    // per call.
    const deadline = opts.deadline ?? newImportDeadline(opts.timeoutMs);

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
        noteDeliveryOutcome(false);
        return {
            runId,
            status: uploadFiles.every((f) => f.status === 'completed') ? 'completed' : 'failed',
            files: uploadFiles,
            raw: created,
        };
    }

    return waitForImportRun(upload, runId, deadline, created, opts.testInfo);
}

/** Poll one import run until it reaches a terminal status. */
export async function waitForImportRun(
    request: APIRequestContext,
    runId: number,
    deadline: ImportDeadline,
    seed: { status?: string; files?: ImportFileResult[] } = {},
    testInfo?: TestInfo,
): Promise<ImportRunResult> {
    const startedAt = Date.now();
    let last: { status?: string; files?: ImportFileResult[] } = seed;
    let claimed = String(seed.status ?? 'received') !== 'received';
    for (;;) {
        const poll = await request.get(`connectivity/import/runs/${runId}`);
        if (poll.ok()) {
            last = (await poll.json()) as { status?: string; files?: ImportFileResult[] };
            if (!claimed && String(last.status) !== 'received') {
                claimed = true;
                testInfo?.annotations.push({
                    type: 'import-claim-latency-ms',
                    description: String(Date.now() - startedAt),
                });
            }
            if (TERMINAL.includes(String(last.status))) break;
        }
        if (deadline.remainingMs() <= 0) {
            // 'received' specifically means stored-but-unclaimed, so name the cause
            // instead of reporting a bare timeout.
            const stuck = String(last.status) === 'received' ? ` ${STUCK_AT_RECEIVED_REASON}` : '';
            noteDeliveryOutcome(true);
            throw new Error(
                `Import run ${runId} did not reach a terminal status within ${deadline.totalMs}ms ` +
                    `(last: ${String(last.status)}).${stuck}`,
            );
        }
        await new Promise((r) => setTimeout(r, 1_000));
    }

    noteDeliveryOutcome(false);
    testInfo?.annotations.push({ type: 'import-terminal-ms', description: String(Date.now() - startedAt) });
    return {
        runId,
        status: String(last.status),
        files: last.files ?? [],
        raw: last,
    };
}

/**
 * Poll one import run until every file matching `wanted` is terminal, ignoring the
 * rest. A drain of the shared mailbox can carry other runs' envelopes (re-served
 * stale ones, a peer worker's), and their processing time says nothing about ours.
 * Resolves with the latest run snapshot; throws only when our files never settle.
 *
 * `oursPresent: false` — the run lists files and none is ours, for at least 10s
 * of polling — tells the caller this run was never going to carry our file (a
 * peer's trigger drained it), so it can re-trigger instead of waiting out the
 * whole deadline on a run that cannot resolve.
 */
export async function waitForImportFiles(
    request: APIRequestContext,
    runId: number,
    wanted: (file: ImportFileResult) => boolean,
    deadline: ImportDeadline,
    testInfo?: TestInfo,
): Promise<ImportRunResult & { oursPresent: boolean }> {
    const startedAt = Date.now();
    let last: { status?: string; files?: ImportFileResult[] } = {};
    let claimed = false;
    let emptySinceMs: number | null = null;
    for (;;) {
        const poll = await request.get(`connectivity/import/runs/${runId}`);
        if (poll.ok()) {
            last = (await poll.json()) as { status?: string; files?: ImportFileResult[] };
            if (!claimed && String(last.status) !== 'received') {
                claimed = true;
                testInfo?.annotations.push({
                    type: 'import-claim-latency-ms',
                    description: String(Date.now() - startedAt),
                });
            }
            const allFiles = last.files ?? [];
            const ours = allFiles.filter(wanted);
            if (ours.length && ours.every((f) => TERMINAL.includes(String(f.status)))) {
                noteDeliveryOutcome(false);
                testInfo?.annotations.push({ type: 'import-terminal-ms', description: String(Date.now() - startedAt) });
                return { runId, status: String(last.status), files: allFiles, raw: last, oursPresent: true };
            }
            // The relay pull lists files as they are stored, so one empty look is
            // normal — only two consecutive empty looks spanning >=10s means the
            // run was never going to carry our file.
            if (allFiles.length && ours.length === 0) {
                if (emptySinceMs === null) emptySinceMs = Date.now();
                else if (Date.now() - emptySinceMs >= 10_000) {
                    return { runId, status: String(last.status), files: allFiles, raw: last, oursPresent: false };
                }
            } else {
                emptySinceMs = null;
            }
            if (TERMINAL.includes(String(last.status))) break;
        }
        if (deadline.remainingMs() <= 0) {
            const ours = (last.files ?? []).filter(wanted).map((f) => ({
                file: f.fileName ?? (f as { filename?: string }).filename,
                status: f.status,
            }));
            const stuck = String(last.status) === 'received' ? ` ${STUCK_AT_RECEIVED_REASON}` : '';
            noteDeliveryOutcome(true);
            throw new Error(
                `Import run ${runId}: this run's file(s) did not reach a terminal status within ${deadline.totalMs}ms ` +
                    `(ours: ${JSON.stringify(ours)}, run: ${String(last.status)}).${stuck}`,
            );
        }
        await new Promise((r) => setTimeout(r, 1_000));
    }
    noteDeliveryOutcome(false);
    testInfo?.annotations.push({ type: 'import-terminal-ms', description: String(Date.now() - startedAt) });
    const finalFiles = last.files ?? [];
    return { runId, status: String(last.status), files: finalFiles, raw: last, oursPresent: finalFiles.some(wanted) };
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
    opts: { timeoutMs?: number; deadline?: ImportDeadline; testInfo?: TestInfo } = {},
): Promise<{ pull: InternetPullResult; run?: ImportRunResult }> {
    // Share the caller's deadline when given, exactly as importDeviceExport does.
    const deadline = opts.deadline ?? newImportDeadline(opts.timeoutMs);

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
    return { pull, run: await waitForImportRun(request, pull.runId, deadline, {}, opts.testInfo) };
}
