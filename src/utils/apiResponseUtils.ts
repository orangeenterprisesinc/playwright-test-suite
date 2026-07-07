/**
 * @fileoverview API response validation utilities.
 *
 * Provides helper functions for asserting HTTP status codes, searching JSON
 * responses for expected key/value pairs, and checking for empty bodies.
 * All functions accept a {@link ResponseLike} interface so they work with
 * both Playwright's `APIResponse` and any custom response wrapper.
 *
 * @module utils/apiResponseUtils
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { verifyJsonKeyValues, isStatusCodeEqualTo } from '@utils/apiResponseUtils';
 *
 * const ok = isStatusCodeEqualTo(response, 200);
 * const valid = await verifyJsonKeyValues(response, { accountNote: 'test' });
 * ```
 */
import { Logger } from './logger';

/**
 * Minimal response contract used by utility functions.
 * Compatible with both Playwright's `APIResponse` and the native-fetch `ApiResponse`.
 *
 * @interface ResponseLike
 * @property {() => number} status - Returns the HTTP status code
 * @property {() => Promise<unknown>} json - Parses and returns the response body as JSON
 * @property {() => Promise<string>} text - Returns the response body as plain text
 */
export interface ResponseLike {
    status(): number;
    json(): Promise<unknown>;
    text(): Promise<string>;
}

const logger = new Logger('ApiResponseUtils');

/**
 * Recursively traverses a JSON object/array and collects all values
 * whose key matches `targetKey`.
 *
 * @private
 * @param {any} obj - The object or array to traverse
 * @param {string} targetKey - The key to search for
 * @param {any[]} results - Accumulator for matched values
 */
function extractMatchingValues(obj: any, targetKey: string, results: any[]): void {
    if (typeof obj === 'object' && obj !== null) {
        if (Array.isArray(obj)) {
            for (const item of obj) {
                extractMatchingValues(item, targetKey, results);
            }
        } else {
            for (const key of Object.keys(obj)) {
                if (key === targetKey) {
                    results.push(obj[key]);
                }
                extractMatchingValues(obj[key], targetKey, results);
            }
        }
    }
}

/**
 * Searches a JSON structure for a key whose value matches the expected value.
 *
 * Performs a deep, recursive search. Both the found value and `expectedValue`
 * are compared as strings for maximum flexibility.
 *
 * @param {string} targetKey - The JSON key to search for
 * @param {any} expectedValue - The expected value (compared via `String()`)
 * @param {string | object} jsonInput - Raw JSON string or parsed object
 * @returns {boolean} `true` if at least one match is found
 */
export function findValues(targetKey: string, expectedValue: any, jsonInput: string | object): boolean {
    logger.info(`Searching for key: '${targetKey}' with expected value: '${expectedValue}'`);
    try {
        let jsonMap: any;
        if (typeof jsonInput === 'string') {
            jsonMap = JSON.parse(jsonInput);
        } else {
            jsonMap = jsonInput;
        }

        const results: any[] = [];
        extractMatchingValues(jsonMap, targetKey, results);

        const found = results.some(val => String(val) === String(expectedValue));

        if (found) {
            logger.info(`Found matching value for key '${targetKey}': '${expectedValue}'`);
            logger.debug(`All values found for key '${targetKey}': ${JSON.stringify(results)}`);
        } else {
            logger.warn(`Value '${expectedValue}' not found for key '${targetKey}'. Found: ${JSON.stringify(results)}`);
        }

        return found;
    } catch (e: any) {
        logger.error(`Failed to parse JSON or search key '${targetKey}': ${e.message}`, e);
        return false;
    }
}


/**
 * Validates that a response's JSON body contains all expected key/value pairs.
 *
 * Also verifies a 200 status code. For array expected values each element is
 * checked individually.
 *
 * @param {ResponseLike} response - The HTTP response to validate
 * @param {Record<string, any>} expectedValues - Map of keys to their expected values
 * @returns {Promise<boolean>} `true` if every expected key/value is found and status is 200
 */
export async function verifyJsonKeyValues(response: ResponseLike, expectedValues: Record<string, any>): Promise<boolean> {
    let verification = true;

    if (response.status() !== 200) {
        logger.warn(`Expected status code 200, but got ${response.status()}`);
        verification = false;
    }


    const jsonBody = await response.json() as string | object; // working with object directly is safer/easier

    logger.info(`Verifying response against expected values: ${JSON.stringify(expectedValues)}`);

    for (const [key, expected] of Object.entries(expectedValues)) {
        if (Array.isArray(expected)) {
            for (const val of expected) {
                const result = findValues(key, val, jsonBody);
                logger.info(`Verification for key='${key}', expected='${val}': '${result}'`);
                if (!result) verification = false;
            }
        } else {
            const result = findValues(key, expected, jsonBody);
            logger.info(`Verification for key='${key}', expected='${expected}': '${result}'`);
            if (!result) verification = false;
        }
    }

    logger.info(`Overall verification result: ${verification}`);
    return verification;
}


/**
 * Checks whether the response body is empty (or whitespace-only).
 *
 * Logs a warning when the status is not 200.
 *
 * @param {ResponseLike} response - The HTTP response to inspect
 * @returns {Promise<boolean>} `true` if the body is empty or whitespace-only
 */
export async function isResponseBodyEmpty(response: ResponseLike): Promise<boolean> {
    // Mimic Java: check 200 first
    if (response.status() !== 200) {
        logger.warn(`isResponseBodyEmpty: Status check failed. Expected 200, got ${response.status()}`);
    }
    const body = await response.text();
    const result = !body || body.trim().length === 0;

    if (result) {
        logger.info("Response body is empty as expected.");
    } else {
        logger.error(`Response body is not empty. Actual content: ${body}`);
    }

    return result;
}

/**
 * Asserts that the response's HTTP status code equals the expected value.
 *
 * @param {ResponseLike} response - The HTTP response to check
 * @param {number} expectedStatusCode - The expected HTTP status code
 * @returns {boolean} `true` if the actual status matches
 */
export function isStatusCodeEqualTo(response: ResponseLike, expectedStatusCode: number): boolean {
    const actualStatusCode = response.status();
    const result = actualStatusCode === expectedStatusCode;

    if (result) {
        logger.info(`Status code is as expected: ${expectedStatusCode}`);
    } else {
        logger.error(`Status code mismatch. Expected: ${expectedStatusCode}, Actual: ${actualStatusCode}`);
    }

    return result;
}
