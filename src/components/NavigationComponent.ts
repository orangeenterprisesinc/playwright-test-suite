/**
 * @fileoverview Reusable navigation/header bar component.
 *
 * Provides methods for interacting with site navigation elements including logo,
 * menu items, search, user menu (login/logout), and mobile/hamburger menu.
 *
 * @module components/NavigationComponent
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const nav = new NavigationComponent(page);
 * await nav.search('playwright');
 * await nav.clickMenuItem('Products');
 * await nav.assertLoggedIn();
 * ```
 */
import { expect, Locator, Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

/**
 * Reusable component for site navigation bars and headers.
 *
 * Auto-discovers common navigation elements (logo, links, search, user menu,
 * mobile toggle) and provides interaction and assertion methods.
 *
 * @class NavigationComponent
 * @extends {BaseComponent}
 */
export class NavigationComponent extends BaseComponent {
    /** Site logo element. */
    readonly logo: Locator;
    /** Home link. */
    readonly homeLink: Locator;
    /** All menu item links. */
    readonly menuItems: Locator;
    /** Search input field. */
    readonly searchInput: Locator;
    /** Search submit button. */
    readonly searchButton: Locator;
    /** User menu dropdown trigger. */
    readonly userMenu: Locator;
    /** Login/Sign-in link. */
    readonly loginButton: Locator;
    /** Logout/Sign-out button (inside user menu). */
    readonly logoutButton: Locator;
    /** Mobile/hamburger menu toggle button. */
    readonly mobileMenuToggle: Locator;
    /** Mobile menu container. */
    readonly mobileMenu: Locator;

    /**
     * Creates a NavigationComponent scoped to the given root selector.
     * @param {Page} page - Playwright Page instance
     * @param {string} [rootSelector='nav, header, [role="navigation"]'] - CSS selector for the nav root
     */
    constructor(page: Page, rootSelector: string = 'nav, header, [role="navigation"]') {
        super(page, rootSelector);
        this.logo = this.locator('.logo').or(this.getByRole('img', { name: /logo/i }));
        this.homeLink = this.getByRole('link', { name: /home/i });
        this.menuItems = this.getByRole('menuitem').or(this.locator('.nav-item'));
        this.searchInput = this.getByRole('searchbox').or(this.getByPlaceholder(/search/i));
        this.searchButton = this.getByRole('button', { name: /search/i });
        this.userMenu = this.locator('[data-testid="user-menu"]').or(this.locator('.user-menu'));
        this.loginButton = this.getByRole('link', { name: /login|sign in/i });
        this.logoutButton = this.getByRole('button', { name: /logout|sign out/i });
        this.mobileMenuToggle = this.getByRole('button', { name: /menu/i }).or(
            this.locator('.hamburger'),
        );
        this.mobileMenu = this.locator('.mobile-menu').or(
            this.locator('[data-testid="mobile-menu"]'),
        );
    }

    /** Clicks the site logo (typically navigates to home). */
    async clickLogo(): Promise<void> {
        this.logger.info('Clicking logo');
        await this.logo.click();
    }

    /** Clicks the Home link. */
    async goHome(): Promise<void> {
        this.logger.info('Navigating to home');
        await this.homeLink.click();
    }

    /**
     * Clicks a menu item by its link name.
     * @param {string} name - The visible link text
     */
    async clickMenuItem(name: string): Promise<void> {
        this.logger.info(`Clicking menu item: ${name}`);
        await this.getByRole('link', { name }).click();
    }

    /**
     * Types a search term and clicks the search button.
     * @param {string} term - The search query
     */
    async search(term: string): Promise<void> {
        this.logger.info(`Searching for: ${term}`);
        await this.searchInput.fill(term);
        await this.searchButton.click();
    }

    /**
     * Types a search term and presses Enter to submit.
     * @param {string} term - The search query
     */
    async searchWithEnter(term: string): Promise<void> {
        this.logger.info(`Searching for: ${term}`);
        await this.searchInput.fill(term);
        await this.searchInput.press('Enter');
    }

    /** Opens the user menu dropdown. */
    async openUserMenu(): Promise<void> {
        this.logger.info('Opening user menu');
        await this.userMenu.click();
    }

    /** Clicks the login/sign-in link. */
    async clickLogin(): Promise<void> {
        this.logger.info('Clicking login');
        await this.loginButton.click();
    }

    /** Opens the user menu and clicks the logout button. */
    async clickLogout(): Promise<void> {
        this.logger.info('Clicking logout');
        await this.openUserMenu();
        await this.logoutButton.click();
    }

    /** Clicks the mobile/hamburger menu toggle. */
    async toggleMobileMenu(): Promise<void> {
        this.logger.info('Toggling mobile menu');
        await this.mobileMenuToggle.click();
    }

    /** Opens the mobile menu if it is currently hidden. */
    async openMobileMenu(): Promise<void> {
        if (!(await this.mobileMenu.isVisible())) {
            await this.toggleMobileMenu();
            await expect(this.mobileMenu).toBeVisible();
        }
    }

    /** Closes the mobile menu if it is currently visible. */
    async closeMobileMenu(): Promise<void> {
        if (await this.mobileMenu.isVisible()) {
            await this.toggleMobileMenu();
            await expect(this.mobileMenu).toBeHidden();
        }
    }

    /**
     * Returns the text contents of all menu items.
     * @returns {Promise<string[]>} Menu item texts
     */
    async getMenuItemTexts(): Promise<string[]> {
        return await this.menuItems.allTextContents();
    }

    /**
     * Returns the current value of the search input.
     * @returns {Promise<string>} The search input value
     */
    async getSearchValue(): Promise<string> {
        return await this.searchInput.inputValue();
    }

    /** Asserts the user is logged in (user menu visible, login button hidden). */
    async assertLoggedIn(): Promise<void> {
        await expect(this.userMenu).toBeVisible();
        await expect(this.loginButton).toBeHidden();
    }

    /** Asserts the user is logged out (login button visible, user menu hidden). */
    async assertLoggedOut(): Promise<void> {
        await expect(this.loginButton).toBeVisible();
        await expect(this.userMenu).toBeHidden();
    }

    /**
     * Asserts that a menu item with the given name exists and is visible.
     * @param {string} name - The menu item link text
     */
    async assertMenuItemExists(name: string): Promise<void> {
        await expect(this.getByRole('link', { name })).toBeVisible();
    }

    /** Asserts the mobile menu is visible. */
    async assertMobileMenuVisible(): Promise<void> {
        await expect(this.mobileMenu).toBeVisible();
    }

    /** Asserts the mobile menu is hidden. */
    async assertMobileMenuHidden(): Promise<void> {
        await expect(this.mobileMenu).toBeHidden();
    }
}
