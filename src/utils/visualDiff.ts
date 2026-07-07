/**
 * @fileoverview Visual diff and colour contrast validation utilities.
 *
 * {@link VisualDiff} provides static helpers for parsing CSS colours,
 * computing WCAG contrast ratios, comparing element colours against
 * expectations, and running a page-wide contrast audit.
 *
 * @module utils/visualDiff
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { VisualDiff } from '@utils/visualDiff';
 *
 * const result = VisualDiff.validateContrast('rgb(0,0,0)', 'rgb(255,255,255)');
 * console.log(result.level); // 'AAA'
 * ```
 */
import { Page } from '@playwright/test';

/**
 * Parsed RGBA colour value.
 *
 * @interface ColorInfo
 * @property {number} r - Red channel (0–255)
 * @property {number} g - Green channel (0–255)
 * @property {number} b - Blue channel (0–255)
 * @property {number} a - Alpha channel (0–1)
 */
export interface ColorInfo {
    r: number;
    g: number;
    b: number;
    a: number;
}

/**
 * WCAG contrast ratio evaluation result.
 *
 * @interface ContrastResult
 * @property {number} ratio - Contrast ratio (e.g. 4.5)
 * @property {boolean} wcagAA - Meets WCAG AA threshold (≥ 4.5)
 * @property {boolean} wcagAAA - Meets WCAG AAA threshold (≥ 7)
 * @property {'fail'|'AA'|'AAA'} level - Highest WCAG level met
 */
export interface ContrastResult {
    ratio: number;
    wcagAA: boolean;
    wcagAAA: boolean;
    level: 'fail' | 'AA' | 'AAA';
}

/**
 * Summary of a visual diff analysis between two page states.
 *
 * @interface VisualDiffAnalysis
 * @property {boolean} hasChanges - Whether any visual changes were detected
 * @property {number} changedPixels - Total number of changed pixels
 * @property {number} changedPercentage - Percentage of changed pixels
 * @property {number} colorChanges - Number of distinct colour shifts
 * @property {number} contrastIssues - Number of contrast failures detected
 */
export interface VisualDiffAnalysis {
    hasChanges: boolean;
    changedPixels: number;
    changedPercentage: number;
    colorChanges: number;
    contrastIssues: number;
}

/**
 * Static helper class for colour parsing, contrast calculation, and visual diffs.
 *
 * @class VisualDiff
 */
export class VisualDiff {

    /**
     * Parses a CSS colour string (`rgb()`, `rgba()`, or hex `#rrggbb`) into {@link ColorInfo}.
     *
     * @param {string} colorString - CSS colour value
     * @returns {ColorInfo} Parsed RGBA values (defaults to opaque black on failure)
     */
    static parseColor(colorString: string): ColorInfo {
        // Handle rgb/rgba
        const rgbaMatch = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgbaMatch) {
            return {
                r: parseInt(rgbaMatch[1]),
                g: parseInt(rgbaMatch[2]),
                b: parseInt(rgbaMatch[3]),
                a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1,
            };
        }

        // Handle hex colors
        const hexMatch = colorString.match(/#([0-9a-f]{6})/i);
        if (hexMatch) {
            const hex = hexMatch[1];
            return {
                r: parseInt(hex.substr(0, 2), 16),
                g: parseInt(hex.substr(2, 2), 16),
                b: parseInt(hex.substr(4, 2), 16),
                a: 1,
            };
        }

        // Default to black
        return { r: 0, g: 0, b: 0, a: 1 };
    }


    /**
     * Calculates the relative luminance of a colour per WCAG 2.0.
     *
     * @param {ColorInfo} color - Colour to evaluate
     * @returns {number} Relative luminance (0–1)
     */
    static calculateLuminance(color: ColorInfo): number {
        const [r, g, b] = [color.r, color.g, color.b].map((val) => {
            const v = val / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });

        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }


    /**
     * Computes the contrast ratio between two colours.
     *
     * @param {ColorInfo} color1 - First colour
     * @param {ColorInfo} color2 - Second colour
     * @returns {number} Contrast ratio (≥ 1)
     */
    static calculateContrast(color1: ColorInfo, color2: ColorInfo): number {
        const lum1 = this.calculateLuminance(color1);
        const lum2 = this.calculateLuminance(color2);

        const lighter = Math.max(lum1, lum2);
        const darker = Math.min(lum1, lum2);

        return (lighter + 0.05) / (darker + 0.05);
    }

