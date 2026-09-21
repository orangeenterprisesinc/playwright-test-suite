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

interface ExportSend {
    deviceExportSendCounter: number;
    deviceCounter: number;
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

/** Push the setup file to one device and read back exactly what that device was sent. */
export async function pushSetupExport(
    request: APIRequestContext,
    deviceId: number,
): Promise<{ runId: number; xml: string }> {
    const exportRes = await request.post(`connectivity/export/scan-devices/${deviceId}`, { data: {} });
    expect(exportRes.ok(), `POST export for device ${deviceId} failed with ${exportRes.status()}`).toBe(true);
    const { runId } = (await exportRes.json()) as { runId: number };

    const runRes = await request.get(`connectivity/export/scan-devices/runs/${runId}`);
    expect(runRes.ok(), `GET export run ${runId} failed with ${runRes.status()}`).toBe(true);
    const send = ((await runRes.json()) as { sends?: ExportSend[] }).sends?.find((s) => s.deviceCounter === deviceId);
    expect(send, `export run ${runId} carried no send for device ${deviceId}`).toBeDefined();

    const contentRes = await request.get(
        `connectivity/export/runs/${runId}/sends/${send!.deviceExportSendCounter}/content`,
    );
    expect(contentRes.ok(), `GET export content failed with ${contentRes.status()}`).toBe(true);
    return { runId, xml: await contentRes.text() };
}
