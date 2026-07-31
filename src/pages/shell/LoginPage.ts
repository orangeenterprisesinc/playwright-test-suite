/**
 * @fileoverview Page Object for the PET Tiger login page.
 *
 * Encapsulates the login page locators and the login flow for the PET Tiger
 * web application.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Page Object representing the PET Tiger login page.
 *
 * @extends BasePage
 */
export class LoginPage extends BasePage {
    /** Relative URL of the login page. */
    readonly pageUrl: string = '/login';
    /** Title assertion is not used by the login suite; match anything. */
    readonly pageTitle: string | RegExp = /.*/;

    readonly emailInput: Locator;
    /** Password input field. */
    readonly passwordInput: Locator;
    /** Submit button of the login form. */
    readonly loginButton: Locator;
    /** Error message shown for invalid credentials. */
    readonly invalidCredentialsErrorMessage: Locator;

    constructor(page: Page) {
        super(page);
        this.emailInput = page.getByLabel('Email');
        this.passwordInput = page.getByLabel('Password');
        this.loginButton = page.getByRole('button', { name: 'Login' });
        this.invalidCredentialsErrorMessage = page.getByText('Invalid username or password.');
    }

    /**
     * Navigate to the PET Tiger login page (semantic alias that delegates to
     * {@link BasePage.navigate}).
     */
    async gotoPetTiger(): Promise<void> {
        await this.navigate();
    }

    /** Fill the credentials and submit the login form. */
    async loginPetTiger(email: string, password: string): Promise<void> {
        this.logger.info(`Logging in as: ${email}`);
        await this.emailInput.fill(email);
        await this.passwordInput.fill(password);
        await this.loginButton.click();
    }
}
