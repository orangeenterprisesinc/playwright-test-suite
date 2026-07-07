/**
 * @fileoverview Test category type definitions for classifying and filtering tests.
 *
 * Provides a standardized enumeration of test categories used for tagging,
 * filtering, and organizing test suites across the framework.
 *
 * @module enums/categoryType
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { CategoryType, getAllCategories } from '../enums/categoryType';
 *
 * // Use in test annotations
 * annotate({ category: CategoryType.SMOKE });
 *
 * // Get all available categories
 * const categories = getAllCategories(); // ['HIGH_LEVEL', 'SMOKE', ...]
 * ```
 */

/**
 * Enumeration of test category types used for test classification and filtering.
 *
 * Categories help organize tests into logical groups that can be selectively
 * executed based on CI/CD pipeline stage or testing phase.
 *
 * @enum {string}
 *
 * @example
 * ```typescript
 * // Tag a test with a category
 * test('login flow', { tag: CategoryType.SMOKE }, async ({ page }) => {
 *   // ...
 * });
 * ```
 */
export enum CategoryType {
    /** High-level critical path tests */
    HIGH_LEVEL = 'HIGH_LEVEL',
    /** Quick validation smoke tests */
    SMOKE = 'SMOKE',
    /** Standard regression test suite */
    REGRESSION = 'REGRESSION',
    /** Quick sanity check tests */
    SANITY = 'SANITY',
    /** Full regression covering all features */
    FULL_REGRESSION = 'FULL_REGRESSION',
    /** API-only tests (no UI interaction) */
    API = 'API',
    /** UI-focused end-to-end tests */
    UI = 'UI',
    /** Performance and load testing */
    PERFORMANCE = 'PERFORMANCE',
    /** Accessibility (a11y) compliance tests */
    ACCESSIBILITY = 'ACCESSIBILITY',
    /** Visual regression and screenshot comparison tests */
    VISUAL = 'VISUAL',
}

/**
 * Returns all available category type values as an array of strings.
 *
 * Useful for dynamic filtering, validation, or displaying available categories in reports.
 *
 * @returns {string[]} Array of all category type string values
 *
 * @example
 * ```typescript
 * const categories = getAllCategories();
 * // ['HIGH_LEVEL', 'SMOKE', 'REGRESSION', 'SANITY', 'FULL_REGRESSION', 'API', 'UI', 'PERFORMANCE', 'ACCESSIBILITY', 'VISUAL']
 *
 * // Validate a user-provided category
 * if (getAllCategories().includes(userInput)) {
 *   console.log('Valid category');
 * }
 * ```
 */
export function getAllCategories(): string[] {
    return Object.values(CategoryType);
}
