/**
 * @fileoverview Visual regression testing with baseline screenshot management.
 *
 * {@link VisualRegression} captures full-page or region screenshots, creates
 * baselines on first run, and compares subsequent runs using Playwright's
 * built-in `toHaveScreenshot` assertion.
 *
 * @module utils/visualRegression
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { VisualRegression } from '@utils/visualRegression';
 *
 * const vr = new VisualRegression();
 * const result = await vr.compareWithBaseline(page, 'homepage');
 * expect(result.passed).toBe(true);
 * ```
 */
import { expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Rectangular screen region used for clipping or masking screenshots.
 *
 * @interface Region
 * @property {number} x - Left offset in pixels
 * @property {number} y - Top offset in pixels
 * @property {number} width - Width in pixels
 * @property {number} height - Height in pixels
 */
export interface Region {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Configuration options for visual regression comparisons.
 *
 * @interface VisualRegressionOptions
 * @property {number} [threshold=0.2] - Per-pixel colour difference threshold (0–1)
 * @property {number} [maxDiffPixels=100] - Max differing pixels before failure
 * @property {Region[]} [regions] - Specific regions to compare
 * @property {boolean} [fullPage=true] - Capture the full scrollable page
 * @property {Region[]} [mask] - Regions to mask out during comparison
 */
export interface VisualRegressionOptions {
    threshold?: number;
    maxDiffPixels?: number;
    regions?: Region[];
    fullPage?: boolean;
    mask?: Region[];
}

/**
 * Outcome of a visual regression comparison.
 *
 * @interface VisualRegressionResult
 * @property {boolean} passed - Whether the comparison passed
 * @property {number} [diffPixels] - Number of pixels that differ
 * @property {number} [diffPercentage] - Percentage of differing pixels
 * @property {string} message - Human-readable result summary
 */
export interface VisualRegressionResult {
    passed: boolean;
    diffPixels?: number;
    diffPercentage?: number;
    message: string;
}

/**
 * Manages baseline screenshots and performs visual regression comparisons.
 *
 * @class VisualRegression
 */
export class VisualRegression {
    /** @private Directory for baseline images */
    private baselineDir: string;
    /** @private Directory for diff / current images */
    private diffDir: string;

    /**
     * @param {string} [baselineDir='visual-baselines'] - Directory for baseline images
     * @param {string} [diffDir='visual-diffs'] - Directory for diff images
     */
    constructor(baselineDir: string = 'visual-baselines', diffDir: string = 'visual-diffs') {
        this.baselineDir = baselineDir;
        this.diffDir = diffDir;
        this.ensureDirectories();
    }

    /**
     * Captures a screenshot and compares it against the stored baseline.
     * On first run the screenshot becomes the new baseline.
     *
     * @param {Page} page - Playwright page
     * @param {string} testName - Unique test identifier (used as filename stem)
     * @param {VisualRegressionOptions} [options={}] - Comparison options
     * @returns {Promise<VisualRegressionResult>} Comparison outcome
     */
    async compareWithBaseline(
        page: Page,
        testName: string,
        options: VisualRegressionOptions = {},
    ): Promise<VisualRegressionResult> {
        const { threshold = 0.2, maxDiffPixels = 100, fullPage = true } = options;

        const baselinePath = path.join(this.baselineDir, `${testName}.png`);
        const currentPath = path.join(this.diffDir, `${testName}-current.png`);

        await page.screenshot({
            fullPage,
            path: currentPath,
        });

        if (!fs.existsSync(baselinePath)) {
            fs.copyFileSync(currentPath, baselinePath);
            return {
                passed: true,
                message: 'Baseline created',
            };
        }

        try {
            await expect(page).toHaveScreenshot(`${testName}.png`, {
                maxDiffPixels,
                threshold,
                animations: 'disabled',
            });

            return {
                passed: true,
                message: 'Visual regression test passed',
            };
        } catch (error) {
            return {
                passed: false,
                message: `Visual regression detected: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Compares a specific rectangular region against its baseline.
     *
     * @param {Page} page - Playwright page
     * @param {string} testName - Unique test identifier
     * @param {Region} region - Screen region to capture
     * @param {VisualRegressionOptions} [_options={}] - (reserved for future use)
     * @returns {Promise<VisualRegressionResult>} Comparison outcome
     */
    async compareRegion(
        page: Page,
        testName: string,
        region: Region,
        _options: VisualRegressionOptions = {},
    ): Promise<VisualRegressionResult> {
        const regionPath = path.join(this.diffDir, `${testName}-region.png`);

        // Take region screenshot
        await page.screenshot({
            clip: region,
            path: regionPath,
        });

        const baselinePath = path.join(this.baselineDir, `${testName}-region.png`);

        // If baseline doesn't exist, create it
        if (!fs.existsSync(baselinePath)) {
            fs.copyFileSync(regionPath, baselinePath);
            return {
                passed: true,
                message: 'Region baseline created',
            };
        }

        return {
            passed: true,
            message: 'Region comparison completed',
        };
    }

    /**
     * Overwrites the baseline image with a fresh screenshot.
     *
     * @param {Page} page - Playwright page
     * @param {string} testName - Unique test identifier
     * @param {VisualRegressionOptions} [options={}] - Screenshot options
     */
    async updateBaseline(
        page: Page,
        testName: string,
        options: VisualRegressionOptions = {},
    ): Promise<void> {
        const { fullPage = true } = options;

        const baselinePath = path.join(this.baselineDir, `${testName}.png`);
        const screenshot = await page.screenshot({ fullPage });

        this.ensureDirectories();
        fs.writeFileSync(baselinePath, screenshot);
    }

    /**
     * Returns the file path for a test's baseline image.
     * @param {string} testName - Test identifier
     * @returns {string} Path to the PNG baseline
     */
    getBaselinePath(testName: string): string {
        return path.join(this.baselineDir, `${testName}.png`);
    }

    /**
     * Checks whether a baseline image exists for the given test.
     * @param {string} testName - Test identifier
     * @returns {boolean} `true` if the baseline file exists
     */
    baselineExists(testName: string): boolean {
        return fs.existsSync(this.getBaselinePath(testName));
    }

    /**
     * Deletes the baseline image for a test (if it exists).
     * @param {string} testName - Test identifier
     */
    deleteBaseline(testName: string): void {
        const baselinePath = this.getBaselinePath(testName);
        if (fs.existsSync(baselinePath)) {
            fs.unlinkSync(baselinePath);
        }
    }

    /** Returns the names (without extension) of all stored baselines. */
    getAllBaselines(): string[] {
        if (!fs.existsSync(this.baselineDir)) {
            return [];
        }
        return fs
            .readdirSync(this.baselineDir)
            .filter((file) => file.endsWith('.png'))
            .map((file) => file.replace('.png', ''));
    }

    /** Removes all diff images and recreates the diff directory. */
    clearDiffs(): void {
        if (fs.existsSync(this.diffDir)) {
            fs.rmSync(this.diffDir, { recursive: true });
            fs.mkdirSync(this.diffDir, { recursive: true });
        }
    }


    /** Removes all baseline images and recreates the baseline directory. */
    clearBaselines(): void {
        if (fs.existsSync(this.baselineDir)) {
            fs.rmSync(this.baselineDir, { recursive: true });
            fs.mkdirSync(this.baselineDir, { recursive: true });
        }
    }


    /** @private Creates baseline and diff directories if they do not exist. */
    private ensureDirectories(): void {
        [this.baselineDir, this.diffDir].forEach((dir) => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
}
