/**
 * @fileoverview Abstract base Page Object class for the Playwright POM framework.
 *
 * {@link BasePage} encapsulates all common browser interactions — navigation,
 * waits, element actions, getters, state checks, assertions, and screenshots —
 * so that concrete page objects only need to declare `pageUrl`, `pageTitle`, and
 * page-specific locators/methods.
 *
 * @module pages/BasePage
 * @author Vicky
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
 *     await this.type(this.usernameInput, user);
 *   }
 * }
 * ```
 */
import {BrowserContext, expect, Locator, Page} from '@playwright/test';
import {Logger} from '../utils/logger';

/**
 * Abstract base page providing shared navigation, interaction, assertion, and
 * debugging helpers. Extend this class for every page in the application.
 *
 * @abstract
 * @class BasePage
 */
export abstract class BasePage {
    /**
     * Page URL path (must be implemented by child classes)
     * @abstract
     * @readonly
     * @type {string}
     * @description The relative URL path for this page (e.g., '/home', '/login').
     */
    abstract readonly pageUrl: string;
    /**
     * Expected page title (must be implemented by child classes)
     * @abstract
     * @readonly
     * @type {string | RegExp}
     * @description The expected title for assertion, can be string or RegExp.
     */
    abstract readonly pageTitle: string | RegExp;
    /**
     * Playwright Page instance
     * @protected
     * @readonly
     * @type {Page}
     * @description The Playwright Page object used for all page interactions.
     */
    protected readonly page: Page;
    /**
     * Browser context for multi-tab/cookie management
     * @protected
     * @readonly
     * @type {BrowserContext | undefined}
     * @description Optional browser context for managing cookies, storage, and multiple tabs.
     */
    protected readonly context: BrowserContext | undefined;
    /**
     * Logger instance for this page
     * @protected
     * @readonly
     * @type {Logger}
     * @description Used to log page actions and debug information.
     */
    protected readonly logger: Logger;
    /**
     * Base URL for the application
     * @protected
     * @readonly
     * @type {string}
     * @description Retrieved from BASE_URL environment variable.
     */
    protected readonly baseUrl: string;

    /**
     * Creates an instance of BasePage
     *
     * @constructor
     * @param {Page} page - Playwright Page instance
     * @param {BrowserContext} [context] - Optional browser context
     *
     * @description
     * Initializes the base page with the Playwright page instance, optional context,
     * a logger named after the concrete class, and the base URL from environment.
     *
     * @example
     * const homePage = new HomePage(page);
     * const loginPage = new LoginPage(page, context);
     */
    constructor(page: Page, context?: BrowserContext) {
        this.page = page;
        this.context = context;
        this.logger = new Logger(this.constructor.name);
        this.baseUrl = process.env.BASE_URL || '';
    }

    // ============ Navigation Methods ============

    /**
     * Navigate to the page URL
     *
     * @async
     * @returns {Promise<void>}
     *
     * @description
     * Navigates to this page's URL (defined by pageUrl) and waits for page load.
     * Uses 'domcontentloaded' wait strategy for faster navigation.
     *
     * @example
     * const homePage = new HomePage(page);
     * await homePage.navigate();
     */
    async navigate(): Promise<void> {
        this.logger.info(`Navigating to: ${this.pageUrl}`);
        await this.page.goto(this.pageUrl, {waitUntil: 'domcontentloaded'});
        await this.waitForPageLoad();
    }

    /**
     * Navigate to a specific URL
     *
     * @async
     * @param {string} url - The URL to navigate to
     * @returns {Promise<void>}
     *
     * @description
     * Navigates to any URL, useful for navigating to pages not represented by a page object.
     *
     * @example
     * await basePage.navigateTo('https://example.com/special-page');
     */
    async navigateTo(url: string): Promise<void> {
        this.logger.info(`Navigating to: ${url}`);
        await this.page.goto(url, {waitUntil: 'domcontentloaded'});
    }

