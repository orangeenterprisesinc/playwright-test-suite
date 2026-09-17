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

/** Hard ceiling per delivery; default matches CI. The stall check below usually ends the wait first — the 3-7 min claim latency fits inside it, a 40-min outlier does not. */
export function importPollTimeoutMs(): number {
    return Number(process.env.IMPORT_POLL_TIMEOUT_MS) || 1_200_000;
}

/** Give up after this long with no observed change, well inside the ceiling. */
export function importStallMs(): number {
    return Number(process.env.IMPORT_STALL_MS) || 480_000;
}

export type ImportWaitVerdict = 'stalled' | 'ceiling';

/** A shared, progress-aware time budget for one delivery's whole wait chain. */
export interface ImportDeadline {
    readonly startedAt: number;
    readonly ceilingAt: number;
    readonly ceilingMs: number;
    readonly totalMs: number; // == ceilingMs, kept for existing readers
    readonly stallMs: number;
    lastProgressAt: number;
    touch(): void;
    remainingMs(): number;
    verdict(): ImportWaitVerdict | null;
    pollDelayMs(): number;
}

/** Consecutive per-worker stalls, reset by any success; worker-local (own process). */
let consecutiveStalls = 0;
const CIRCUIT_OPEN_AFTER = 2;
const CIRCUIT_CAPPED_MS = 60_000;

/** Recorded by the poll loops below on every delivery's outcome. */
export function noteDeliveryOutcome(verdict: ImportWaitVerdict | null): void {
    consecutiveStalls = verdict === 'stalled' ? consecutiveStalls + 1 : verdict === null ? 0 : consecutiveStalls;
}

/** Whether this worker should cap its next deadline. */
export function importCircuitBreakerState(): { open: boolean; consecutiveStalls: number } {
    return { open: consecutiveStalls >= CIRCUIT_OPEN_AFTER, consecutiveStalls };
}

/** The one-line hook every delivery site uses to surface the breaker in the report. */
export function annotateIfImportCircuitOpen(testInfo: TestInfo): void {
    const state = importCircuitBreakerState();
    if (state.open) {
        testInfo.annotations.push({
            type: 'import-circuit-open',
            description:
                `${state.consecutiveStalls} consecutive deliveries stalled in this worker — capping the ` +
                'wait ceiling at 60s so the run still reports.',
        });
    }
}

export interface ImportDeadlineOptions {
    ceilingMs?: number;
    stallMs?: number;
}

/**
 * One progress-aware budget for a whole delivery's wait chain. After two
 * consecutive worker-local stalls it caps the ceiling (and stall, if larger)
 * at 60s so a dead environment still reports inside the run's time budget.
 */
export function newImportDeadline(opts: number | ImportDeadlineOptions = {}): ImportDeadline {
    const given = typeof opts === 'number' ? { ceilingMs: opts } : opts;
    let ceilingMs = given.ceilingMs ?? importPollTimeoutMs();
    let stallMs = given.stallMs ?? importStallMs();
    if (importCircuitBreakerState().open) {
        ceilingMs = Math.min(ceilingMs, CIRCUIT_CAPPED_MS);
        stallMs = Math.min(stallMs, ceilingMs);
    }
    const startedAt = Date.now();
    const ceilingAt = startedAt + ceilingMs;
    const deadline: ImportDeadline = {
        startedAt,
        ceilingAt,
        ceilingMs,
        totalMs: ceilingMs,
        stallMs,
        lastProgressAt: startedAt,
        touch() {
            deadline.lastProgressAt = Date.now();
        },
        remainingMs() {
            return Math.max(0, Math.min(ceilingAt, deadline.lastProgressAt + stallMs) - Date.now());
        },
        verdict() {
            if (deadline.remainingMs() > 0) return null;
            return Date.now() - deadline.lastProgressAt >= stallMs ? 'stalled' : 'ceiling';
        },
        pollDelayMs() {
            const elapsed = Date.now() - startedAt;
            return elapsed < 60_000 ? 1_000 : elapsed < 180_000 ? 2_000 : 5_000;
        },
    };
    return deadline;
}

/**
 * A Journey B spec's overall timeout: project timeout plus one ceiling plus a
 * 2-minute margin. Explicit (`test.setTimeout(journeyBTestTimeoutMs(testInfo))`)
 * rather than `test.slow()`'s flat 3x multiplier, which under-covers the ceiling.
 */
