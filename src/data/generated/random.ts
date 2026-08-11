/**
 * @fileoverview Generic random test-data generators.
 *
 * Framework-agnostic helpers any spec can use to produce run-unique values
 * (names, emails, ids, initials). Not seeded — values differ every run, which
 * is what create-flow tests want to avoid collisions.
 */

/** Uppercase alphanumeric alphabet used for initials/short codes. */
const ALPHANUMERIC_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * A short, run-unique token combining a timestamp and randomness (base36).
 * Ideal as a suffix for unique names and emails.
 */
export function uid(): string {
    return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** A random uppercase alphanumeric string of the given length. */
export function randomInitials(length = 3): string {
    let out = '';
    for (let i = 0; i < length; i++) {
        out += ALPHANUMERIC_UPPER[Math.floor(Math.random() * ALPHANUMERIC_UPPER.length)];
    }
    return out;
}
