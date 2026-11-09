/**
 * @fileoverview Page Object for the PET Tiger login page.
 *
 * Encapsulates the login page locators and the login flow for the PET Tiger
 * web application.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ClientChooserComponent } from '../../components/ClientChooserComponent';
import { expectedClientId } from '../../utils/api/apiLogin';

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
    /** Shown instead of a redirect when the user belongs to several clients. */
    readonly clientChooser: ClientChooserComponent;

    constructor(page: Page) {
        super(page);
        this.clientChooser = new ClientChooserComponent(page);
        this.emailInput = page.getByLabel('Email');
        // The textbox, not the "Show password" toggle the login form grew (dev 2026-11-05): getByLabel('Password')
        // also matched the button's aria-label and failed every auth-setup with a strict-mode violation.
        this.passwordInput = page.getByRole('textbox', { name: /^Password/ });
        this.loginButton = page.getByRole('button', { name: 'Login' });
        // Copy changed with the 2026-11-05 dev deploy (web-pet #1569): was 'Invalid username or password.'
        this.invalidCredentialsErrorMessage = page.getByText('Incorrect email or password.');
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

    /** After a successful login: pick the client if the chooser appears, no-op if the app redirects straight in. */
    async chooseClientIfShown(clientId = expectedClientId(), timeout = 30_000): Promise<void> {
        const chooserShown = this.clientChooser.getRoot().waitFor({ state: 'visible', timeout }).then(() => true);
        const left = this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout }).then(() => false);
        chooserShown.catch(() => {});
        left.catch(() => {});
        if (await Promise.race([chooserShown, left])) await this.clientChooser.choose(clientId);
    }
}
