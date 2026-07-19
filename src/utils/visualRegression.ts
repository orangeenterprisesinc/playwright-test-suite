/**
 * @fileoverview Visual regression helper wrapping Playwright's built-in
 * screenshot comparison (`expect(...).toHaveScreenshot()`), so callers don't
 * need to import both `expect` and the `ScreenshotOptions` mapping directly.
 *
 * @module utils/visualRegression
 */
import { expect, type Locator, type Page } from '@playwright/test';
import type { ScreenshotOptions } from '../types';

/**
 * Compares `target` (a full page or a single element) against its stored
 * baseline snapshot named `<name>.png`, failing the test on mismatch.
 *
 * @example
 * ```typescript
 * await compareScreenshots(page, 'login-page-baseline');
 * ```
 */
export async function compareScreenshots(target: Page | Locator, name: string, options?: ScreenshotOptions): Promise<void> {
    await expect(target).toHaveScreenshot(`${name}.png`, {
        fullPage: options?.fullPage,
        clip: options?.clip,
        mask: options?.mask,
        maxDiffPixels: options?.maxDiffPixels,
        threshold: options?.threshold,
    });
}