export function journeyBTestTimeoutMs(testInfo: TestInfo): number {
    return testInfo.project.timeout + importPollTimeoutMs() + 120_000;
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
 * Why a stored file can sit at `received` — indistinguishable at the API from "queued".
 *
 * 1. The worker is off (`PT_IMPORT_WORKER_DISABLED=true`) — nothing ever claims
 *    the file. WEBPET-2137 / PET-12482; fixed on dev 2026-08-14.
 * 2. The worker is on and dev's `serviceImportInterval` preference already reads
 *    1 minute — yet claims have still been observed 3-7 minutes after upload
 *    (2026-09-16 journey-B triage, runs 2037/2046/2053/2054/2057/2058/2067/2068).
 *    That gap is a dev scheduler defect, not a preference to raise.
 */
export const STUCK_AT_RECEIVED_REASON =
    'The file was stored successfully but has not been parsed — the run is still at "received". ' +
    'Two causes look identical here. (a) The import worker is off: check CloudWatch ' +
    '/ecs/pettiger/dev/tigerden for "import-worker: disabled via PT_IMPORT_WORKER_DISABLED=true" ' +
    'at container start (WEBPET-2137 / PET-12482 — fixed on dev 2026-08-14, so this should be ' +
    "absent). (b) More likely: dev's serviceImportInterval preference already reads 1 minute " +
    '(GET /api/preferences), yet the worker has been observed claiming a file 3-7 minutes after ' +
    'upload regardless — a dev scheduler defect, not a preference to raise (tracked once a WEBPET ' +
    'ticket exists; see the 2026-09-16 journey-B triage). IMPORT_STALL_MS is how long the suite ' +
    'tolerates no change on an unclaimed file; IMPORT_POLL_TIMEOUT_MS is the hard ceiling.';

/** Memoized per worker process — one GET, every later caller awaits the same promise. */
let importIntervalNote: Promise<string> | undefined;

export function importIntervalPreferenceNote(request: APIRequestContext): Promise<string> {
    if (!importIntervalNote) {
        importIntervalNote = request
            .get('preferences')
            .then(async (res) => {
                if (!res.ok()) return `serviceImportInterval unreadable (GET preferences → ${res.status()})`;
                const body = (await res.json()) as { serviceImportInterval?: unknown };
                return `serviceImportInterval preference reads ${String(body.serviceImportInterval)} min`;
            })
            .catch((err: unknown) => `serviceImportInterval unreadable (GET preferences → ${String(err)})`);
    }
    return importIntervalNote;
}

/** Names which limit ended the wait, for the caller's failure message. */
export async function describeImportWait(
    request: APIRequestContext,
    deadline: ImportDeadline,
    verdict: ImportWaitVerdict,
    lastStatus: string,
): Promise<string> {
    const pref = await importIntervalPreferenceNote(request);
    const elapsed = Date.now() - deadline.startedAt;
    if (verdict === 'stalled' && lastStatus === 'received') {
        const m = Math.round(deadline.stallMs / 60_000);
        return (
            `stalled at "received" for ${m} min — stored but never claimed (worker latency). ` +
            `${pref}; waited ${elapsed} ms in total. ${STUCK_AT_RECEIVED_REASON}`
        );
    }
    if (verdict === 'stalled') {
        const m = Math.round(deadline.stallMs / 60_000);
        return (
            `stalled at "${lastStatus}" for ${m} min — claimed, but no file/status change since ` +
            `(parser hung). ${pref}; waited ${elapsed} ms.`
        );
    }
    const s = Math.round((Date.now() - deadline.lastProgressAt) / 1_000);
    return (
        `ceiling of ${deadline.ceilingMs} ms reached while the run was still progressing ` +
        `(last change ${s}s ago, status "${lastStatus}"). ${pref}.`
    );
}

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
        noteDeliveryOutcome(null);
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
    deadline.touch();
    let fp = runFingerprint(seed);
    for (;;) {
        const poll = await request.get(`connectivity/import/runs/${runId}`);
        if (poll.ok()) {
            last = (await poll.json()) as { status?: string; files?: ImportFileResult[] };
            const next = runFingerprint(last);
            if (next !== fp) {
                fp = next;
                deadline.touch();
            }
            if (!claimed && String(last.status) !== 'received') {
                claimed = true;
                testInfo?.annotations.push({
                    type: 'import-claim-latency-ms',
                    description: String(Date.now() - startedAt),
                });
            }
            if (TERMINAL.includes(String(last.status))) break;
        }
        const verdict = deadline.verdict();
        if (verdict) {
            noteDeliveryOutcome(verdict);
            const why = await describeImportWait(request, deadline, verdict, String(last.status));
            testInfo?.annotations.push({
                type: 'import-wait-verdict',
                description: `${verdict} — run ${runId} at "${String(last.status)}" after ${Date.now() - startedAt}ms`,
            });
            throw new Error(`Import run ${runId} did not reach a terminal status — ${why}`);
        }
        await new Promise((r) => setTimeout(r, deadline.pollDelayMs()));
    }

    noteDeliveryOutcome(null);
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
function runFingerprint(run: { status?: string; files?: ImportFileResult[] }): string {
    return JSON.stringify({
        s: run.status,
        f: (run.files ?? []).map((f) => [f.fileName ?? (f as { filename?: string }).filename, f.status, f.message]),
    });
}

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
    deadline.touch();
    let fp = '';
    for (;;) {
        const poll = await request.get(`connectivity/import/runs/${runId}`);
        if (poll.ok()) {
            last = (await poll.json()) as { status?: string; files?: ImportFileResult[] };
            const next = runFingerprint(last);
            if (next !== fp) {
                fp = next;
                deadline.touch();
            }
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
                noteDeliveryOutcome(null);
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
        const verdict = deadline.verdict();
        if (verdict) {
            const ours = (last.files ?? []).filter(wanted).map((f) => ({
                file: f.fileName ?? (f as { filename?: string }).filename,
                status: f.status,
            }));
            noteDeliveryOutcome(verdict);
            const why = await describeImportWait(request, deadline, verdict, String(last.status));
            testInfo?.annotations.push({
                type: 'import-wait-verdict',
                description: `${verdict} — run ${runId} at "${String(last.status)}" after ${Date.now() - startedAt}ms`,
            });
            throw new Error(
                `Import run ${runId}: this run's file(s) did not reach a terminal status — ${why} ` +
                    `(ours: ${JSON.stringify(ours)})`,
            );
        }
        await new Promise((r) => setTimeout(r, deadline.pollDelayMs()));
    }
    noteDeliveryOutcome(null);
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
