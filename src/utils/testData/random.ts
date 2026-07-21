/**
 * @fileoverview Generic random test-data generators.
 *
 * Framework-agnostic helpers any spec can use to produce run-unique values
 * (names, emails, ids, initials). Not seeded — values differ every run, which
 * is what create-flow tests want to avoid collisions.
 *
 * @module utils/testData/random
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { uid, randomInitials, randomEmail, pickRandom } from '../../src/utils/testData';
 *
 * const token = uid();                       // e.g. "mrv0u3k7f2"
 * const initials = randomInitials();         // e.g. "K3Z"
 * const email = randomEmail('qa');           // e.g. "qa.mrv0u3k7f2@example.com"
 * const role = pickRandom(['Clerk', 'Manager']);
 * ```
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

/**
 * A random uppercase alphanumeric string of the given length.
 *
 * @param length number of characters (default 3)
 */
export function randomInitials(length = 3): string {
    let out = '';
    for (let i = 0; i < length; i++) {
        out += ALPHANUMERIC_UPPER[Math.floor(Math.random() * ALPHANUMERIC_UPPER.length)];
    }
    return out;
}

/** A random integer in the inclusive range [min, max]. */
export function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * A run-unique email address.
 *
 * @param localPrefix local-part prefix before the token (default `'qa'`)
 * @param domain      email domain (default `'example.com'`)
 */
export function randomEmail(localPrefix = 'qa', domain = 'example.com'): string {
    return `${localPrefix}.${uid()}@${domain}`;
}

/** Pick a random element from a non-empty array. */
export function pickRandom<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}
