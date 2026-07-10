/**
 * @fileoverview Custom test annotation system for tagging tests with authors, categories, and descriptions.
 *
 * Registry-based: stores metadata per test title and (via {@link withAnnotation})
 * pushes it into Playwright's native `testInfo.annotations` for HTML/Allure reports.
 *
 * @module annotations/frameworkAnnotation
 */
import { CategoryType } from '../enums/categoryType';
import type { TestInfo } from '@playwright/test';

export interface FrameworkAnnotationData {
    authors: string[];
    categories: CategoryType[];
    description?: string;
}

const annotationRegistry = new Map<string, FrameworkAnnotationData>();

/** Registers annotation data for a test by its title (callable outside a test body). */
export function annotate(testTitle: string, data: FrameworkAnnotationData): void {
    annotationRegistry.set(testTitle, data);
}

/** Retrieves the annotation data for a test by its title. */
export function getAnnotation(testTitle: string): FrameworkAnnotationData | undefined {
    return annotationRegistry.get(testTitle);
}

/**
 * Registers annotation data and pushes it into Playwright's `testInfo.annotations`,
 * making authors/categories/description show up in HTML and Allure reports.
 */
export function withAnnotation(testInfo: TestInfo, data: FrameworkAnnotationData): void {
    annotationRegistry.set(testInfo.title, data);
    for (const author of data.authors) {
        testInfo.annotations.push({ type: 'author', description: author });
    }
    for (const category of data.categories) {
        testInfo.annotations.push({ type: 'category', description: category });
    }
    if (data.description) {
        testInfo.annotations.push({ type: 'description', description: data.description });
    }
}
