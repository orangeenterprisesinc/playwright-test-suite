/**
 * @fileoverview Verifies that a JSON API response contains a record matching
 * a set of expected key-value pairs — checks the response body itself, and
 * recurses into nested objects/arrays (e.g. a paginated `{ items: [...] }`
 * body) so callers don't need to know the exact response shape.
 *
 * @module utils/apiResponseUtils
 */
import type { APIResponse } from '@playwright/test';

function matches(node: unknown, expected: Record<string, unknown>): boolean {
    if (!node || typeof node !== 'object') return false;
    return Object.entries(expected).every(([key, value]) => (node as Record<string, unknown>)[key] === value);
}

function findMatch(node: unknown, expected: Record<string, unknown>): boolean {
    if (Array.isArray(node)) return node.some((item) => findMatch(item, expected));
    if (node && typeof node === 'object') {
        if (matches(node, expected)) return true;
        return Object.values(node).some((value) => findMatch(value, expected));
    }
    return false;
}

/**
 * Parses `response`'s body as JSON and checks whether it (or any object
 * nested within it) matches every key-value pair in `expected`.
 *
 * @example
 * ```typescript
 * expect(await verifyJsonKeyValues(response, { accountNote: 'test' })).toBeTruthy();
 * ```
 */
export async function verifyJsonKeyValues(response: APIResponse, expected: Record<string, unknown>): Promise<boolean> {
    const body = await response.json();
    return findMatch(body, expected);
}