    /**
     * Reload the current page
     *
     * @async
     * @returns {Promise<void>}
     *
     * @description
     * Refreshes the current page and waits for DOM content to load.
     *
     * @example
     * await page.reload();
     */
    async reload(): Promise<void> {
        this.logger.info('Reloading page');
        await this.page.reload({waitUntil: 'domcontentloaded'});
    }

    /**
     * Go back in browser history
     *
     * @async
     * @returns {Promise<void>}
     *
     * @description
     * Navigates back in browser history, equivalent to clicking the back button.
     *
     * @example
     * await basePage.goBack();
     */
    async goBack(): Promise<void> {
        this.logger.info('Going back');
        await this.page.goBack({waitUntil: 'domcontentloaded'});
    }

    /**
     * Go forward in browser history
     *
     * @async
     * @returns {Promise<void>}
     *
     * @description
     * Navigates forward in browser history, equivalent to clicking the forward button.
     *
     * @example
     * await basePage.goForward();
     */
    async goForward(): Promise<void> {
        this.logger.info('Going forward');
        await this.page.goForward({waitUntil: 'domcontentloaded'});
    }

    // ============ Wait Methods ============

    /**
     * Wait for page to fully load
     *
     * @async
     * @returns {Promise<void>}
     *
     * @description
     * Waits for the DOM content to be loaded. Called automatically after navigation.
     *
     * @example
     * await basePage.waitForPageLoad();
     */
    async waitForPageLoad(): Promise<void> {
        await this.page.waitForLoadState('domcontentloaded');
        this.logger.debug('Page loaded');
    }

    /**
     * Wait for network to be idle
     *
     * @async
     * @returns {Promise<void>}
     *
     * @description
     * Waits until there are no more than 0-2 network connections for at least 500ms.
     * Useful after actions that trigger API calls.
     *
     * @example
     * await basePage.waitForNetworkIdle();
     */
    async waitForNetworkIdle(): Promise<void> {
        await this.page.waitForLoadState('networkidle');
        this.logger.debug('Network idle');
    }

    /**
     * Wait for element to be visible
     *
     * @async
     * @param {Locator} locator - The element locator to wait for
     * @param {number} [timeout] - Optional timeout in milliseconds
     * @returns {Promise<void>}
     *
     * @description
     * Waits until the element matching the locator becomes visible on the page.
     *
     * @example
     * await basePage.waitForElement(page.locator('.modal'));
     * await basePage.waitForElement(page.locator('.slow-load'), 10000);
     */
    async waitForElement(locator: Locator, timeout?: number): Promise<void> {
        await locator.waitFor({state: 'visible', timeout});
    }

    /**
     * Wait for element to be hidden
     *
     * @async
     * @param {Locator} locator - The element locator to wait for
     * @param {number} [timeout] - Optional timeout in milliseconds
     * @returns {Promise<void>}
     *
     * @description
     * Waits until the element matching the locator is no longer visible.
     *
     * @example
     * await basePage.waitForElementHidden(loadingSpinner);
     */
    async waitForElementHidden(locator: Locator, timeout?: number): Promise<void> {
        await locator.waitFor({state: 'hidden', timeout});
    }

    /**
     * Wait for URL to match pattern
     *
     * @async
     * @param {string | RegExp} urlPattern - URL or pattern to match
     * @returns {Promise<void>}
     *
     * @description
     * Waits until the page URL matches the specified pattern.
     *
     * @example
     * await basePage.waitForUrl('/dashboard');
     * await basePage.waitForUrl(new RegExp('.*\\/dashboard.*'));
     */
    async waitForUrl(urlPattern: string | RegExp): Promise<void> {
        await this.page.waitForURL(urlPattern);
    }

