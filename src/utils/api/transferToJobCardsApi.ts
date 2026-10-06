import type { APIRequestContext } from '@playwright/test';

/**
 * `POST transfer-to-job-cards/analyze` — the endpoint that feeds both the Transfer screen and the
 * Time Cards Exceptions panel. Never throws on a non-2xx: B5 asserts the status itself, with the
 * body in the message. Exceptions are reported in a top-level `exceptions[]`, each with a `code`,
 * a legacy-parity `message` and the `sourceTimeCardCounter` it flags (WEBPET-2657 retired the
 * interim "JobCounter is required…" text).
 *
 * **`loadAll: true` makes this endpoint asynchronous** (measured 2026-09-29): without it the POST
 * answers `200` with the whole body, with it `202 {jobId}` that must be polled at
 * `GET transfer-to-job-cards/analyze/{jobId}`. Reading the 202 body directly yields a payload with
 * no `candidates` and no `exceptions`, which silently looks like "nothing to transfer" — so both
 * shapes are handled here. `crewIds`/`jobIds` narrow the scope; `recordIds` is ignored by the filter.
 */
export interface AnalyzeException {
    code?: string;
    severity?: string;
    message?: string;
    sourceTimeCardCounter?: number;
}

export interface TransferScope {
    from: string;
    to: string;
    crewIds?: number[];
    jobIds?: number[];
    loadAll?: boolean;
}

export interface AnalyzeResult {
    ok: boolean;
    status: number;
    exceptions: AnalyzeException[];
    /** Time-card ids analyze considers in scope. Present on the settled body, not on the 202. */
    candidates: unknown[];
    plannableTotal?: number;
    eligibleTotal?: number;
    totalPieces?: number;
    /** The whole body, for the caller's failure message. */
    raw: unknown;
}

/**
 * Settles a `202 {jobId}` by polling `<base>/{jobId}` until the body stops reporting an in-flight
 * status. A `200` is already settled and is returned as-is. Never throws: callers assert on the
 * body they get back.
 */
async function settle(
    request: APIRequestContext,
    base: string,
    status: number,
    body: unknown,
    timeoutMs = 60_000,
): Promise<unknown> {
    const jobId = (body as { jobId?: string } | null)?.jobId;
    if (status !== 202 || !jobId) return body;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const poll = await request.get(`${base}/${jobId}`);
        const polled = await poll.json().catch(() => ({}));
        const state = String((polled as { status?: string }).status ?? '');
        if (poll.ok() && !['pending', 'running', 'queued'].includes(state)) return polled;
        if (Date.now() > deadline) return polled;
        await new Promise((r) => setTimeout(r, 1_500));
    }
}

export async function analyzeTransfer(request: APIRequestContext, opts: TransferScope): Promise<AnalyzeResult> {
    const res = await request.post('transfer-to-job-cards/analyze', { data: opts });
    const posted = await res.json().catch(() => ({}));
    const raw = (await settle(request, 'transfer-to-job-cards/analyze', res.status(), posted)) as {
        exceptions?: AnalyzeException[];
        candidates?: unknown[];
        plannableTotal?: number;
        eligibleTotal?: number;
        totalPieces?: number;
    };
    return {
        ok: res.ok(),
        status: res.status(),
        exceptions: raw.exceptions ?? [],
        candidates: raw.candidates ?? [],
        plannableTotal: raw.plannableTotal,
        eligibleTotal: raw.eligibleTotal,
        totalPieces: raw.totalPieces,
        raw,
    };
}

/** One preview row per job card the transfer would write — `POST transfer-to-job-cards/job-cards-preview`. */
export interface JobCardPreviewRow {
    sourceRecordIds: number[];
    pieces: number;
    amount: number;
    grossMinutes: number;
    netMinutes: number;
    jobPaymentType: number;
    [key: string]: unknown;
}

export interface JobCardPreview {
    rows: JobCardPreviewRow[];
    totals: { jobCardCount?: number; pieces?: number; amount?: number; employeeCount?: number; [key: string]: unknown };
    raw: unknown;
}

/**
 * The roster of job cards a transfer would write, without writing any — each row names the source
 * time cards it would consume in `sourceRecordIds`. Like analyze, `loadAll: true` returns
 * `202 {jobId}` and is settled here; the settled body is `{rows, totals, …}` (the key is `rows`,
 * not `items` — reading the wrong key looks exactly like "nothing to transfer").
 */
