import type { APIRequestContext } from '@playwright/test';

/**
 * Discover-or-create for the setup records a device import has to link against.
 *
 * The device exports its punches **by code** (its envelope declares
 * `LookupContents="Field:Code|Crew:Code|Employee:Code|…"`), and the importer's
 * TimeCard foreign keys are nullable — so a code that matches nothing on the
 * office side imports "successfully" with NULL counters. These helpers make the
 * office side carry the same codes the device fixture uses, so the import links.
 *
 * Verified against dev staging (2026-08-10): ranches, fields, crews, employees
 * and jobs all honour a `code` supplied at create time.
 *
 * Records are looked up by code and created only when missing — never deleted.
 * Reruns are therefore idempotent and leave a stable QA fixture set, which is
 * why there is no delete helper here: deleting them would break the next run and
 * anything else pointing at them.
 */

export interface EnsuredRecord {
    /** The record's counter (primary key) on the office side. */
    id: number;
    code: string;
    name: string;
    /** True when this call created the record rather than finding it. */
    created: boolean;
}

interface EnsureSpec {
    /** Collection path, relative to the API base (which already ends in /api). */
    path: string;
    /** Key carrying the new id in the create response, e.g. `ranchCounter`. */
    idKey: string;
    code: string;
    name: string;
    /**
     * Extra create-body fields, minus name/code which are added here. A function
     * is resolved only when a create is actually needed, so an FK lookup does not
     * cost a request on the common "already exists" path.
     */
    extra?: Record<string, unknown> | (() => Promise<Record<string, unknown>>);
}

interface ListedRecord {
    code?: string;
    name?: string;
    [key: string]: unknown;
}

async function readJson<T>(response: { text: () => Promise<string> }): Promise<T | null> {
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : null;
}

/** The list endpoints return a bare array; tolerate a wrapped shape too. */
function asArray(body: unknown): ListedRecord[] {
    if (Array.isArray(body)) return body as ListedRecord[];
    const wrapped = body as { items?: ListedRecord[]; data?: ListedRecord[] } | null;
    return wrapped?.items ?? wrapped?.data ?? [];
}

async function findByCode(
    request: APIRequestContext,
    path: string,
    code: string,
    idKey: string,
): Promise<EnsuredRecord | null> {
    const res = await request.get(path);
    if (!res.ok()) {
        throw new Error(`GET ${path} failed with ${res.status()} while looking up code '${code}'`);
    }
    const match = asArray(await readJson(res)).find((r) => String(r.code ?? '') === code);
    if (!match) return null;
    return {
        id: Number(match[idKey] ?? match.id),
        code,
        name: String(match.name ?? ''),
        created: false,
    };
}

async function ensureRecord(
    request: APIRequestContext,
    { path, idKey, code, name, extra = {} }: EnsureSpec,
): Promise<EnsuredRecord> {
    const existing = await findByCode(request, path, code, idKey);
    if (existing) {
        // Codes are unique database-wide, so a code we did not create belongs to
        // someone else's record. Binding to it would make the test assert against
        // a stranger's data (and could implicate their records in a failure), so
        // stop rather than guess.
        if (existing.name !== name) {
            throw new Error(
                `${path}: code '${code}' already belongs to '${existing.name}', not the expected ` +
                    `'${name}'. Pick a different fixture code or reconcile the record by hand.`,
            );
        }
        return existing;
    }

    const extraFields = typeof extra === 'function' ? await extra() : extra;
    const res = await request.post(path, {
        data: { name, code, active: true, ...extraFields },
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok()) {
        throw new Error(
            `POST ${path} failed with ${res.status()}: ${(await res.text()).slice(0, 400)}`,
        );
    }
    const body = (await readJson<Record<string, unknown>>(res)) ?? {};
    return { id: Number(body[idKey] ?? body.id), code, name, created: true };
}

export function ensureRanch(
    request: APIRequestContext,
    record: { code: string; name: string },
): Promise<EnsuredRecord> {
    return ensureRecord(request, { path: 'ranches', idKey: 'ranchCounter', ...record });
}

export function ensureField(
    request: APIRequestContext,
    record: { code: string; name: string; ranchCounter: number },
): Promise<EnsuredRecord> {
    const { ranchCounter, ...rest } = record;
    return ensureRecord(request, {
        path: 'fields',
        idKey: 'fieldCounter',
        ...rest,
        extra: { ranchCounter },
    });
}

export function ensureCrew(
    request: APIRequestContext,
    record: { code: string; name: string },
): Promise<EnsuredRecord> {
    return ensureRecord(request, { path: 'crews', idKey: 'crewCounter', ...record });
}

/**
 * The office employee form wants first/last name as well as the display name;
 * the device only ever sends the code, so the split is cosmetic.
 */
export function ensureEmployee(
    request: APIRequestContext,
    record: { code: string; name: string },
): Promise<EnsuredRecord> {
    const [firstName, ...rest] = record.name.split(' ');
    return ensureRecord(request, {
        path: 'employees',
        idKey: 'employeeCounter',
        ...record,
        extra: { firstName, lastName: rest.join(' ') || firstName, payPeriod: 0 },
    });
}

/**
 * Jobs require an overtime rule. `GET overtime-rules` returns rows keyed
 * `jobTypeCounter`, and that value is what the job's `overtimeRulesCounter`
 * expects — a mismatch the API rejects with "overtimeRulesCounter is required".
 * The lowest id is used so runs are deterministic.
 */
export function ensureJob(
    request: APIRequestContext,
    record: { code: string; name: string; paymentType?: number },
): Promise<EnsuredRecord> {
    const { paymentType = 0, ...rest } = record;
    return ensureRecord(request, {
        path: 'jobs',
        idKey: 'jobCounter',
        ...rest,
        extra: async () => {
            const res = await request.get('overtime-rules');
            if (!res.ok()) throw new Error(`GET overtime-rules failed with ${res.status()}`);
            const rules = asArray(await readJson(res))
                .map((r) => Number(r.jobTypeCounter))
                .filter((id) => Number.isFinite(id))
                .sort((a, b) => a - b);
            if (!rules.length) {
                throw new Error('No overtime rules exist — a job cannot be created without one');
            }
            return { paymentType, overtimeRulesCounter: rules[0] };
        },
    });
}
