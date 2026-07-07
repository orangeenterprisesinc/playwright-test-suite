/**
 * @fileoverview Base64 encoding / decoding helpers using Node.js `Buffer`.
 *
 * @module utils/stringDecoder
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { encodeBase64UTF8, decodeBase64UTF8, isBase64 } from '@utils/stringDecoder';
 *
 * const encoded = encodeBase64UTF8('hello');   // 'aGVsbG8='
 * const decoded = decodeBase64UTF8(encoded);   // 'hello'
 * isBase64(encoded); // true
 * ```
 */

/**
 * Decodes a Base64-encoded string to UTF-8 text.
 *
 * @param {string} encoded - Base64 string
 * @returns {string} Decoded UTF-8 string (empty string if input is falsy)
 */
export function decodeBase64UTF8(encoded: string): string {
    if (!encoded) return '';
    return Buffer.from(encoded, 'base64').toString('utf-8');
}

/**
 * Encodes a plain UTF-8 string to Base64.
 *
 * @param {string} plain - Plain text string
 * @returns {string} Base64-encoded string (empty string if input is falsy)
 */
export function encodeBase64UTF8(plain: string): string {
    if (!plain) return '';
    return Buffer.from(plain, 'utf-8').toString('base64');
}

/**
 * Tests whether a string looks like valid Base64 (correct charset and length divisible by 4).
 *
 * @param {string} value - String to check
 * @returns {boolean} `true` if the string appears to be valid Base64
 */
export function isBase64(value: string): boolean {
    if (!value) return false;
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(value) && value.length % 4 === 0;
}