    /**
     * Wait for a custom condition to be met
     *
     * @async
     * @param {() => Promise<boolean>} condition - Async function returning boolean
     * @param {Object} [options] - Wait options
     * @param {number} [options.timeout=30000] - Maximum wait time in ms
     * @param {number} [options.interval=100] - Polling interval in ms
     * @returns {Promise<void>}
     * @throws {Error} If condition is not met within timeout
     *
     * @description
     * Polls a custom condition function until it returns true or times out.
     * Useful for complex wait scenarios not covered by built-in waits.
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
        const {timeout = 30000, interval = 100} = options || {};
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            if (await condition()) {
                return;
            }
            await this.page.waitForTimeout(interval);
        }

        throw new Error(`Condition not met within ${timeout}ms`);
    }

    // ============ Element Interaction Methods ============

    /**
     * Click on an element with auto-wait
     *
     * @async
     * @param {Locator} locator - Element to click
     * @param {Object} [options] - Click options
     * @param {boolean} [options.force] - Force click even if element is covered
     * @param {number} [options.timeout] - Maximum wait time in ms
     * @returns {Promise<void>}
     *
     * @description
     * Clicks the element after waiting for it to be actionable.
     * Playwright auto-waits for element to be visible and enabled.
     *
     * @example
     * await basePage.click(submitButton);
     * await basePage.click(overlappedElement, { force: true });
     */
    async click(locator: Locator, options?: { force?: boolean; timeout?: number }): Promise<void> {
        this.logger.debug(`Clicking element`);
        await locator.click(options);
    }

    /**
     * Double click on an element
     *
     * @async
     * @param {Locator} locator - Element to double click
     * @returns {Promise<void>}
     *
     * @description
     * Performs a double-click action on the element.
     * Useful for edit actions or text selection.
     *
     * @example
     * await basePage.doubleClick(tableCell);
     */
    async doubleClick(locator: Locator): Promise<void> {
        this.logger.debug('Double clicking element');
        await locator.dblclick();
    }

    /**
     * Right click (context menu) on an element
     *
     * @async
     * @param {Locator} locator - Element to right click
     * @returns {Promise<void>}
     *
     * @description
     * Performs a right-click to open context menu.
     *
     * @example
     * await basePage.rightClick(fileItem);
     */
    async rightClick(locator: Locator): Promise<void> {
        this.logger.debug('Right clicking element');
        await locator.click({button: 'right'});
    }

    /**
     * Type text into an input field
     *
     * @async
     * @param {Locator} locator - Input element
     * @param {string} text - Text to type
     * @param {Object} [options] - Type options
     * @param {number} [options.delay] - Delay between key presses in ms
     * @returns {Promise<void>}
     *
     * @description
     * Fills text into an input field. Uses fill() for speed.
     *
     * @example
     * await basePage.type(usernameInput, 'testuser');
     */
    async type(locator: Locator, text: string, options?: { delay?: number }): Promise<void> {
        this.logger.debug(`Typing: ${text.substring(0, 20)}...`);
        if (options?.delay) {
            await locator.pressSequentially(text, { delay: options.delay });
        } else {
            await locator.fill(text);
        }
    }

    /**
     * Clear input and type new text
     *
     * @async
     * @param {Locator} locator - Input element
     * @param {string} text - Text to type
     * @returns {Promise<void>}
     *
     * @description
     * Clears existing content and types new text.
     *
     * @example
     * await basePage.clearAndType(emailInput, 'new@email.com');
     */
    async clearAndType(locator: Locator, text: string): Promise<void> {
        await locator.clear();
        await locator.fill(text);
    }

    /**
     * Press a keyboard key
     *
     * @async
     * @param {string} key - Key to press (e.g., 'Enter', 'Tab', 'Escape')
     * @returns {Promise<void>}
     *
     * @description
     * Presses a keyboard key. Supports special keys like Enter, Tab, Escape, etc.
     *
     * @example
     * await basePage.pressKey('Enter');
     * await basePage.pressKey('Control+A');
     */
    async pressKey(key: string): Promise<void> {
        this.logger.debug(`Pressing key: ${key}`);
        await this.page.keyboard.press(key);
    }

