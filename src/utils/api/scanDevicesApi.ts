import type { APIRequestContext } from '@playwright/test';

/** What A5's cleanup carries for the `deviceEmployeeMembership` restorer: the shared device, and the employee the run added. */
export interface DeviceMembershipSnapshot {
    deviceId: number;
    employeeId?: number;
}

/**
 * Remove one employee id from a scan device's `employeeIds`. Deleting the employee does not:
 * it leaves a dangling `#<id>` row. Read-modify-write echoing the GET body (so `version`
 * rides along) and touching nothing but that one id, so a concurrent writer's rows survive.
 */
export async function removeEmployeeFromDevice(
    request: APIRequestContext,
    deviceId: number,
    employeeId: number,
): Promise<boolean> {
    const res = await request.get(`scan-devices/${deviceId}`);
    if (!res.ok()) {
        throw new Error(`GET scan-devices/${deviceId} failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    const device = (await res.json()) as { employeeIds?: number[]; [key: string]: unknown };
    if (!device.employeeIds?.includes(employeeId)) return false;

    const put = await request.put(`scan-devices/${deviceId}`, {
        data: { ...device, employeeIds: device.employeeIds.filter((id) => id !== employeeId) },
        headers: { 'Content-Type': 'application/json' },
    });
    if (!put.ok()) {
        throw new Error(
            `PUT scan-devices/${deviceId} (remove employee ${employeeId}) failed with ${put.status()}: ${(await put.text()).slice(0, 400)}`,
        );
    }
    return true;
}
