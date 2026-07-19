/**
 * @fileoverview Abstract base Page Object class for the Playwright POM framework.
 *
 * Keeps only what genuinely isn't a one-line call to a native Playwright API:
 * the standard navigation entry point (tied to the page object's own
 * `pageUrl`), a custom polling wait, and the repo's screenshot path
 * convention. Everything else — clicking, typing, getters, assertions — has
 * a native `Locator`/`expect` equivalent, so page objects call those
 * directly instead of going through a pass-through wrapper here.
 *
 * @module pages/BasePage
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { BasePage } from '@pages/BasePage';
 *
 * class LoginPage extends BasePage {
 *   readonly pageUrl = '/login';
 *   readonly pageTitle = 'Login';
 *   readonly usernameInput = this.page.locator('#username');
 *
 *   async login(user: string, pass: string) {
 *     await this.usernameInput.fill(user);
 *   }
 * }
 * ```
 */
import { BrowserContext, Locator, Page } from '@playwright/test';
import { Logger } from '../utils/logger';

/**
 * Abstract base page providing the navigation entry point plus a couple of
 * genuinely non-trivial helpers. Extend this class for every page in the
 * application.
 *
 * @abstract
 * @class BasePage
 */
export abstract class BasePage {
    /** The relative URL path for this page (e.g., '/home', '/login'). */
    abstract readonly pageUrl: string;
    /** Expected page title for assertion, set by child classes. */
    abstract readonly pageTitle: string | RegExp;
    /** Playwright Page instance used for all page interactions. */
    protected readonly page: Page;
    /** Optional browser context for managing cookies, storage, and multiple tabs. */
    protected readonly context: BrowserContext | undefined;
    /** Logger instance named after the concrete page class. */
    protected readonly logger: Logger;
    /** Base URL for the application, from the `BASE_URL` environment variable. */
    protected readonly baseUrl: string;

    /**
     * @param {Page} page - Playwright Page instance
     * @param {BrowserContext} [context] - Optional browser context
     */
    constructor(page: Page, context?: BrowserContext) {
        this.page = page;
        this.context = context;
        this.logger = new Logger(this.constructor.name);
        this.baseUrl = process.env.BASE_URL || '';
    }

    /**
     * Navigates to this page's own `pageUrl`.
     *
     * @example
     * const loginPage = new LoginPage(page);
     * await loginPage.navigate();
     */
    async navigate(): Promise<void> {
        this.logger.info(`Navigating to: ${this.pageUrl}`);
        await this.page.goto(this.pageUrl, { waitUntil: 'domcontentloaded' });
    }

    /**
     * Navigates to an arbitrary URL — useful for pages not represented by a
     * page object of their own.
     *
     * @example
     * await basePage.navigateTo('https://example.com/special-page');
     */
    async navigateTo(url: string): Promise<void> {
        this.logger.info(`Navigating to: ${url}`);
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    }

    /**
     * Polls a custom condition until it returns true or times out. No native
     * Playwright wait covers an arbitrary async predicate like this.
     *
     * @throws {Error} If condition is not met within timeout
     *
     * @example
     * await basePage.waitForCondition(
     *   async () => (await page.locator('.items').count()) > 5,
     *   { timeout: 10000, interval: 500 }
     * );
     */
    async waitForCondition(
        condition: () => Promise<boolean>,
        options?: { timeout?: number; interval?: number },
    ): Promise<void> {
        const { timeout = 30000, interval = 100 } = options || {};
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            if (await condition()) {
                return;
            }
            await this.page.waitForTimeout(interval);
        }

        throw new Error(`Condition not met within ${timeout}ms`);
    }

    /**
     * Captures a full-page screenshot under this repo's
     * `test-results/screenshots/<name>.png` convention.
     *
     * @example
     * await basePage.takeScreenshot('homepage-loaded');
     */
    async takeScreenshot(name: string): Promise<Buffer> {
        this.logger.info(`Taking screenshot: ${name}`);
        return await this.page.screenshot({
            path: `test-results/screenshots/${name}.png`,
            fullPage: true,
        });
    }

    /**
     * Captures a screenshot of a single element under the same
     * `test-results/screenshots/<name>.png` convention as {@link takeScreenshot}.
     *
     * @example
     * await basePage.takeElementScreenshot(chart, 'chart-screenshot');
     */
    async takeElementScreenshot(locator: Locator, name: string): Promise<Buffer> {
        return await locator.screenshot({
            path: `test-results/screenshots/${name}.png`,
        });
    }
}