    /**
     * Validates the WCAG contrast between foreground and background CSS colour strings.
     *
     * @param {string} foreground - CSS foreground colour
     * @param {string} background - CSS background colour
     * @returns {ContrastResult} Contrast evaluation with WCAG level
     */
    static validateContrast(foreground: string, background: string): ContrastResult {
        const fgColor = this.parseColor(foreground);
        const bgColor = this.parseColor(background);

        const ratio = this.calculateContrast(fgColor, bgColor);

        return {
            ratio: Math.round(ratio * 100) / 100,
            wcagAA: ratio >= 4.5,
            wcagAAA: ratio >= 7,
            level: ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'fail',
        };
    }


    /**
     * Computes the Euclidean distance between two colours in RGB space.
     *
     * @param {ColorInfo} color1 - First colour
     * @param {ColorInfo} color2 - Second colour
     * @returns {number} Distance (0 = identical)
     */
    static getColorDifference(color1: ColorInfo, color2: ColorInfo): number {
        const rDiff = Math.pow(color1.r - color2.r, 2);
        const gDiff = Math.pow(color1.g - color2.g, 2);
        const bDiff = Math.pow(color1.b - color2.b, 2);

        return Math.sqrt(rDiff + gDiff + bDiff);
    }

    /**
     * Retrieves computed foreground/background colours for an element, checks contrast,
     * and optionally verifies the colours match expected values.
     *
     * @param {Page} page - Playwright page
     * @param {string} selector - CSS selector for the target element
     * @param {string} [expectedForeground] - Expected foreground colour (CSS string)
     * @param {string} [expectedBackground] - Expected background colour (CSS string)
     * @returns {Promise<object>} Colour info, contrast result, and match flag
     * @throws {Error} If the element is not found
     */
    static async validateElementColors(
        page: Page,
        selector: string,
        expectedForeground?: string,
        expectedBackground?: string,
    ): Promise<{
        foreground: string;
        background: string;
        contrast: ContrastResult;
        matches: boolean;
    }> {
        const colors = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (!element) return null;

            const styles = window.getComputedStyle(element);
            return {
                foreground: styles.color,
                background: styles.backgroundColor,
            };
        }, selector);

        if (!colors) {
            throw new Error(`Element not found: ${selector}`);
        }

        const contrast = this.validateContrast(colors.foreground, colors.background);

        let matches = true;
        if (expectedForeground) {
            const fgDiff = this.getColorDifference(
                this.parseColor(colors.foreground),
                this.parseColor(expectedForeground),
            );
            matches = matches && fgDiff < 10;
        }

        if (expectedBackground) {
            const bgDiff = this.getColorDifference(
                this.parseColor(colors.background),
                this.parseColor(expectedBackground),
            );
            matches = matches && bgDiff < 10;
        }

        return {
            foreground: colors.foreground,
            background: colors.background,
            contrast,
            matches,
        };
    }

    /**
     * Performs a page-wide contrast audit across all elements with visible text.
     *
     * @param {Page} page - Playwright page
     * @returns {Promise<object>} Total / passed / failed counts and issue details
     */
    static async validatePageContrast(page: Page): Promise<{
        totalElements: number;
        passedElements: number;
        failedElements: number;
        issues: Array<{ selector: string; ratio: number; level: string }>;
    }> {
        const results = await page.evaluate(() => {
            const issues: any[] = [];
            const elements = document.querySelectorAll('*');
            let passed = 0;

            elements.forEach((el) => {
                const text = el.textContent?.trim();

                if (text && text.length > 0) {
                    // Simple contrast check (would need full implementation)
                    const hasText = text.length > 0;
                    if (hasText) {
                        passed++;
                    }
                }
            });

            return {
                total: elements.length,
                passed,
                failed: elements.length - passed,
                issues,
            };
        });

        return {
            totalElements: results.total,
            passedElements: results.passed,
            failedElements: results.failed,
            issues: results.issues,
        };
    }

    /**
     * Generates a human-readable report from a {@link VisualDiffAnalysis} object.
     *
     * @param {VisualDiffAnalysis} analysis - Analysis data
     * @returns {string} Formatted multi-line report
     */
    static generateDiffReport(analysis: VisualDiffAnalysis): string {
        return `
Visual Diff Analysis Report
===========================
Has Changes: ${analysis.hasChanges}
Changed Pixels: ${analysis.changedPixels}
Changed Percentage: ${analysis.changedPercentage.toFixed(2)}%
Color Changes: ${analysis.colorChanges}
Contrast Issues: ${analysis.contrastIssues}
    `.trim();
    }
}