    /**
     * Hover over an element
     *
     * @async
     * @param {Locator} locator - Element to hover over
     * @returns {Promise<void>}
     *
     * @description
     * Moves mouse to hover over the element, triggering hover states.
     *
     * @example
     * await basePage.hover(menuItem);
     */
    async hover(locator: Locator): Promise<void> {
        this.logger.debug('Hovering over element');
        await locator.hover();
    }

    /**
     * Select option from dropdown
     *
     * @async
     * @param {Locator} locator - Select element
     * @param {string | string[]} value - Value(s) to select
     * @returns {Promise<void>}
     *
     * @description
     * Selects options from a <select> element by value, label, or index.
     *
     * @example
     * await basePage.selectOption(countryDropdown, 'US');
     * await basePage.selectOption(multiSelect, ['option1', 'option2']);
     */
    async selectOption(locator: Locator, value: string | string[]): Promise<void> {
        this.logger.debug(`Selecting option: ${value}`);
        await locator.selectOption(value);
    }

    /**
     * Check a checkbox or radio button
     *
     * @async
     * @param {Locator} locator - Checkbox or radio element
     * @returns {Promise<void>}
     *
     * @description
     * Checks a checkbox if not already checked.
     *
     * @example
     * await basePage.check(agreeCheckbox);
     */
    async check(locator: Locator): Promise<void> {
        this.logger.debug('Checking checkbox');
        await locator.check();
    }

    /**
     * Uncheck a checkbox
     *
     * @async
     * @param {Locator} locator - Checkbox element
     * @returns {Promise<void>}
     *
     * @description
     * Unchecks a checkbox if currently checked.
     *
     * @example
     * await basePage.uncheck(subscribeCheckbox);
     */
    async uncheck(locator: Locator): Promise<void> {
        this.logger.debug('Unchecking checkbox');
        await locator.uncheck();
    }

    /**
     * Upload file(s) to an input
     *
     * @async
     * @param {Locator} locator - File input element
     * @param {string | string[]} filePath - Path(s) to file(s)
     * @returns {Promise<void>}
     *
     * @description
     * Sets files for a file input element.
     *
     * @example
     * await basePage.uploadFile(fileInput, './test-file.pdf');
     * await basePage.uploadFile(multiInput, ['./file1.pdf', './file2.pdf']);
     */
    async uploadFile(locator: Locator, filePath: string | string[]): Promise<void> {
        this.logger.debug(`Uploading file: ${filePath}`);
        await locator.setInputFiles(filePath);
    }

    /**
     * Drag element and drop onto target
     *
     * @async
     * @param {Locator} source - Element to drag
     * @param {Locator} target - Element to drop onto
     * @returns {Promise<void>}
     *
     * @description
     * Performs drag and drop action between two elements.
     *
     * @example
     * await basePage.dragAndDrop(draggableItem, dropZone);
     */
    async dragAndDrop(source: Locator, target: Locator): Promise<void> {
        this.logger.debug('Performing drag and drop');
        await source.dragTo(target);
    }

    // ============ Getter Methods ============

    /**
     * Get text content of an element
     *
     * @async
     * @param {Locator} locator - Element to get text from
     * @returns {Promise<string>} Trimmed text content
     *
     * @description
     * Returns the visible text content of an element, trimmed of whitespace.
     *
     * @example
     * const message = await basePage.getText(alertMessage);
     */
    async getText(locator: Locator): Promise<string> {
        const text = await locator.textContent();
        return text?.trim() || '';
    }

    /**
     * Get value of an input element
     *
     * @async
     * @param {Locator} locator - Input element
     * @returns {Promise<string>} Current input value
     *
     * @description
     * Returns the current value of an input, textarea, or select element.
     *
     * @example
     * const email = await basePage.getValue(emailInput);
     */
    async getValue(locator: Locator): Promise<string> {
        return await locator.inputValue();
    }

