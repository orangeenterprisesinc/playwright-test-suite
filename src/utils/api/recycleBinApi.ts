import type { APIRequestContext } from '@playwright/test';

// Read-only helpers for the recycle bin: a record's live/gone status, the bin's contents and the
// bulk-update history. GETs only; the screen performs every delete, restore and undo.

export interface BulkHistoryRow {
    id: number;
    tableName: string;
    recordCount: number;
    authorName: string;
    /** Naive local timestamp as the server stores it, e.g. `2026-10-14T19:01:01.550`. */
    createdOn: string;
    undoneOn: string | null;
    undoable: boolean;
}

type Row = Record<string, unknown>;

/** The list endpoints return a bare array; tolerate a wrapped shape too. */
function asArray(body: unknown): Row[] {
    if (Array.isArray(body)) return body as Row[];
    const wrapped = body as { items?: Row[]; data?: Row[] } | null;
    return wrapped?.items ?? wrapped?.data ?? [];
}

/** HTTP status of `GET <listPath>/<id>`: 200 while live, 404 once soft-deleted. */
export async function getRecordStatus(request: APIRequestContext, listPath: string, id: number): Promise<number> {
    const res = await request.get(`${listPath}/${String(id)}`);
    return res.status();
}

/** The recycle bin for one entity: `GET <listPath>/deleted`. */
export async function listDeleted(request: APIRequestContext, listPath: string): Promise<Row[]> {
    const res = await request.get(`${listPath}/deleted`);
    if (!res.ok()) throw new Error(`GET ${listPath}/deleted failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    return asArray(await res.json());
}

/** Every bulk-delete history row, newest and oldest alike. */
export async function listBulkDeleteHistory(request: APIRequestContext): Promise<BulkHistoryRow[]> {
    const res = await request.get('bulk-update-history', { params: { status: 'all', type: 'delete' } });
    if (!res.ok()) throw new Error(`GET bulk-update-history failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    return asArray(await res.json()).map((r) => ({
        id: Number(r.id ?? r.bulkUpdateHistoryCounter),
        tableName: String(r.tableName ?? ''),
        recordCount: Number(r.recordCount),
        authorName: String(r.authorName ?? ''),
        createdOn: String(r.createdOn ?? ''),
        undoneOn: r.undoneOn == null ? null : String(r.undoneOn),
        undoable: r.undoable === true,
    }));
}
