import { cleanupTarget } from '../static/shared/cleanupTargets';
import { uniqueName } from '../../utils/cleanup/runToken';

// The sweep's own `factory` prefix for employees, so whatever this mints the sweep can date and reclaim.
const PREFIX = cleanupTarget('employee').prefixes.find((p) => p.token === 'factory')!.prefix.replace(/_$/, '');

/** A run-unique employee name (~15 chars; Last Name = Name and is capped at 20). */
export function makeEmployeeName(): string {
    return uniqueName(PREFIX);
}
