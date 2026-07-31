/**
 * @fileoverview Test-data factory for PET Tiger "New User" form data.
 *
 * Builds a {@link NewUserData} object with run-unique Name/Initials/Email (the
 * Name and Email share one token for traceability), sourcing the prefix and
 * defaults from `src/data/userSetupData.ts`. Any field can be overridden.
 *
 * The `test_user_prefix` used for the Name is the same constant
 * `global-teardown.ts` sweeps on — see that module's note on why it is shared
 * rather than duplicated.
 */
import { userSetupData as userData } from '../static/journey-a/userSetupData';
import type { NewUserData } from '../../pages/admin/UsersPage';
import { randomInitials, uid } from './random';

/** Build New User form data with unique Name/Initials/Email. */
export function makeUser(overrides: Partial<NewUserData> = {}): NewUserData {
    const token = uid();
    return {
        name: `${userData.test_user_prefix}${token}`,
        password: userData.defaults.password,
        role: userData.defaults.required_only_role,
        initials: randomInitials(),
        email: `qa.${token}@example.com`,
        ...overrides,
    };
}
