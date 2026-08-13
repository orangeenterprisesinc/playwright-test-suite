/**
 * @fileoverview Abstract base Page Object class for the Playwright POM framework.
 *
 * Keeps only the standard navigation entry point (tied to the page object's
 * own `pageUrl`). Everything else — clicking, typing, getters, assertions —
 * has a native `Locator`/`expect` equivalent, so page objects call those
 * directly instead of going through a pass-through wrapper here.
 */
import { BrowserContext, Page } from '@playwright/test';
import { Logger } from '../utils/logger';

/**
 * Abstract base page providing the navigation entry point plus a couple of
 * genuinely non-trivial helpers. Extend this class for every page in the
 * application.
 *
 * @abstract
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

    constructor(page: Page, context?: BrowserContext) {
        this.page = page;
        this.context = context;
        this.logger = new Logger(this.constructor.name);
        this.baseUrl = process.env.BASE_URL || '';
    }

    /** Navigates to this page's own `pageUrl`. */
    async navigate(): Promise<void> {
        this.logger.info(`Navigating to: ${this.pageUrl}`);
        await this.page.goto(this.pageUrl, { waitUntil: 'domcontentloaded' });
    }
}
