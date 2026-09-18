import type { NewUserData } from '../../pages/admin/UsersPage';
import { cleanupTarget } from '../static/shared/cleanupTargets';
import { randomInitials, uid } from './random';

// The name prefix is the residue sweep's own `uid` prefix for users (cleanupTargets.ts), so what
// the factory names, the sweep can always find — one source, no drift.
const USER_NAME_PREFIX = cleanupTarget('user').prefixes.find((p) => p.token === 'uid')!.prefix;
const DEFAULTS = { password: 'Passw0rd!23', role: 'Clerk' } as const;

/** New User form data with a run-unique Name/Initials/Email (Name and Email share one token); any field can be overridden. */
export function makeUser(overrides: Partial<NewUserData> = {}): NewUserData {
    const token = uid();
    return {
        name: `${USER_NAME_PREFIX}${token}`,
        password: DEFAULTS.password,
        role: DEFAULTS.role,
        initials: randomInitials(),
        email: `qa.${token}@example.com`,
        ...overrides,
    };
}