export async function previewJobCards(request: APIRequestContext, opts: TransferScope): Promise<JobCardPreview> {
    const res = await request.post('transfer-to-job-cards/job-cards-preview', {
        data: opts,
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok() && res.status() !== 202) {
        throw new Error(`POST transfer-to-job-cards/job-cards-preview failed with ${res.status()}: ${(await res.text()).slice(0, 400)}`);
    }
    const posted = await res.json().catch(() => ({}));
    const body = (await settle(request, 'transfer-to-job-cards/job-cards-preview', res.status(), posted)) as {
        rows?: JobCardPreviewRow[];
        totals?: JobCardPreview['totals'];
    };
    return { rows: body.rows ?? [], totals: body.totals ?? {}, raw: body };
}

export interface ExecuteResult {
    status: string;
    jobCardsWritten: number;
    timeCardsTransferred: number;
    transferRunCounter: number;
    jobCardCounters: number[];
    /** Failure text of a non-complete job; the field name is unverified, so several are tried. */
    error?: string;
    raw: unknown;
}

/** The current body of `GET transfer-to-job-cards/execute/{jobId}`, without waiting for it to settle. */
export async function readExecuteJob(request: APIRequestContext, jobId: string): Promise<ExecuteResult> {
    const poll = await request.get(`transfer-to-job-cards/execute/${jobId}`);
    if (!poll.ok()) {
        throw new Error(`GET transfer-to-job-cards/execute/${jobId} failed with ${poll.status()}: ${(await poll.text()).slice(0, 300)}`);
    }
    const body = (await poll.json()) as {
        status?: string;
        jobCardsWritten?: number;
        timeCardsTransferred?: number;
        transferRunCounter?: number;
        days?: Array<{ jobCardCounters?: number[] }>;
        error?: unknown;
        errorMessage?: unknown;
        message?: unknown;
    };
    const error = body.error ?? body.errorMessage ?? body.message;
    return {
        status: String(body.status ?? ''),
        jobCardsWritten: Number(body.jobCardsWritten ?? 0),
        timeCardsTransferred: Number(body.timeCardsTransferred ?? 0),
        transferRunCounter: Number(body.transferRunCounter ?? 0),
        jobCardCounters: (body.days ?? []).flatMap((d) => d.jobCardCounters ?? []),
        error: error == null ? undefined : typeof error === 'string' ? error : JSON.stringify(error),
        raw: body,
    };
}

/**
 * `POST transfer-to-job-cards/execute` -> 202 `{jobId}`, then poll `GET
 * transfer-to-job-cards/execute/{jobId}` to `status: 'complete'`. Verified live 2026-09-29:
 * `{status:'complete', jobCardsWritten, timeCardsTransferred, transferRunCounter,
 * days:[{jobCardCounters, sourceTimeCards, ...}]}` — `jobCardCounters` is flattened across days.
 *
 * This commits real job cards and locks its source time cards against deletion, so callers scope it
 * to their own crew and job and verify the candidate set first — see `journeyDFlow.guardedTransfer`.
 */
export async function executeTransfer(
    request: APIRequestContext,
    opts: TransferScope,
    pollOpts: { timeoutMs?: number } = {},
): Promise<ExecuteResult> {
    const res = await request.post('transfer-to-job-cards/execute', {
        data: opts,
        headers: { 'Content-Type': 'application/json' },
    });
    if (res.status() !== 202) {
        throw new Error(`POST transfer-to-job-cards/execute failed with ${res.status()}: ${(await res.text()).slice(0, 400)}`);
    }
    const { jobId } = (await res.json()) as { jobId: string };
    const deadline = Date.now() + (pollOpts.timeoutMs ?? 60_000);
    for (;;) {
        const body = await readExecuteJob(request, jobId);
        if (body.status === 'complete') return body;
        if (Date.now() > deadline) {
            throw new Error(`transfer-to-job-cards/execute/${jobId} did not complete within ${pollOpts.timeoutMs ?? 60_000}ms (last status: ${String(body.status)})`);
        }
        await new Promise((r) => setTimeout(r, 1_500));
    }
}
