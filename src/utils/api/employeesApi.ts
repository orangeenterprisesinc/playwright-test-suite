import type { APIRequestContext } from '@playwright/test';

/** `GET /employees/{id}` — read-only. Wire keys are open: callers pick the ones they assert. */
export interface EmployeeRecord {
    employeeCounter?: number;
    name?: string;
    code?: string;
    [key: string]: unknown;
}

/** GET, merge, PUT (the shape of setJobFields): `employeeCounter` is dropped from the body, undefined values are skipped, null is sent. */
export async function setEmployeeFields(request: APIRequestContext, id: number, fields: Record<string, unknown>): Promise<void> {
    const { employeeCounter: _drop, ...body } = await getEmployee(request, id);
    const defined = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    const res = await request.put(`employees/${id}`, { data: { ...body, ...defined }, headers: { 'Content-Type': 'application/json' } });
    if (!res.ok()) {
        throw new Error(`PUT employees/${id} (${JSON.stringify(defined)}) failed with ${res.status()}: ${(await res.text()).slice(0, 400)}`);
    }
}

export async function getEmployee(request: APIRequestContext, id: number): Promise<EmployeeRecord> {
    const res = await request.get(`employees/${id}`);
    if (!res.ok()) {
        throw new Error(`GET employees/${id} failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as EmployeeRecord;
}
