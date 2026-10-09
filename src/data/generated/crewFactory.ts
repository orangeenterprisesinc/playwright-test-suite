import { cleanupTarget } from '../static/shared/cleanupTargets';
import { uniqueName } from '../../utils/cleanup/runToken';

// The sweep's own `factory` prefix for crews, so whatever this mints the sweep can date and reclaim.
const PREFIX = cleanupTarget('crew').prefixes.find((p) => p.token === 'factory')!.prefix.replace(/_$/, '');

/** A run-unique crew name: `E2ECrew_<RUN_TOKEN>_<seq>`. */
export function makeCrewName(): string {
    return uniqueName(PREFIX);
}
