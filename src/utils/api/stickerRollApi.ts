import type { APIRequestContext } from '@playwright/test';

/**
 * The pack-house line's dedicated roll-assignment write — the office surface for
 * the catalog's "ASIGNAR ROLLO" scan (B4 phase 2), `POST /scan/assign-barcode-roll`.
 * An upsert: assigning the same roll to the same employee again reports
 * `alreadyAssigned` rather than adding a second `EmployeeCodeHistory` row.
 */

export interface AssignBarcodeRollRequest {
    employeeCounter?: number;
    alternateCode: string;
    firstCode: string;
    scannedCode?: string;
}

export interface AssignBarcodeRollError {
    error: string;
    code?: string;
    errors?: Array<{ field: string; [key: string]: unknown }>;
}

export interface AssignBarcodeRollResult {
    ok: boolean;
    status: number;
    outcome?: 'inserted' | 'reassigned' | 'alreadyAssigned';
    employeeCodeHistoryCounter?: number;
    error?: AssignBarcodeRollError;
}

/**
 * Never throws on a non-2xx — B4-R8 asserts the 400 rejection body itself, so
 * the caller must be able to observe it rather than catch an exception.
 */
export async function assignBarcodeRoll(
    request: APIRequestContext,
    body: AssignBarcodeRollRequest,
): Promise<AssignBarcodeRollResult> {
    const res = await request.post('scan/assign-barcode-roll', {
        data: body,
        headers: { 'Content-Type': 'application/json' },
    });
    const status = res.status();
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok()) {
        return { ok: false, status, error: payload as unknown as AssignBarcodeRollError };
    }
    return {
        ok: true,
        status,
        outcome: payload.outcome as AssignBarcodeRollResult['outcome'],
        employeeCodeHistoryCounter: Number(payload.employeeCodeHistoryCounter),
    };
}

export interface CodeHistoryRow {
    employeeCodeHistoryCounter: number;
    alternateCode: string;
    startDateTime: string;
    firstCode: string;
    codeType: number;
    [key: string]: unknown;
}

/** `GET /employees/{id}/code-history` — read-only, rendered by EmployeeCodeHistorySection.tsx. */
export async function getCodeHistory(
    request: APIRequestContext,
    employeeId: number,
): Promise<CodeHistoryRow[]> {
    const res = await request.get(`employees/${employeeId}/code-history`);
    if (!res.ok()) {
        throw new Error(
            `GET employees/${employeeId}/code-history failed with ${res.status()}: ` +
                `${(await res.text()).slice(0, 300)}`,
        );
    }
    const body = (await res.json()) as unknown;
    return Array.isArray(body) ? (body as CodeHistoryRow[]) : [];
}
