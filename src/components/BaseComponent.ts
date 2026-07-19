/**
 * @fileoverview Abstract base class for reusable UI components in the Page Object Model.
 *
 * All page components (forms, modals, navigation bars, etc.) extend this class.
 * Each component is scoped to a root locator, so all child queries are relative
 * to that root — preventing selector collisions across the page. Visibility
 * checks/waits/assertions on the root aren't wrapped here — `this.root` is a
 * plain `Locator`, so subclasses call `.isVisible()`, `.waitFor()`, or
 * `expect(this.root)` directly.
 *
 * @module components/BaseComponent
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * class SearchBar extends BaseComponent {
 *   constructor(page: Page) {
 *     super(page, '[data-testid="search-bar"]');
 *   }
 *   async search(term: string): Promise<void> {
 *     await this.getByPlaceholder('Search…').fill(term);
 *     await this.getByRole('button', { name: 'Search' }).click();
 *   }
 * }
 * ```
 */
import {Locator, Page} from '@playwright/test';
import {Logger} from '../utils/logger';

/**
 * Abstract base class for scoped UI components.
 *
 * Provides root-locator scoping and scoped locator finder methods.
 * Subclasses define component-specific selectors and interaction methods.
 *
 * @abstract
 * @class BaseComponent
 */
export abstract class BaseComponent {
    /** The Playwright Page instance. */
    protected readonly page: Page;
    /** Root locator that scopes all child queries. */
    protected readonly root: Locator;
    /** Logger instance named after the concrete component class. */
    protected readonly logger: Logger;

    /**
     * Creates a new component scoped to the given root selector or locator.
     *
     * @param {Page} page - Playwright Page instance
     * @param {string | Locator} rootSelector - CSS selector string or Playwright Locator for the component root
     */
    constructor(page: Page, rootSelector: string | Locator) {
        this.page = page;
        this.root = typeof rootSelector === 'string' ? page.locator(rootSelector) : rootSelector;
        this.logger = new Logger(this.constructor.name);
    }

    /**
     * Returns the root locator for this component.
     * @returns {Locator} The root locator
     */
    getRoot(): Locator {
        return this.root;
    }

    /**
     * Returns the Playwright Page instance.
     * @returns {Page} The page instance
     */
    getPage(): Page {
        return this.page;
    }

    /**
     * Creates a child locator scoped to the component root.
     * @param {string} selector - CSS or Playwright selector
     * @returns {Locator} Scoped locator
     * @protected
     */
    protected locator(selector: string): Locator {
        return this.root.locator(selector);
    }

    /**
     * Finds an element by ARIA role within the component root.
     * @param role - ARIA role (e.g., `'button'`, `'link'`, `'heading'`)
     * @param options - Role matching options (name, exact, etc.)
     * @returns {Locator} Scoped locator
     * @protected
     */
    protected getByRole(
        role: Parameters<Locator['getByRole']>[0],
        options?: Parameters<Locator['getByRole']>[1],
    ): Locator {
        return this.root.getByRole(role, options);
    }

    /**
     * Finds an element by text content within the component root.
     * @param {string | RegExp} text - Text to match
     * @param {{ exact?: boolean }} [options] - Matching options
     * @returns {Locator} Scoped locator
     * @protected
     */
    protected getByText(text: string | RegExp, options?: { exact?: boolean }): Locator {
        return this.root.getByText(text, options);
    }

    /**
     * Finds a form element by its associated label within the component root.
     * @param {string | RegExp} text - Label text to match
     * @param {{ exact?: boolean }} [options] - Matching options
     * @returns {Locator} Scoped locator
     * @protected
     */
    protected getByLabel(text: string | RegExp, options?: { exact?: boolean }): Locator {
        return this.root.getByLabel(text, options);
    }

    /**
     * Finds an element by placeholder text within the component root.
     * @param {string | RegExp} text - Placeholder text to match
     * @param {{ exact?: boolean }} [options] - Matching options
     * @returns {Locator} Scoped locator
     * @protected
     */
    protected getByPlaceholder(text: string | RegExp, options?: { exact?: boolean }): Locator {
        return this.root.getByPlaceholder(text, options);
    }

    /**
     * Finds an element by `data-testid` attribute within the component root.
     * @param {string | RegExp} testId - Test ID to match
     * @returns {Locator} Scoped locator
     * @protected
     */
    protected getByTestId(testId: string | RegExp): Locator {
        return this.root.getByTestId(testId);
    }
}
