import { cleanupTarget, isSweepable } from '../static/shared/cleanupTargets';
import { readableName } from '../../utils/cleanup/runToken';

// The sweep's own `readable` row for crews, so whatever this mints the sweep can date and reclaim.
const NOUN = cleanupTarget('crew').prefixes.find((p) => p.token === 'readable')!.prefix.replace(/^NEW /, '');
const MAX_LENGTH = 30;

/** A run-tagged crew name: `<owner> NEW CREW <MMDD-HHmmss UTC>-W<worker>`, e.g. `A4 NEW CREW 1029-153245-W1`. */
export function makeCrewName(owner: string): string {
    const name = readableName(owner, NOUN);
    if (!isSweepable('crew', name)) throw new Error(`makeCrewName: '${name}' is not a name the residue sweep reclaims (cleanupTargets.ts)`);
    if (name.length > MAX_LENGTH) throw new Error(`makeCrewName: '${name}' is ${name.length} chars, over the crew limit of ${MAX_LENGTH}`);
    return name;
}
