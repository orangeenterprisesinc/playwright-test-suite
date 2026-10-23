import type { APIRequestContext } from '@playwright/test';

export interface TransferScope {
    from: string;
    to: string;
    crewIds?: number[];
    jobIds?: number[];
    loadAll?: boolean;
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

/** One entry of `GET transfer-to-job-cards/runs` (the audit list, newest first). */
export interface TransferRunRecord {
    transferRunCounter: number;
    auditGroupId?: string;
    authorCounter: number;
    authorName?: string;
    runAtUtc: string;
    jobCardCount: number;
    timeCardCount: number;
    jobCardsModified: number;
    status: string;
}

/** Read-only: the transfer runs, body `{ runs }` (measured 2026-10-15). A reversed run stays listed, with a non-`active` status. */
export async function listTransferRuns(request: APIRequestContext): Promise<TransferRunRecord[]> {
    const res = await request.get('transfer-to-job-cards/runs');
    if (!res.ok()) {
        throw new Error(`GET transfer-to-job-cards/runs failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as { runs?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
    const runs = Array.isArray(body) ? body : (body.runs ?? []);
    return runs.map((r) => ({
        transferRunCounter: Number(r.transferRunCounter),
        auditGroupId: r.auditGroupId == null ? undefined : String(r.auditGroupId),
        authorCounter: Number(r.authorCounter),
        authorName: r.authorName == null ? undefined : String(r.authorName),
        runAtUtc: String(r.runAtUtc ?? ''),
        jobCardCount: Number(r.jobCardCount ?? 0),
        timeCardCount: Number(r.timeCardCount ?? 0),
        jobCardsModified: Number(r.jobCardsModified ?? 0),
        status: String(r.status ?? ''),
    }));
}
