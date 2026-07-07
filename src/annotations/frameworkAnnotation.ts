/**
 * @fileoverview Custom test annotation system for tagging tests with authors, categories, and descriptions.
 *
 * Provides a registry-based annotation mechanism that stores metadata per test title and
 * optionally pushes it into Playwright's native `testInfo.annotations` array for reporting.
 *
 * @module annotations/frameworkAnnotation
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { annotate, withAnnotation, CategoryType } from '../annotations';
 *
 * // Static annotation (outside test)
 * annotate('Login Test', {
 *   authors: ['John'],
 *   categories: [CategoryType.SMOKE],
 *   description: 'Verifies login flow',
 * });
 *
 * // Inside test with TestInfo
 * test('Login Test', async ({ page }, testInfo) => {
 *   withAnnotation(testInfo, {
 *     authors: ['John'],
 *     categories: [CategoryType.SMOKE],
 *   });
 * });
 * ```
 */
import {CategoryType} from '../enums/categoryType';
import type {TestInfo} from '@playwright/test';

/**
 * Annotation metadata attached to a test case.
 *
 * @interface FrameworkAnnotationData
 * @property {string[]} authors - List of test authors or owners
 * @property {CategoryType[]} categories - Test categories for filtering/reporting
 * @property {string} [description] - Optional human-readable description of the test
 */
export interface FrameworkAnnotationData {
    authors: string[];
    categories: CategoryType[];
    description?: string;
}

/** @private In-memory registry mapping test titles to their annotation data. */
const annotationRegistry = new Map<string, FrameworkAnnotationData>();

/**
 * Registers annotation data for a test by its title.
 *
 * Can be called statically before test execution (e.g., at module level).
 *
 * @param {string} testTitle - The test title to annotate
 * @param {FrameworkAnnotationData} data - Annotation metadata
 *
 * @example
 * ```typescript
 * annotate('Search Products', {
 *   authors: ['Alice', 'Bob'],
 *   categories: [CategoryType.REGRESSION],
 * });
 * ```
 */
export function annotate(testTitle: string, data: FrameworkAnnotationData): void {
    annotationRegistry.set(testTitle, data);
}

/**
 * Retrieves the annotation data for a test by its title.
 *
 * @param {string} testTitle - The test title to look up
 * @returns {FrameworkAnnotationData | undefined} The annotation data, or `undefined` if not registered
 */
export function getAnnotation(testTitle: string): FrameworkAnnotationData | undefined {
    return annotationRegistry.get(testTitle);
}

/**
 * Registers annotation data and pushes it into Playwright's `testInfo.annotations`.
 *
 * This integrates with Playwright's native annotation system, making authors,
 * categories, and descriptions appear in HTML reports and Allure reports.
 *
 * @param {TestInfo} testInfo - Playwright's test info object (from test callback)
 * @param {FrameworkAnnotationData} data - Annotation metadata to attach
 *
 * @example
 * ```typescript
 * test('Checkout Flow', async ({ page }, testInfo) => {
 *   withAnnotation(testInfo, {
 *     authors: ['Jane'],
 *     categories: [CategoryType.SMOKE, CategoryType.UI],
 *     description: 'End-to-end checkout process',
 *   });
 *   // ... test steps
 * });
 * ```
 */
export function withAnnotation(testInfo: TestInfo, data: FrameworkAnnotationData): void {
    annotationRegistry.set(testInfo.title, data);
    for (const author of data.authors) {
        testInfo.annotations.push({type: 'author', description: author});
    }
    for (const category of data.categories) {
        testInfo.annotations.push({type: 'category', description: category});
    }
    if (data.description) {
        testInfo.annotations.push({type: 'description', description: data.description});
    }
}

/**
 * Returns a copy of the entire annotation registry.
 *
 * Useful for reporting or debugging all registered test annotations.
 *
 * @returns {Map<string, FrameworkAnnotationData>} Shallow copy of the annotation registry
 */
export function getAllAnnotations(): Map<string, FrameworkAnnotationData> {
    return new Map(annotationRegistry);
}