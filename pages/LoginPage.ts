import { Locator, Page } from "@playwright/test";

export class LoginPage {

    readonly page: Page;
    readonly emailInput: Locator;
    readonly passwordInput: Locator;
    readonly loginButton: Locator;
    readonly invalidCredentialsErrorMessage: Locator;

    constructor(page: Page) {
        this.page = page;
        // The username field is labelled "Email" in PET Tiger, but the literal
        // "su" superuser identifier is also accepted here.
        this.emailInput = page.getByLabel('Email');
        this.passwordInput = page.getByLabel('Password');
        this.loginButton = page.getByRole('button', { name: 'Login' });
        this.invalidCredentialsErrorMessage = page.getByText('Invalid username or password.');
    }

    /**
     * Navigate to the PET Tiger login page.
     */
    async gotoPetTiger() {
        const base = process.env.BASE_URL || '';
        await this.page.goto(`${base}/login`);
    }

    /**
     * Fill the credentials and submit the login form.
     * @param email    the Email / "su" identifier
     * @param password the password
     */
    async loginPetTiger(email: string, password: string) {
        await this.emailInput.fill(email);
        await this.passwordInput.fill(password);
        await this.loginButton.click();
    }
}
