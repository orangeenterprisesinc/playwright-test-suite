/**
 * @fileoverview Cryptographically-seeded random data generators for tests.
 *
 * Uses Node.js `crypto.randomInt` for uniform distribution. Handy for
 * generating fake names, emails, phone numbers, credit card numbers, etc.
 *
 * @module utils/randomUtils
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { getRandomEmail, getFullName, getRandomUUID } from '@utils/randomUtils';
 *
 * const email = getRandomEmail('example.org'); // 'james.4821@example.org'
 * const name  = getFullName();                 // 'Robert Garcia'
 * const uuid  = getRandomUUID();               // '550e8400-e29b...'
 * ```
 */
import crypto from 'crypto';

/** @private Numeric digit character set */
const NUMERIC = '0123456789';
/** @private Upper-case alphabet */
const ALPHA_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** @private Lower-case alphabet */
const ALPHA_LOWER = 'abcdefghijklmnopqrstuvwxyz';
/** @private Combined upper + lower alphabet */
const ALPHA_ALL = ALPHA_UPPER + ALPHA_LOWER;

/**
 * Returns a single random character from the given charset.
 * @param {string} charset - Character pool
 * @returns {string} Single character
 * @private
 */
function randomChar(charset: string): string {
    return charset[crypto.randomInt(charset.length)];
}

/**
 * Returns a random string of `length` characters from `charset`.
 * @param {string} charset - Character pool
 * @param {number} length - Desired string length
 * @returns {string} Random string
 * @private
 */
function randomChars(charset: string, length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) result += randomChar(charset);
    return result;
}

/**
 * Returns a random numeric string of the specified length.
 * @param {number} digits - Number of digits
 * @returns {string} Numeric string
 */
export function getRandomNumber(digits: number): string {
    return randomChars(NUMERIC, digits);
}

/**
 * Returns a random alphabetical string (mixed case).
 * @param {number} count - String length
 */
export function getRandomAlphabets(count: number): string {
    return randomChars(ALPHA_ALL, count);
}

/**
 * Alias for {@link getRandomNumber} — returns a random numeric string.
 * @param {number} length - String length
 */
export function generateRandomNumericString(length: number): string {
    return randomChars(NUMERIC, length);
}

/**
 * Returns a random upper-case string.
 * @param {number} length - String length
 */
export function generateRandomString(length: number): string {
    return randomChars(ALPHA_UPPER, length);
}

/**
 * Returns a random string of upper-case letters, digits, commas, and periods.
 * @param {number} length - String length
 */
export function generateRandomAlphaNumericSpecialString(length: number): string {
    const charset = ALPHA_UPPER + NUMERIC + ',.';
    return randomChars(charset, length);
}

/** Generates a random `https://` URL with a `.com` TLD. */
export function getRandomWebsiteName(): string {
    return `https://${getRandomAlphabets(10).toLowerCase()}.com`;
}

/** Picks a random first name from a predefined list. */
export function getFirstName(): string {
    const names = [
        'James',
        'Mary',
        'Robert',
        'Patricia',
        'John',
        'Jennifer',
        'Michael',
        'Linda',
        'David',
        'Elizabeth',
    ];
    return names[crypto.randomInt(names.length)];
}

/** Picks a random last name from a predefined list. */
export function getLastName(): string {
    const names = [
        'Smith',
        'Johnson',
        'Williams',
        'Brown',
        'Jones',
        'Garcia',
        'Miller',
        'Davis',
        'Wilson',
        'Anderson',
    ];
    return names[crypto.randomInt(names.length)];
}

/** Returns a random "FirstName LastName" string. */
export function getFullName(): string {
    return `${getFirstName()} ${getLastName()}`;
}

/** Returns today's date in `YYYY-MM-DD` format. */
export function getCurrentDate(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Generates a random Visa-like credit card number (`4XXX-XXXX-XXXX-XXXX`). */
export function getCreditCardNumber(): string {
    return `4${getRandomNumber(3)}-${getRandomNumber(4)}-${getRandomNumber(4)}-${getRandomNumber(4)}`;
}

/** Returns a random future credit card expiry date (`MM/YY`). */
export function getExpiryDate(): string {
    const month = (crypto.randomInt(12) + 1).toString().padStart(2, '0');
    const year = (new Date().getFullYear() + crypto.randomInt(5) + 1).toString().slice(-2);
    return `${month}/${year}`;
}

/**
 * Generates a random email address.
 * @param {string} [domain='test.com'] - Email domain
 * @returns {string} Random email
 */
export function getRandomEmail(domain = 'test.com'): string {
    return `${getFirstName().toLowerCase()}.${getRandomNumber(4)}@${domain}`;
}

/** Generates a random US phone number (`+1XXXXXXXXXX`). */
export function getRandomPhoneNumber(): string {
    return `+1${getRandomNumber(10)}`;
}

/** Generates a cryptographically random UUID v4. */
export function getRandomUUID(): string {
    return crypto.randomUUID();
}
