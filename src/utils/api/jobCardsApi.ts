import type { APIRequestContext } from '@playwright/test';

/**
 * Job Cards — `GET/POST job-cards`, `GET/DELETE job-cards/{id}`, the bulk
 * `POST job-cards/recalculate` (202 + poll) and its audit trail
 * `GET job-cards/recalc-runs`.
 *
 * Verified live 2026-09-29 (see test-plans/journey-d/d06-recalculate-after-setup-change.md,
 * §Resolution): `from`/`to` are inclusive `YYYY-MM-DD`; the id key is `jobCardCounter`, the
 * concurrency token `version`. `DELETE` answers `200 {sourcesReset, linkageMissing}` and flips
 * every source time card back to `transferred: false`.
 *
 * `deleteJobCard` is the D6 unwind's only safe primitive: by explicit id, one at a time — never a
 * bulk or "select all" route. A "delete all loaded" wiped ~9.5k dev job cards in Sept 2026 and
 * there is no restore route (see cleanupTargets.ts and journeyDFlow.ts).
 */

export interface JobCardRecord {
    jobCardCounter: number;
    reference?: string;
    version?: string;
    pieces?: number;
    pieceRate?: number;
    pieceAmount?: number;
    amount?: number;
    timeAmount?: number;
    netTime?: number;
    grossTime?: number;
    exported?: boolean;
    locked?: boolean;
    modifiedAfterExport?: boolean;
    programCreated?: boolean;
    jobPaymentType?: number;
    crewCounter?: number;
    jobCounter?: number;
    timeCardInCounter?: number;
    timeCardOutCounter?: number;
    [key: string]: unknown;
}

function asArray(body: unknown): JobCardRecord[] {
    if (Array.isArray(body)) return body as JobCardRecord[];
    const wrapped = body as { items?: JobCardRecord[]; data?: JobCardRecord[] } | null;
    return wrapped?.items ?? wrapped?.data ?? [];
}

export async function listJobCards(request: APIRequestContext, opts: { from: string; to: string }): Promise<JobCardRecord[]> {
    const res = await request.get('job-cards', { params: { from: opts.from, to: opts.to } });
    if (!res.ok()) {
        throw new Error(`GET job-cards failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    return asArray(await res.json());
}

export async function getJobCard(request: APIRequestContext, id: number): Promise<JobCardRecord> {
    const res = await request.get(`job-cards/${id}`);
    if (!res.ok()) {
        throw new Error(`GET job-cards/${id} failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as JobCardRecord;
}

/**
 * Delete one job card, by explicit id. `rowversion`, when omitted, is read fresh first — a caller
 * that already holds the current version (e.g. right after reading the card) can skip that round trip.
 * Never throws on a non-2xx: cleanup must be best-effort and never turn a green assertion red.
 */
export async function deleteJobCard(
    request: APIRequestContext,
    id: number,
    rowversion?: string,
): Promise<{ deleted: boolean; status: number; sourcesReset?: number }> {
    const version = rowversion ?? (await getJobCard(request, id)).version;
    const res = await request.delete(`job-cards/${id}`, {
        data: { rowversion: version },
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok()) return { deleted: false, status: res.status() };
    const body = (await res.json().catch(() => ({}))) as { sourcesReset?: number };
    return { deleted: true, status: res.status(), sourcesReset: body.sourcesReset };
}

export interface RecalculateSummary {
    matchedCount: number;
    updatedCount: number;
    modifiedAfterExportCount: number;
    failedCount: number;
    warningCount: number;
}

export interface RecalculateResult {
    status: string;
    summary: RecalculateSummary;
    failures: unknown[];
    warnings: unknown[];
    truncated: boolean;
    raw: unknown;
}

/**
 * `POST job-cards/recalculate {recordIds}` -> 202 `{jobId}`, then poll `GET
 * job-cards/recalculate/{jobId}` to a terminal `status: 'complete'`. This is the bulk variant the
 * Job Cards screen's Recalculate button drives (see JobCardsPage); D6 exercises it through the
 * screen, not this call directly, but the primitive is reused wherever a later Journey D spec needs
 * to recalculate over the API.
 */
export async function recalculateJobCards(
    request: APIRequestContext,
    recordIds: number[],
    opts: { timeoutMs?: number } = {},
): Promise<RecalculateResult> {
    const res = await request.post('job-cards/recalculate', {
        data: { recordIds },
        headers: { 'Content-Type': 'application/json' },
    });
    if (res.status() !== 202) {
        throw new Error(`POST job-cards/recalculate failed with ${res.status()}: ${(await res.text()).slice(0, 400)}`);
    }
    const { jobId } = (await res.json()) as { jobId: string };
    const deadline = Date.now() + (opts.timeoutMs ?? 60_000);
    for (;;) {
        const poll = await request.get(`job-cards/recalculate/${jobId}`);
        if (!poll.ok()) {
            throw new Error(`GET job-cards/recalculate/${jobId} failed with ${poll.status()}: ${(await poll.text()).slice(0, 300)}`);
        }
        const body = (await poll.json()) as {
            status?: string;
            result?: { summary?: RecalculateSummary; failures?: unknown[]; warnings?: unknown[]; truncated?: boolean };
        };
        if (body.status === 'complete') {
            const result = body.result ?? {};
            return {
                status: body.status,
                summary: result.summary ?? { matchedCount: 0, updatedCount: 0, modifiedAfterExportCount: 0, failedCount: 0, warningCount: 0 },
                failures: result.failures ?? [],
                warnings: result.warnings ?? [],
                truncated: Boolean(result.truncated),
                raw: body,
            };
        }
        if (Date.now() > deadline) {
            throw new Error(`job-cards/recalculate/${jobId} did not complete within ${opts.timeoutMs ?? 60_000}ms (last status: ${String(body.status)})`);
        }
        await new Promise((r) => setTimeout(r, 1_500));
    }
}

export interface RecalcRun {
    recalcRunCounter: number;
    authorCounter?: number;
    authorName?: string;
    runAtUtc?: string;
    jobCardCount: number;
    status: string;
}

export async function listRecalcRuns(request: APIRequestContext): Promise<RecalcRun[]> {
    const res = await request.get('job-cards/recalc-runs');
    if (!res.ok()) {
        throw new Error(`GET job-cards/recalc-runs failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as { runs?: RecalcRun[] } | RecalcRun[];
    return Array.isArray(body) ? body : (body.runs ?? []);
}
