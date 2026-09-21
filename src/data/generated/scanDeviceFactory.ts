import type { ScanDeviceGeneral } from '../../pages/setup/ScanDevicePage';
import { RUN_TOKEN } from '../../utils/cleanup/runToken';

// `<prefix><RUN_TOKEN>`: RUN_TOKEN is run- and worker-unique, and the residue sweep's `six` decoder
// expects exactly six base36 digits after the prefix — an undecodable name is one the sweep can
// never reclaim. ReferencePrefix is nvarchar(3).
export function makeScanDevice(prefix: string): ScanDeviceGeneral {
    const name = `${prefix}${RUN_TOKEN}`;
    return { name, referencePrefix: `Z${RUN_TOKEN.slice(-2)}`, webMailAddress: `${name}@silo` };
}

/** >=4 digits, no leading zero — the journey-B barcode rule; `offset` keeps sibling entities of one run distinct. */
export function runUniqueCode(offset: number): string {
    return String(parseInt(RUN_TOKEN, 36) + offset);
}
