import { cleanupTarget } from '../static/shared/cleanupTargets';
import { uniqueName } from '../../utils/cleanup/runToken';

// The prefix is the residue sweep's own `factory` prefix for crew tables, so whatever this mints
// the sweep can always date and reclaim. `uniqueName` adds the `_` before the run token itself.
const PREFIX = cleanupTarget('crewTable').prefixes.find((p) => p.token === 'factory')!.prefix.replace(/_$/, '');

/** A run-unique crew-table name (max 50 chars on the form; this stays well under). */
export function makeCrewTableName(): string {
    return uniqueName(PREFIX);
}
