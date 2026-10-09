import type { APIRequestContext } from '@playwright/test';

/** `GET /employees/{id}` — read-only. Wire keys are open: callers pick the ones they assert. */
export interface EmployeeRecord {
    employeeCounter?: number;
    name?: string;
    code?: string;
    [key: string]: unknown;
}

export async function getEmployee(request: APIRequestContext, id: number): Promise<EmployeeRecord> {
    const res = await request.get(`employees/${id}`);
    if (!res.ok()) {
        throw new Error(`GET employees/${id} failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as EmployeeRecord;
}
