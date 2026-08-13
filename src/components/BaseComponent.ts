/**
 * @fileoverview Abstract base class for reusable UI components in the Page Object Model.
 *
 * All page components (forms, modals, navigation bars, etc.) extend this class.
 * Each component is scoped to a root locator, so all child queries are relative
 * to that root — preventing selector collisions across the page. Visibility
 * checks/waits/assertions on the root aren't wrapped here — `this.root` is a
 * plain `Locator`, so subclasses call `.isVisible()`, `.waitFor()`, or
 * `expect(this.root)` directly.
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
 */
export abstract class BaseComponent {
    /** The Playwright Page instance. */
    protected readonly page: Page;
    /** Root locator that scopes all child queries. */
    protected readonly root: Locator;
    /** Logger instance named after the concrete component class. */
    protected readonly logger: Logger;

    /** Creates a new component scoped to the given root selector or locator. */
    constructor(page: Page, rootSelector: string | Locator) {
        this.page = page;
        this.root = typeof rootSelector === 'string' ? page.locator(rootSelector) : rootSelector;
        this.logger = new Logger(this.constructor.name);
    }

    /** Returns the root locator for this component. */
    getRoot(): Locator {
        return this.root;
    }

    /**
     * Creates a child locator scoped to the component root.
     * @protected
     */
    protected locator(selector: string): Locator {
        return this.root.locator(selector);
    }

    /**
     * Finds an element by ARIA role within the component root.
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
     * @protected
     */
    protected getByText(text: string | RegExp, options?: { exact?: boolean }): Locator {
        return this.root.getByText(text, options);
    }

    /**
     * Finds a form element by its associated label within the component root.
     * @protected
     */
    protected getByLabel(text: string | RegExp, options?: { exact?: boolean }): Locator {
        return this.root.getByLabel(text, options);
    }

    /**
     * Finds an element by placeholder text within the component root.
     * @protected
     */
    protected getByPlaceholder(text: string | RegExp, options?: { exact?: boolean }): Locator {
        return this.root.getByPlaceholder(text, options);
    }

    /**
     * Finds an element by `data-testid` attribute within the component root.
     * @protected
     */
    protected getByTestId(testId: string | RegExp): Locator {
        return this.root.getByTestId(testId);
    }
}
