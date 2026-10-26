import type { APIRequestContext } from '@playwright/test';
import { allowApiWrites } from './writeGuard';
import { listJobCards } from './jobCardsApi';

/**
 * Export to Accounting runs — `GET …/reversible-runs`, `GET …/runs/{id}`, `POST …/runs/{id}/reverse?exportType=`,
 * `DELETE …/runs/{id}` (drafts). Reads are plumbing; the two writes are cleanup only and are called inside
 * `allowApiWrites('cleanup', …)` (cleanupExportRuns / healExportResidue declare it themselves). Response shapes
 * are unmeasured beyond the 2026-10-26 probe, so ids and statuses are read tolerantly.
 */
const BASE = 'job-cards/export-to-accounting';
type Json = Record<string, unknown>;

/** The run id out of a `POST …/runs` body or a reversible-runs row; throws listing the keys when none is present. */
export function runIdOf(body: unknown): number {
    const record = (body ?? {}) as Json;
    const nested = (record.run ?? record.exportRun ?? {}) as Json;
    for (const source of [record, nested]) {
        for (const key of ['exportRunCounter', 'runId', 'id', 'exportRunId']) {
            const value = Number(source[key]);
            if (Number.isFinite(value) && value > 0) return value;
        }
    }
    throw new Error(`No export run id in ${JSON.stringify(body).slice(0, 300)}; keys: ${Object.keys(record).join(', ')}`);
}

export function runStatusOf(body: Json | null): string {
    return String(body?.status ?? (body?.run as Json | undefined)?.status ?? '');
}

/** Every `jobCardCounter`/`jobCardId` number anywhere in a run body. */
export function jobCardIdsOf(body: unknown): number[] {
    const ids = new Set<number>();
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node && typeof node === 'object') {
            for (const [key, value] of Object.entries(node as Json)) {
                if ((key === 'jobCardCounter' || key === 'jobCardId') && Number.isFinite(Number(value))) ids.add(Number(value));
                else walk(value);
            }
        }
    };
    walk(body);
    return [...ids];
}

export async function listReversibleRuns(request: APIRequestContext): Promise<Json[]> {
    const res = await request.get(`${BASE}/reversible-runs`);
    if (!res.ok()) throw new Error(`GET ${BASE}/reversible-runs failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as Json[] | { items?: Json[]; runs?: Json[]; data?: Json[] };
    return Array.isArray(body) ? body : (body.items ?? body.runs ?? body.data ?? []);
}

/** Never throws on a non-2xx: a 404 means the run is already gone. */
export async function getExportRun(request: APIRequestContext, id: number): Promise<{ status: number; body: Json | null }> {
    const res = await request.get(`${BASE}/runs/${id}`);
    return { status: res.status(), body: res.ok() ? ((await res.json().catch(() => null)) as Json | null) : null };
}

/** Cleanup only. Never throws on a non-2xx. */
export async function reverseExportRun(request: APIRequestContext, id: number, exportType = 'payroll'): Promise<{ ok: boolean; status: number }> {
    const res = await request.post(`${BASE}/runs/${id}/reverse`, { params: { exportType }, data: {}, headers: { 'Content-Type': 'application/json' } });
    return { ok: res.ok(), status: res.status() };
}

/** Cleanup only. Never throws on a non-2xx. */
export async function deleteExportDraft(request: APIRequestContext, id: number): Promise<{ ok: boolean; status: number }> {
    const res = await request.delete(`${BASE}/runs/${id}`);
    return { ok: res.ok(), status: res.status() };
}

/** Teardown: newest first, finalized -> reverse, draft -> delete, already reversed or gone -> skip. Best effort; warns, never throws. */
export async function cleanupExportRuns(
    request: APIRequestContext,
    ids: readonly number[],
    warn: (name: string, error: unknown) => unknown,
): Promise<void> {
    await allowApiWrites('cleanup', 'E11 teardown: own export runs', async () => {
        for (const id of [...ids].reverse()) {
            try {
                const run = await getExportRun(request, id);
                if (run.status === 404) continue;
                const status = runStatusOf(run.body);
                if (/revers/i.test(status)) continue;
                if (/draft/i.test(status)) {
                    const dropped = await deleteExportDraft(request, id);
                    if (!dropped.ok) throw new Error(`DELETE run ${id} answered ${dropped.status}`);
                    continue;
                }
                const reversed = await reverseExportRun(request, id);
                if (reversed.ok) continue;
                const dropped = await deleteExportDraft(request, id);
                if (!dropped.ok) throw new Error(`run ${id} (status '${status}'): reverse answered ${reversed.status}, delete answered ${dropped.status}`);
            } catch (error) {
                await warn(`cleanup-warning-exportRun-${id}`, error);
            }
        }
    });
}

/**
 * Before-phase: a killed run can leave the crew's day exported, and the E2 sweeps cannot delete exported cards.
 * Reverses the reversible run that holds them, but only when it holds exclusively this crew's cards of the day;
 * anything else fails by name. Orphan drafts cannot be listed (no endpoint measured) and are not swept.
 */
export async function healExportResidue(request: APIRequestContext, opts: { crewId: number; day: string; label: string }): Promise<void> {
    const own = (await listJobCards(request, { from: opts.day, to: opts.day, includeExported: true })).filter((c) => Number(c.crewCounter) === opts.crewId);
    const ownIds = new Set(own.map((c) => c.jobCardCounter));
    const exported = new Set(own.filter((c) => c.exported === true).map((c) => c.jobCardCounter));
    if (!exported.size) return;

    await allowApiWrites('cleanup', `${opts.label} before-phase: reverse the crew's exported residue`, async () => {
        for (const run of await listReversibleRuns(request)) {
            if (!exported.size) break;
            const id = runIdOf(run);
            const cards = jobCardIdsOf((await getExportRun(request, id)).body);
            if (!cards.some((c) => exported.has(c))) continue;
            const foreign = cards.filter((c) => !ownIds.has(c));
            if (foreign.length) {
                throw new Error(
                    `${opts.label}: export residue — run ${id} holds ${foreign.length} job card(s) that are not E2 CREW's on ${opts.day} ` +
                        `(${JSON.stringify(foreign.slice(0, 5))}); refusing to reverse it.`,
                );
            }
            const reversed = await reverseExportRun(request, id);
            if (!reversed.ok) throw new Error(`${opts.label}: reversing residue run ${id} answered ${reversed.status}`);
            for (const c of cards) exported.delete(c);
        }
    });
    if (exported.size) {
        throw new Error(
            `${opts.label}: ${exported.size} exported job card(s) of the crew on ${opts.day} belong to no reversible run this API can show ` +
                `(${JSON.stringify([...exported])}); reverse them on screen before running E11.`,
        );
    }
}
