/**
 * @fileoverview Page Object for the Keycloak login page.
 *
 * Encapsulates all locators and interactions for the Keycloak authentication
 * form used by the Patient Medical Records application. Supports valid/invalid
 * login flows, credential entry, form validation, and session timeout handling.
 *
 * @module pages/LoginPage
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { LoginPage } from '../pages/LoginPage';
 *
 * const loginPage = new LoginPage(page);
 * await loginPage.navigate();
 * await loginPage.login('SWEET', 'myPassword');
 * await loginPage.assertLoginSuccess();
 * ```
 */
import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object representing the Keycloak sign-in page.
 *
 * @class LoginPage
 * @extends {BasePage}
 */
export class LoginPage extends BasePage {
    /** @inheritdoc */
    readonly pageUrl: string = '/app/billing/collections/account-review';
    /** @inheritdoc */
    readonly pageTitle: string | RegExp = /Sign in to your account/;

    // ─── Locators ────────────────────────────────────────────

    /** Sign-in page heading. */
    readonly heading: Locator;
    /** Username / email input field. */
    readonly usernameInput: Locator;
    /** Password input field. */
    readonly passwordInput: Locator;
    /** Sign In submit button. */
    readonly signInButton: Locator;

    readonly errorMessage: Locator;

    readonly accountReviewHeading: Locator;

    /**
     * Creates a new LoginPage instance.
     * @param {Page} page - Playwright Page instance
     */
    constructor(page: Page) {
        super(page);
        this.heading = page.getByRole('heading', { name: 'Sign in to your account' });
        this.usernameInput = page.getByRole('textbox', { name: 'Username or email' });
        this.passwordInput = page.getByRole('textbox', { name: 'Password' });
        this.signInButton = page.getByRole('button', { name: 'Sign In' });
        this.errorMessage = page.getByText('Invalid username or password.');
        this.accountReviewHeading = page.getByRole('tab', { name: 'Account Review', selected: true });
    }

    // ─── Actions ─────────────────────────────────────────────

    /**
     * Fills username and password fields and clicks Sign In.
     *
     * @param {string} username - The username or email to enter
     * @param {string} password - The password to enter
     */
    async login(username: string, password: string): Promise<void> {
        this.logger.info(`Logging in as: ${username}`);
        await this.type(this.usernameInput, username);
        await this.type(this.passwordInput, password);
        await this.click(this.signInButton);
    }


    // ─── Assertions ──────────────────────────────────────────

    /**
     * Asserts the login page is loaded and visible.
     */
    async assertLoginPageLoaded(): Promise<void> {
        this.logger.info('Asserting login page is loaded');
        await this.assertVisible(this.heading);
        await this.assertVisible(this.usernameInput);
        await this.assertVisible(this.passwordInput);
    }

    /**
     * Asserts that after a successful login the user is redirected
     * to the Account Review page.
     */
    async assertLoginSuccess(): Promise<void> {
        this.logger.info('Asserting successful login redirect');
        await this.assertVisible(this.accountReviewHeading);
    }

    /**
     * Asserts that the login form fields (username and password) are still editable.
     *
     * @returns {Promise<void>}
     */
    async assertFieldsEditable(): Promise<void> {
        this.logger.info('Asserting form fields are still editable');
        await this.isEditable(this.usernameInput);
        await this.isEditable(this.passwordInput);
    }


    async assertLoginFailed(): Promise<void> {
        this.logger.info('Asserting login failure — user remains on login page');
        await this.assertVisible(this.heading);
        await this.assertVisible(this.errorMessage);
    }
}

