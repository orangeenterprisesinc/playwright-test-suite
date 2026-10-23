import { expect, type APIRequestContext } from '@playwright/test';

/**
 * Setup export — the office pushes a device's configuration file to that device. Three asymmetric
 * endpoints: the push and the run detail hang off `connectivity/export/scan-devices`, the content
 * off `connectivity/export/runs`. Deliberately scoped to one device: the unscoped POST pushes a
 * setup file to every configured mailbox, including real phones, on a shared environment.
 */
interface ScanDeviceListItem {
    deviceCounter?: number;
    id?: number;
    name?: string;
    deviceType?: number;
    type?: number;
    active?: boolean;
    isActive?: boolean;
}


export interface ExportedDevice {
    id: number;
    name?: string;
}

/** Tolerates a raw array or an `{ items | data }` wrapper — the list shape is not pinned elsewhere. */
function asArray<T>(body: unknown): T[] {
    if (Array.isArray(body)) return body as T[];
    const wrapped = body as { items?: T[]; data?: T[] } | null;
    return wrapped?.items ?? wrapped?.data ?? [];
}

/** The first active device of `deviceType`, or null — the caller asserts, with its own prose. */
export async function findActiveDeviceOfType(
    request: APIRequestContext,
    deviceType: number,
): Promise<ExportedDevice | null> {
    const res = await request.get('scan-devices');
    expect(res.ok(), `GET scan-devices failed with ${res.status()}`).toBe(true);
    const hit = asArray<ScanDeviceListItem>(await res.json()).find(
        (d) => Boolean(d.active ?? d.isActive) && (d.deviceType ?? d.type) === deviceType,
    );
    return hit ? { id: Number(hit.deviceCounter ?? hit.id), name: hit.name } : null;
}

