/**
 * @fileoverview Custom Playwright assertion helpers for common element checks.
 * @module utils/customAssertions
 */
import { expect, Locator } from '@playwright/test';

export class CustomAssertions {
    static async assertElementCount(locator: Locator, expectedCount: number, message?: string): Promise<void> {
        const count = await locator.count();
        expect(count, message || `Expected ${expectedCount} elements, found ${count}`).toBe(expectedCount);
    }

    static async assertTextInOrder(locator: Locator, expectedTexts: string[]): Promise<void> {
        expect(await locator.allTextContents()).toEqual(expectedTexts);
    }

    static async assertAllVisible(locator: Locator): Promise<void> {
        const count = await locator.count();
        for (let i = 0; i < count; i++) await expect(locator.nth(i)).toBeVisible();
    }

    static async assertNoneEmpty(locator: Locator): Promise<void> {
        const texts = await locator.allTextContents();
        texts.forEach((text, index) => expect(text.trim(), `Element ${index} has empty text`).not.toBe(''));
    }

    static async assertAttributeValue(locator: Locator, attribute: string, expectedValue: string): Promise<void> {
        const value = await locator.getAttribute(attribute);
        expect(value, `Attribute ${attribute} should be ${expectedValue}`).toBe(expectedValue);
    }

    static async assertHasClass(locator: Locator, className: string): Promise<void> {
        const classes = await locator.getAttribute('class');
        expect(classes, `Element should have class ${className}`).toContain(className);
    }

    static async assertNotHasClass(locator: Locator, className: string): Promise<void> {
        const classes = await locator.getAttribute('class');
        expect(classes, `Element should not have class ${className}`).not.toContain(className);
    }

    static async assertAllHidden(locator: Locator): Promise<void> {
        const count = await locator.count();
        for (let i = 0; i < count; i++) await expect(locator.nth(i)).toBeHidden();
    }

    static async assertEnabled(locator: Locator): Promise<void> {
        await expect(locator).toBeEnabled();
    }

    static async assertDisabled(locator: Locator): Promise<void> {
        await expect(locator).toBeDisabled();
    }

    static async assertChecked(locator: Locator): Promise<void> {
        await expect(locator).toBeChecked();
    }

    static async assertNotChecked(locator: Locator): Promise<void> {
        await expect(locator).not.toBeChecked();
    }

    static async assertContainsAll(locator: Locator, expectedStrings: string[]): Promise<void> {
        const text = await locator.textContent();
        expectedStrings.forEach((str) => expect(text, `Text should contain "${str}"`).toContain(str));
    }

    static async assertElementCountGreaterThan(locator: Locator, minCount: number): Promise<void> {
        const count = await locator.count();
        expect(count, `Expected more than ${minCount} elements, found ${count}`).toBeGreaterThan(minCount);
    }

    static async assertElementCountLessThan(locator: Locator, maxCount: number): Promise<void> {
        const count = await locator.count();
        expect(count, `Expected less than ${maxCount} elements, found ${count}`).toBeLessThan(maxCount);
    }
}