    /**
     * Get attribute value of an element
     *
     * @async
     * @param {Locator} locator - Element to query
     * @param {string} attribute - Attribute name
     * @returns {Promise<string | null>} Attribute value or null
     *
     * @description
     * Returns the value of the specified attribute.
     *
     * @example
     * const href = await basePage.getAttribute(link, 'href');
     * const disabled = await basePage.getAttribute(button, 'disabled');
     */
    async getAttribute(locator: Locator, attribute: string): Promise<string | null> {
        return await locator.getAttribute(attribute);
    }

    /**
     * Get count of matching elements
     *
     * @async
     * @param {Locator} locator - Locator matching multiple elements
     * @returns {Promise<number>} Number of matching elements
     *
     * @description
     * Returns the number of elements matching the locator.
     *
     * @example
     * const itemCount = await basePage.getCount(listItems);
     */
    async getCount(locator: Locator): Promise<number> {
        return await locator.count();
    }

    /**
     * Get all text contents of matching elements
     *
     * @async
     * @param {Locator} locator - Locator matching multiple elements
     * @returns {Promise<string[]>} Array of text contents
     *
     * @description
     * Returns text content of all matching elements.
     *
     * @example
     * const allItems = await basePage.getAllTexts(menuItems);
     */
    async getAllTexts(locator: Locator): Promise<string[]> {
        return await locator.allTextContents();
    }

    /**
     * Get current page URL
     *
     * @returns {string} Current URL
     *
     * @description
     * Returns the current page URL synchronously.
     *
     * @example
     * const url = basePage.getCurrentUrl();
     */
    getCurrentUrl(): string {
        return this.page.url();
    }

    /**
     * Get page title
     *
     * @async
     * @returns {Promise<string>} Page title
     *
     * @description
     * Returns the current page title.
     *
     * @example
     * const title = await basePage.getPageTitle();
     */
    async getPageTitle(): Promise<string> {
        return await this.page.title();
    }

    // ============ State Check Methods ============

    /**
     * Check if element is visible
     *
     * @async
     * @param {Locator} locator - Element to check
     * @returns {Promise<boolean>} True if visible
     *
     * @example
     * if (await basePage.isVisible(errorMessage)) { ... }
     */
    async isVisible(locator: Locator): Promise<boolean> {
        return await locator.isVisible();
    }

    /**
     * Check if element is enabled
     *
     * @async
     * @param {Locator} locator - Element to check
     * @returns {Promise<boolean>} True if enabled
     *
     * @example
     * if (await basePage.isEnabled(submitButton)) { ... }
     */
    async isEnabled(locator: Locator): Promise<boolean> {
        return await locator.isEnabled();
    }

    /**
     * Check if checkbox/radio is checked
     *
     * @async
     * @param {Locator} locator - Checkbox or radio element
     * @returns {Promise<boolean>} True if checked
     *
     * @example
     * if (await basePage.isChecked(agreeCheckbox)) { ... }
     */
    async isChecked(locator: Locator): Promise<boolean> {
        return await locator.isChecked();
    }

    /**
     * Check if element is editable
     *
     * @async
     * @param {Locator} locator - Element to check
     * @returns {Promise<boolean>} True if editable
     *
     * @example
     * if (await basePage.isEditable(textInput)) { ... }
     */
    async isEditable(locator: Locator): Promise<boolean> {
        return await locator.isEditable();
    }

    // ============ Assertion Methods ============

    /**
     * Assert page has expected title
     *
     * @async
     * @returns {Promise<void>}
     *
     * @description
     * Asserts the page title matches the pageTitle property.
     *
     * @example
     * await homePage.assertTitle();
     */
    async assertTitle(): Promise<void> {
        await expect(this.page).toHaveTitle(this.pageTitle);
    }

