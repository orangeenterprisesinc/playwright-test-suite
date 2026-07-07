/**
 * @fileoverview Soft assertion collector that accumulates failures and throws once.
 *
 * Unlike hard assertions that fail immediately, {@link SoftAssertions} records
 * all failures and only throws when {@link SoftAssertions.throwIfErrors} is called.
 *
 * @module utils/softAssertions
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { SoftAssertions } from '@utils/softAssertions';
 *
 * const soft = new SoftAssertions();
 * soft.assertEquals(title, 'Home', 'Title mismatch');
 * soft.assertContains(body, 'Welcome');
 * soft.throwIfErrors(); // throws if any assertion failed
 * ```
 */

/**
 * Collects multiple assertion failures and reports them together.
 *
 * @class SoftAssertions
 */
export class SoftAssertions {
    /** @private Accumulated error messages */
    private errors: string[] = [];

    /**
     * Asserts that a condition is true; records an error message if false.
     * @param {boolean} condition - The condition to check
     * @param {string} message - Error message if condition is false
     */
    assert(condition: boolean, message: string): void {
        if (!condition) {
            this.errors.push(message);
        }
    }

    /**
     * Asserts strict equality between two values.
     * @template T
     * @param {T} actual - Actual value
     * @param {T} expected - Expected value
     * @param {string} [message] - Custom error message
     */
    assertEquals<T>(actual: T, expected: T, message?: string): void {
        if (actual !== expected) {
            this.errors.push(message || `Expected ${expected}, got ${actual}`);
        }
    }

    /**
     * Asserts that `text` contains `substring`.
     * @param {string} text - The text to search in
     * @param {string} substring - The substring to look for
     * @param {string} [message] - Custom error message
     */
    assertContains(text: string, substring: string, message?: string): void {
        if (!text.includes(substring)) {
            this.errors.push(message || `"${text}" does not contain "${substring}"`);
        }
    }

    /**
     * Asserts that `text` matches a regular expression pattern.
     * @param {string} text - The text to test
     * @param {RegExp} pattern - The regex pattern
     * @param {string} [message] - Custom error message
     */
    assertMatches(text: string, pattern: RegExp, message?: string): void {
        if (!pattern.test(text)) {
            this.errors.push(message || `"${text}" does not match pattern ${pattern}`);
        }
    }

    /**
     * Asserts that `value` is truthy.
     * @param {*} value - The value to check
     * @param {string} [message] - Custom error message
     */
    assertTrue(value: any, message?: string): void {
        if (!value) {
            this.errors.push(message || `Expected truthy value, got ${value}`);
        }
    }


    /**
     * Asserts that `value` is falsy.
     * @param {*} value - The value to check
     * @param {string} [message] - Custom error message
     */
    assertFalse(value: any, message?: string): void {
        if (value) {
            this.errors.push(message || `Expected falsy value, got ${value}`);
        }
    }

    /** Returns all accumulated error messages. */
    getErrors(): string[] {
        return this.errors;
    }

    /** Returns `true` if any assertions have failed. */
    hasErrors(): boolean {
        return this.errors.length > 0;
    }

    /** Returns the number of accumulated errors. */
    getErrorCount(): number {
        return this.errors.length;
    }

    /**
     * Throws an `Error` listing all accumulated failures if any exist.
     * @throws {Error} Aggregated error with all failure messages
     */
    throwIfErrors(): void {
        if (this.errors.length > 0) {
            const errorMessage = `${this.errors.length} assertion(s) failed:\n${this.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;
            throw new Error(errorMessage);
        }
    }

    clear(): void {
        this.errors = [];
    }

    getReport(): string {
        if (this.errors.length === 0) {
            return 'No errors';
        }
        return `${this.errors.length} error(s):\n${this.errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}`;
    }
}
