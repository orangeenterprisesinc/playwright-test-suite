/**
 * @fileoverview Static values for the login module's negative tests.
 *
 * A typed replacement for the former `login-module-data.json`. The valid
 * credentials deliberately live elsewhere — they come from `USER_NAME` /
 * `PASSWORD` per environment (see `src/config/envLoader.ts`), so only the
 * *invalid* values and the expected error belong here.
 *
 * @module data/loginModuleData
 */

/** Shape of the login module value bag. */
export interface LoginModuleData {
    /** A password guaranteed not to match any account. */
    wrong_password: string;
    /** A username guaranteed not to exist. */
    wrong_username: string;
    /**
     * The rejection message the app shows. Deliberately identical for a bad
     * username, a bad password, or both — the app must not reveal which field
     * was wrong, and the three negative tests assert exactly this string.
     */
    invalid_credentials_error_message: string;
}

export const loginModuleData: LoginModuleData = {
    wrong_password: 'wrong-password-123',
    wrong_username: 'nouser@example.com',
    invalid_credentials_error_message: 'Invalid username or password.',
};