    /**
     * Assert URL contains text
     *
     * @async
     * @param {string} text - Text that URL should contain
     * @returns {Promise<void>}
     *
     * @example
     * await basePage.assertUrlContains('/dashboard');
     */
    async assertUrlContains(text: string): Promise<void> {
        await expect(this.page).toHaveURL(new RegExp(text));
    }

    /**
     * Assert element is visible
     *
     * @async
     * @param {Locator} locator - Element to check
     * @returns {Promise<void>}
     *
     * @example
     * await basePage.assertVisible(welcomeMessage);
     */
    async assertVisible(locator: Locator): Promise<void> {
        await expect(locator).toBeVisible();
        await this.takeScreenshot('element-visible');
    }

    /**
     * Assert element has exact text
     *
     * @async
     * @param {Locator} locator - Element to check
     * @param {string | RegExp} expectedText - Expected text
     * @returns {Promise<void>}
     *
     * @example
     * await basePage.assertText(heading, 'Welcome');
     * await basePage.assertText(message, new RegExp('Hello.*'));
     */
    async assertText(locator: Locator, expectedText: string | RegExp): Promise<void> {
        await expect(locator).toHaveText(expectedText);
    }

    /**
     * Assert element contains text
     *
     * @async
     * @param {Locator} locator - Element to check
     * @param {string} text - Text to find
     * @returns {Promise<void>}
     *
     * @example
     * await basePage.assertContainsText(paragraph, 'success');
     */
    async assertContainsText(locator: Locator, text: string): Promise<void> {
        await expect(locator).toContainText(text);
    }

    /**
     * Assert input has value
     *
     * @async
     * @param {Locator} locator - Input element
     * @param {string | RegExp} value - Expected value
     * @returns {Promise<void>}
     *
     * @example
     * await basePage.assertValue(emailInput, 'test@example.com');
     */
    async assertValue(locator: Locator, value: string | RegExp): Promise<void> {
        await expect(locator).toHaveValue(value);
    }

    // ============ Screenshot & Debug Methods ============

    /**
     * Take full page screenshot
     *
     * @async
     * @param {string} name - Screenshot file name (without extension)
     * @returns {Promise<Buffer>} Screenshot buffer
     *
     * @description
     * Captures a full-page screenshot and saves to test-results/screenshots/.
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
     * Take screenshot of specific element
     *
     * @async
     * @param {Locator} locator - Element to screenshot
     * @param {string} name - Screenshot file name
     * @returns {Promise<Buffer>} Screenshot buffer
     *
     * @example
     * await basePage.takeElementScreenshot(chart, 'chart-screenshot');
     */
    async takeElementScreenshot(locator: Locator, name: string): Promise<Buffer> {
        return await locator.screenshot({
            path: `test-results/screenshots/${name}.png`,
        });
    }

    /**
     * Execute JavaScript in page context
     *
     * @async
     * @template T - Return type
     * @param {() => T} fn - Function to execute
     * @returns {Promise<T>} Result of function execution
     *
     * @description
     * Executes JavaScript function in the browser context.
     *
     * @example
     * const scrollY = await basePage.evaluate(() => window.scrollY);
     */
    async evaluate<T>(fn: () => T): Promise<T> {
        return await this.page.evaluate(fn);
    }

    /**
     * Scroll element into view
     *
     * @async
     * @param {Locator} locator - Element to scroll to
     * @returns {Promise<void>}
     *
     * @description
     * Scrolls the element into the visible area if not already visible.
     *
     * @example
     * await basePage.scrollIntoView(footerSection);
     */
    async scrollIntoView(locator: Locator): Promise<void> {
        await locator.scrollIntoViewIfNeeded();
    }

    /**
     * Get the underlying Playwright Page instance
     *
     * @returns {Page} Playwright Page object
     *
     * @description
     * Returns the raw Playwright Page for advanced operations.
     *
     * @example
     * const page = basePage.getPage();
     * await page.route('**' + '/api/' + '*', route => route.abort());
     */
    getPage(): Page {
        return this.page;
    }

}