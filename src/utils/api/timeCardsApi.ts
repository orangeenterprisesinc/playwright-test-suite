import type { APIRequestContext } from '@playwright/test';

/**
 * Reading back the time cards a device import created, and removing them again.
 *
 * Rows are found by **reference** — the device stamps each punch with one
 * (`0000001-260810-CI-DFLT-ui`), the importer upserts on it verbatim, and it is
 * the only value tying an office row to the exact device record that produced it.
 *
 * ## Why assertions must compare ids, not just check for non-null
 *
 * The importer resolves `<Employee>6001</Employee>` through a **nine-rung fallback
 * ladder** (`importmap/employee_fk_ladder.go`): the declared column, then
 * `Employee.Name`, then `AlternateCode`, then code history, and eventually the
 * **"Undefined Employee"** row. So a code that matches nothing can still come back
 * with a perfectly non-null `employeeCounter` pointing at the wrong employee. Only
 * comparing against the seeded counter proves the link is real.
 */

/** `cardType` codes, per importmap/timecard.go. */
export const CARD_TYPE = { timeOut: 0, timeIn: 1, signature: 2, nonLabor: 3 } as const;

export interface OfficeTimeCard {
    timeCardCounter: number;
    cardType?: number;
    reference?: string;
    dateTime?: string;
    employeeCounter?: number | null;
    employeeName?: string | null;
    crewCounter?: number | null;
    ranchCounter?: number | null;
    fieldCounter?: number | null;
    jobCounter?: number | null;
    /** True for imported rows — the mapper stamps it explicitly. */
    programCreated?: boolean;
    /**
     * The device's `<GpsReading>`, stored verbatim by the importer
     * (`importmap/timecard.go` maps the column). Only place the value is
     * observable — the office UI has no field for it.
     */
    gpsReading?: string | null;
    /**
     * The device's `<TraceabilityCode>` — a sticker roll's first code (B4),
     * stored verbatim by the importer alongside `gpsReading`. Nullable: absent
     * on any card that never carried one.
     */
    traceabilityCode?: string | null;
    /** `<NumOfPieces>` on a piece-out row. */
    numOfPieces?: number | string | null;
    /**
     * The importer writes its FK-ladder decisions here — B7 reads the
     * "Assigning to Undefined Employee - Missing Code: …" line the sticker rule
     * appends when a prefix resolves to no assignment.
     */
    memo?: string | null;
    /** Rendered `EmployeeSource`, e.g. "Barcode Badge", "Crew", "Sticker Code". */
    employeeSourceText?: string | null;
    transferred?: boolean;
    version?: string;
    [key: string]: unknown;
}

function asArray(body: unknown): OfficeTimeCard[] {
    if (Array.isArray(body)) return body as OfficeTimeCard[];
    const wrapped = body as { items?: OfficeTimeCard[]; data?: OfficeTimeCard[] } | null;
    return wrapped?.items ?? wrapped?.data ?? [];
}

/** `YYYY-MM-DD` for the from/to filters, in local time (the app's day boundary). */
export function isoDay(date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Time cards for a day window, optionally one card type.
 * `GET /time-cards?from&to&cardType` — `to` is inclusive.
 */
export async function listTimeCards(
    request: APIRequestContext,
    opts: { from: string; to: string; cardType?: number },
): Promise<OfficeTimeCard[]> {
    const params: Record<string, string> = { from: opts.from, to: opts.to };
    if (opts.cardType !== undefined) params.cardType = String(opts.cardType);

    const res = await request.get('time-cards', { params });
    if (!res.ok()) {
        throw new Error(`GET time-cards failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    return asArray(await res.json());
}

/**
 * The rows whose reference is one of `references`.
 *
 * Polls, because the import worker persists asynchronously — a run can report
 * `completed` a moment before every row is queryable.
 */
export async function findByReferences(
    request: APIRequestContext,
    references: string[],
    opts: { from: string; to: string; cardType?: number; timeoutMs?: number },
): Promise<OfficeTimeCard[]> {
    const wanted = new Set(references);
    const deadline = Date.now() + (opts.timeoutMs ?? 30_000);
    for (;;) {
        const found = (await listTimeCards(request, opts)).filter((c) =>
            wanted.has(String(c.reference ?? '')),
        );
        if (found.length >= references.length || Date.now() > deadline) return found;
        await new Promise((r) => setTimeout(r, 1_000));
    }
}

/**
 * Delete an imported time card. Best-effort by design: cleanup must never turn a
 * green assertion red, so the caller logs whatever could not be removed.
 */
export async function deleteTimeCard(
    request: APIRequestContext,
    id: number,
): Promise<{ deleted: boolean; status: number }> {
    const detail = await request.get(`time-cards/${id}`);
    if (!detail.ok()) return { deleted: false, status: detail.status() };
    const { version } = (await detail.json()) as OfficeTimeCard;

    const res = await request.delete(`time-cards/${id}`, {
        data: { rowversion: version },
        headers: { 'Content-Type': 'application/json' },
    });
    return { deleted: res.ok(), status: res.status() };
}

/** The `<Reference>` values an export envelope carries, in document order. */
export function referencesInExport(xml: string): string[] {
    return [...xml.matchAll(/<Reference>([^<]+)<\/Reference>/g)].map((m) => m[1]);
}

/**
 * Delete any punch these fixture employees already have on `day`, before a run
 * adds its own.
 *
 * Needed because the import is asynchronous on a per-client cadence (15 minutes
 * on dev): when a run's poll times out, the file still imports later and creates
 * rows the test never saw and therefore never cleaned up. Those orphans then give
 * the *next* run a second punch for the same employee on the same day, which the
 * office flags as a duplicate Time In and shows as **Blocking** rather than
 * Warning — so a stale run breaks every later one until someone clears it by hand.
 *
 * Scoped to the seeded employee ids and one day, so it can only ever remove this
 * suite's own fixture data. `cardTypes`, when given, narrows the sweep further —
 * B3 imports two Time In cards for one employee and must not touch any other
 * card type that employee happens to carry that day.
 */
export async function sweepFixtureCards(
    request: APIRequestContext,
    opts: { employeeIds: number[]; day: string; cardTypes?: number[] },
): Promise<{ removed: number; failed: number }> {
    const wanted = new Set(opts.employeeIds);
    const wantedTypes = opts.cardTypes ? new Set(opts.cardTypes) : undefined;
    const existing = (await listTimeCards(request, { from: opts.day, to: opts.day })).filter(
        (c) => wanted.has(Number(c.employeeCounter)) && (!wantedTypes || wantedTypes.has(Number(c.cardType))),
    );

    let removed = 0;
    let failed = 0;
    for (const card of existing) {
        const { deleted } = await deleteTimeCard(request, card.timeCardCounter);
        if (deleted) removed += 1;
        else failed += 1;
    }
    return { removed, failed };
}
