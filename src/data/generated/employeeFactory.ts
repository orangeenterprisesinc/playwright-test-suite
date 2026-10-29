import { cleanupTarget, isSweepable } from '../static/shared/cleanupTargets';
import { readableName } from '../../utils/cleanup/runToken';

// The sweep's own `readable` row for employees, so whatever this mints the sweep can date and reclaim.
const NOUN = cleanupTarget('employee').prefixes.find((p) => p.token === 'readable')!.prefix.replace(/^NEW /, '');
const MAX_NAME = 50;
const MAX_LAST_NAME = 20;

/** `name` is the sweepable tag (`A5 NEW EMPLOYEE 1029-153245-W1`); `lastName` is its short form (`A5 1029-153245-W1`) for the 20-char field. */
export function makeEmployeeName(owner: string): { name: string; lastName: string } {
    const name = readableName(owner, NOUN);
    const lastName = `${owner} ${name.slice(`${owner} NEW ${NOUN} `.length)}`;
    if (!isSweepable('employee', name)) throw new Error(`makeEmployeeName: '${name}' is not a name the residue sweep reclaims (cleanupTargets.ts)`);
    if (name.length > MAX_NAME) throw new Error(`makeEmployeeName: Name '${name}' is ${name.length} chars, over ${MAX_NAME}`);
    if (lastName.length > MAX_LAST_NAME) throw new Error(`makeEmployeeName: Last Name '${lastName}' is ${lastName.length} chars, over ${MAX_LAST_NAME}`);
    return { name, lastName };
}
