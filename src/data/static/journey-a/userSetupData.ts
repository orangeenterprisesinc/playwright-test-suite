/**
 * @fileoverview Static values for the User Setup journey (File ▸ Administration ▸ Users).
 *
 * A typed replacement for the former `user-setup-data.json`. TypeScript rather
 * than JSON because {@link UserSetupData.test_user_prefix} is a **cross-cutting
 * constant**, not per-spec data — three places depend on it agreeing:
 *
 * - `src/data/generated/userFactory.ts` uses it to *name* every generated user
 * - `src/fixtures/global-teardown.ts` uses it to *find and delete* leftovers
 * - `tests/web/user-setup.spec.ts` reads it for its own cleanup
 *
 * If those ever disagreed, the teardown sweep would stop matching the users the
 * factory creates and would silently orphan them in a shared database — the same
 * class of problem the SQL cleanup exists to prevent. Keeping it single-source
 * here, behind a compile-checked type, makes that drift impossible.
 *
 * @module data/userSetupData
 */

/** Shape of the User Setup value bag. */
export interface UserSetupData {
    /** Name prefix for every generated test user. The teardown sweep matches on it. */
    test_user_prefix: string;
    /** Every Role option the New User form offers, in the order the UI lists them. */
    roles: string[];
    defaults: {
        all_fields_role: string;
        required_only_role: string;
        creatable_role: string;
        password: string;
        language: string;
        access_to_reverse: string;
    };
    personal_info: {
        first_name: string;
        middle_name: string;
        last_name: string;
        title: string;
    };
    permissions: {
        additional_access: string[];
    };
    messages: {
        user_created: string;
        initials_in_use: string;
        fix_errors: string;
    };
}

export const userSetupData: UserSetupData = {
    test_user_prefix: 'QA User ',

    // Order matters: user-setup.spec.ts asserts the Role dropdown's options with
    // toHaveText(roles), which is order-sensitive — so this doubles as a guard
    // against an option being added, removed or reordered in the app.
    roles: [
        'Clerk',
        'Administrator',
        'Field Supervisor',
        'Field Man',
        'Time Card Clerk',
        'Manager',
        'Scan Screens Only',
        'Report Viewer',
        'Report Viewer Limited',
        'Input Clerk',
        'Crew Supervisor',
        'Employee Setup Clerk',
        'Analyst',
        'Crew Reviewer',
        'Warehouse Supervisor',
        'Shortcuts Only',
        'Device Administrator',
    ],

    defaults: {
        all_fields_role: 'Administrator',
        required_only_role: 'Clerk',
        creatable_role: 'Report Viewer',
        password: 'Passw0rd!23',
        language: '__none__',
        access_to_reverse: 'All',
    },

    personal_info: {
        first_name: 'Journey',
        middle_name: 'A1',
        last_name: 'Tester',
        title: 'HR Manager',
    },

    permissions: {
        additional_access: ['View Confidential Data', 'View SSN'],
    },

    messages: {
        user_created: 'User created',
        initials_in_use: 'Already in use',
        fix_errors: 'Fix errors to save',
    },
};
