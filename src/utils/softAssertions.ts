/**
 * @fileoverview Soft assertion collector that accumulates failures and throws once.
 * @module utils/softAssertions
 */
export class SoftAssertions {
    private errors: string[] = [];

    assert(condition: boolean, message: string): void {
        if (!condition) this.errors.push(message);
    }

    assertEquals<T>(actual: T, expected: T, message?: string): void {
        if (actual !== expected) this.errors.push(message || `Expected ${expected}, got ${actual}`);
    }

    assertContains(text: string, substring: string, message?: string): void {
        if (!text.includes(substring)) this.errors.push(message || `"${text}" does not contain "${substring}"`);
    }

    assertMatches(text: string, pattern: RegExp, message?: string): void {
        if (!pattern.test(text)) this.errors.push(message || `"${text}" does not match pattern ${pattern}`);
    }

    assertTrue(value: unknown, message?: string): void {
        if (!value) this.errors.push(message || `Expected truthy value, got ${value}`);
    }

    assertFalse(value: unknown, message?: string): void {
        if (value) this.errors.push(message || `Expected falsy value, got ${value}`);
    }

    getErrors(): string[] {
        return this.errors;
    }

    hasErrors(): boolean {
        return this.errors.length > 0;
    }

    getErrorCount(): number {
        return this.errors.length;
    }

    /** Throws an aggregated `Error` listing every failure, if any were recorded. */
    throwIfErrors(): void {
        if (this.errors.length > 0) {
            throw new Error(`${this.errors.length} assertion(s) failed:\n${this.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`);
        }
    }

    clear(): void {
        this.errors = [];
    }

    getReport(): string {
        if (this.errors.length === 0) return 'No errors';
        return `${this.errors.length} error(s):\n${this.errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}`;
    }
}
