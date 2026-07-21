/**
 * @fileoverview Test-data factory for PET Tiger "New User" form data.
 *
 * Builds a {@link NewUserData} object with run-unique Name/Initials/Email (the
 * Name and Email share one token for traceability), sourcing the prefix and
 * defaults from `src/data/user-setup-data.json`. Any field can be overridden.
 *
 * @module utils/testData/userFactory
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { makeUser } from '../../src/utils/testData';
 *
 * const admin = makeUser({ role: 'Administrator' });
 * const minimal = makeUser();               // defaults from the data file
 * ```
 */
import userData from '../../data/user-setup-data.json';
import type { NewUserData } from '../../pages/UsersPage';
import { randomInitials, uid } from './random';

/**
 * Build New User form data with unique Name/Initials/Email.
 *
 * @param overrides fields to override the generated/default values
 */
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
