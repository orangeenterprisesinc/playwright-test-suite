/**
 * @fileoverview Custom Playwright assertion helpers for common element checks.
 *
 * {@link CustomAssertions} wraps `expect()` calls into reusable, descriptive
 * static methods so tests read like natural-language specifications.
 *
 * @module utils/customAssertions
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { CustomAssertions } from '@utils/customAssertions';
 *
 * await CustomAssertions.assertElementCount(page.locator('.item'), 5);
 * await CustomAssertions.assertAllVisible(page.locator('.card'));
 * ```
 */
import {expect, Locator} from '@playwright/test';

/**
 * Static helper class providing Playwright-specific element assertions.
 *
 * @class CustomAssertions
 */
export class CustomAssertions {

    /**
     * Asserts that the number of elements matching the locator equals `expectedCount`.
     *
     * @param {Locator} locator - Playwright locator
     * @param {number} expectedCount - Expected number of matches
     * @param {string} [message] - Optional failure message
     */
    static async assertElementCount(
        locator: Locator,
        expectedCount: number,
        message?: string,
    ): Promise<void> {
        const count = await locator.count();
        expect(count, message || `Expected ${expectedCount} elements, found ${count}`).toBe(
            expectedCount,
        );
    }


    /**
     * Asserts that the text content of all matched elements equals the given array (in order).
     * @param {Locator} locator - Playwright locator
     * @param {string[]} expectedTexts - Expected texts in exact order
     */
    static async assertTextInOrder(locator: Locator, expectedTexts: string[]): Promise<void> {
        const texts = await locator.allTextContents();
        expect(texts).toEqual(expectedTexts);
    }

    /**
     * Asserts that every element matching the locator is visible.
     * @param {Locator} locator - Playwright locator
     */
    static async assertAllVisible(locator: Locator): Promise<void> {
        const count = await locator.count();
        for (let i = 0; i < count; i++) {
            await expect(locator.nth(i)).toBeVisible();
        }
    }


    /**
     * Asserts that no matched element has empty (whitespace-only) text.
     * @param {Locator} locator - Playwright locator
     */
    static async assertNoneEmpty(locator: Locator): Promise<void> {
        const texts = await locator.allTextContents();
        texts.forEach((text, index) => {
            expect(text.trim(), `Element ${index} has empty text`).not.toBe('');
        });
    }

    /**
     * Asserts that the given attribute on the locator equals `expectedValue`.
     * @param {Locator} locator - Playwright locator
     * @param {string} attribute - HTML attribute name
     * @param {string} expectedValue - Expected attribute value
     */
    static async assertAttributeValue(
        locator: Locator,
        attribute: string,
        expectedValue: string,
    ): Promise<void> {
        const value = await locator.getAttribute(attribute);
        expect(value, `Attribute ${attribute} should be ${expectedValue}`).toBe(expectedValue);
    }

    /**
     * Asserts that the element has the specified CSS class.
     * @param {Locator} locator - Playwright locator
     * @param {string} className - CSS class name to check
     */
    static async assertHasClass(locator: Locator, className: string): Promise<void> {
        const classes = await locator.getAttribute('class');
        expect(classes, `Element should have class ${className}`).toContain(className);
    }


    /**
     * Asserts that the element does **not** have the specified CSS class.
     * @param {Locator} locator - Playwright locator
     * @param {string} className - CSS class name that should be absent
     */
    static async assertNotHasClass(locator: Locator, className: string): Promise<void> {
        const classes = await locator.getAttribute('class');
        expect(classes, `Element should not have class ${className}`).not.toContain(className);
    }

    /**
     * Asserts that every element matching the locator is hidden.
     * @param {Locator} locator - Playwright locator
     */
    static async assertAllHidden(locator: Locator): Promise<void> {
        const count = await locator.count();
        for (let i = 0; i < count; i++) {
            await expect(locator.nth(i)).toBeHidden();
        }
    }

    /** Asserts that the element is enabled. */
    static async assertEnabled(locator: Locator): Promise<void> {
        await expect(locator).toBeEnabled();
    }

    /** Asserts that the element is disabled. */
    static async assertDisabled(locator: Locator): Promise<void> {
        await expect(locator).toBeDisabled();
    }

    /** Asserts that the checkbox/radio element is checked. */
    static async assertChecked(locator: Locator): Promise<void> {
        await expect(locator).toBeChecked();
    }

    /** Asserts that the checkbox/radio element is **not** checked. */
    static async assertNotChecked(locator: Locator): Promise<void> {
        await expect(locator).not.toBeChecked();
    }

    /**
     * Asserts that the element's text content contains all of the specified strings.
     * @param {Locator} locator - Playwright locator
     * @param {string[]} expectedStrings - Strings that must all appear in the text
     */
    static async assertContainsAll(locator: Locator, expectedStrings: string[]): Promise<void> {
        const text = await locator.textContent();
        expectedStrings.forEach((str) => {
            expect(text, `Text should contain "${str}"`).toContain(str);
        });
    }

    /**
     * Asserts that the element count is strictly greater than `minCount`.
     * @param {Locator} locator - Playwright locator
     * @param {number} minCount - Minimum count (exclusive)
     */
    static async assertElementCountGreaterThan(locator: Locator, minCount: number): Promise<void> {
        const count = await locator.count();
        expect(count, `Expected more than ${minCount} elements, found ${count}`).toBeGreaterThan(
            minCount,
        );
    }

    /**
     * Asserts that the element count is strictly less than `maxCount`.
     * @param {Locator} locator - Playwright locator
     * @param {number} maxCount - Maximum count (exclusive)
     */
    static async assertElementCountLessThan(locator: Locator, maxCount: number): Promise<void> {
        const count = await locator.count();
        expect(count, `Expected less than ${maxCount} elements, found ${count}`).toBeLessThan(
            maxCount,
        );
    }
}
