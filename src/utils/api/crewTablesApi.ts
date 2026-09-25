import type { APIRequestContext } from '@playwright/test';

/**
 * Crew tables — the pack-house sub-crew grouping (catalog C6). A table belongs to
 * one crew, optionally names a supervisor, and is a reporting grouping only: time
 * cards carry its `crewTableCounter`, nothing else hangs off it.
 *
 * Verified against the deployed dev bundle 2026-09-25: `GET/POST /crew-tables`,
 * `GET/PUT/DELETE /crew-tables/{id}` (delete is rowversion-guarded like every setup
 * entity), `GET /crew-tables/deleted` + restore.
 *
 * Dev defect (2026-09-25): `GET /crew-tables/{id}` and `GET /crew-tables/deleted` answer
 * 500 for every id (API log: mssql "Invalid object name 'ct.TimeStamp'"), the create
 * response carries only the id, and list rows carry no `version` - so no table can
 * currently be deleted (DELETE answers 400 invalid_version). Journey C therefore
 * captures against a fixed fixture table (`ensureCrewTable`) and declares the one table
 * it creates on screen as unremovable until the API is fixed.
 */

export interface CrewTableRecord {
    crewTableCounter: number;
    name: string;
    crewCounter: number;
    supervisorCounter?: number | null;
    active?: boolean;
    version?: string;
    [key: string]: unknown;
}

function asArray(body: unknown): CrewTableRecord[] {
    if (Array.isArray(body)) return body as CrewTableRecord[];
    const wrapped = body as { items?: CrewTableRecord[]; data?: CrewTableRecord[] } | null;
    return wrapped?.items ?? wrapped?.data ?? [];
}

export async function listCrewTables(request: APIRequestContext): Promise<CrewTableRecord[]> {
    const res = await request.get('crew-tables');
    if (!res.ok()) throw new Error(`GET crew-tables failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    return asArray(await res.json());
}

export async function getCrewTable(request: APIRequestContext, id: number): Promise<CrewTableRecord> {
    const res = await request.get(`crew-tables/${id}`);
    if (!res.ok()) throw new Error(`GET crew-tables/${id} failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as CrewTableRecord;
}

/** The live table with exactly this name (trimmed), or null. */
export async function findCrewTableByName(request: APIRequestContext, name: string): Promise<CrewTableRecord | null> {
    const wanted = name.trim();
    return (await listCrewTables(request)).find((t) => String(t.name ?? '').trim() === wanted) ?? null;
}

export async function createCrewTable(
    request: APIRequestContext,
    body: { name: string; crewCounter: number; supervisorCounter?: number | null; active?: boolean },
): Promise<CrewTableRecord> {
    const res = await request.post('crew-tables', {
        data: { active: true, supervisorCounter: null, ...body },
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok()) throw new Error(`POST crew-tables failed with ${res.status()}: ${(await res.text()).slice(0, 400)}`);
    const created = (await res.json()) as Partial<CrewTableRecord>;
    // Some create responses carry only the id; the list is the source of truth for the rest.
    if (created.crewTableCounter && created.version) return created as CrewTableRecord;
    const found = await findCrewTableByName(request, body.name);
    if (!found) throw new Error(`POST crew-tables answered ${res.status()} but '${body.name}' is not listed afterwards`);
    return found;
}

/**
 * Find-or-create a table by name under a crew (uniqueness is per crew: a duplicate
 * answers 409 "A table with this name already exists for this crew."). Never deletes.
 */
export async function ensureCrewTable(
    request: APIRequestContext,
    record: { name: string; crewCounter: number; supervisorCounter?: number | null },
): Promise<CrewTableRecord> {
    const existing = (await listCrewTables(request)).find(
        (t) => String(t.name ?? '').trim() === record.name.trim() && Number(t.crewCounter) === record.crewCounter,
    );
    if (existing) return existing;
    return createCrewTable(request, record);
}

/** Rowversion-guarded delete; re-reads the record so the version is current. */
export async function deleteCrewTable(request: APIRequestContext, id: number): Promise<{ deleted: boolean; status: number }> {
    const detail = await request.get(`crew-tables/${id}`);
    if (detail.status() === 404) return { deleted: true, status: 404 };
    if (!detail.ok()) return { deleted: false, status: detail.status() };
    const { version } = (await detail.json()) as { version?: string };
    const res = await request.delete(`crew-tables/${id}`, { data: { rowversion: version } });
    return { deleted: res.ok() || res.status() === 404, status: res.status() };
}
