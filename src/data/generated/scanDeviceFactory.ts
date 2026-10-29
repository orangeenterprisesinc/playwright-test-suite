import type { ScanDeviceGeneral } from '../../pages/setup/ScanDevicePage';
import { RUN_TOKEN, readableName } from '../../utils/cleanup/runToken';
import { isSweepable } from '../static/shared/cleanupTargets';

const MAX_LENGTH = 30;

// `<owner>-NEW-<NOUN>-<MMDD-HHmmss>-W<n>`: hyphens, never spaces, because the mailbox is name + `@silo`.
// ReferencePrefix is nvarchar(3): a lead letter plus the last two RUN_TOKEN digits.
export function makeScanDevice(owner: string, referenceLead = 'Z', noun = 'DEVICE'): ScanDeviceGeneral {
    const name = readableName(owner, noun, '-');
    if (!isSweepable('scanDevice', name)) throw new Error(`makeScanDevice: '${name}' is not a name the residue sweep reclaims (cleanupTargets.ts)`);
    if (name.length > MAX_LENGTH) throw new Error(`makeScanDevice: '${name}' is ${name.length} chars, over the device limit of ${MAX_LENGTH}`);
    return { name, referencePrefix: `${referenceLead}${RUN_TOKEN.slice(-2)}`, webMailAddress: `${name}@silo` };
}

/** >=4 digits, no leading zero — the journey-B barcode rule; `offset` keeps sibling entities of one run distinct. */
export function runUniqueCode(offset: number): string {
    return String(parseInt(RUN_TOKEN, 36) + offset);
}
