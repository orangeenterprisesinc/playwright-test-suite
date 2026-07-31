/**
 * @fileoverview The web-pet sign-in screen — `/login`.
 *
 * Deliberately separate from the framework's `src/pages/shell/LoginPage.ts`,
 * which drives the journey suite's Keycloak-style page: this app authenticates
 * through TigerMaster with its own form, and coupling the migrated suite to a
 * journey page object would let a journey-driven change rewrite web-pet
 * behaviour.
 *
 * Reached from an **unauthenticated** context. Specs asserting against it use
 * the anonymous fixture, not the admin one.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';

/**
 * @extends BasePage
 */
export class LoginPage extends BasePage {
    readonly pageUrl: string = '/login';
    readonly pageTitle: string | RegExp = /.*/;

    readonly usernameInput: Locator;
    readonly passwordInput: Locator;
    /** Addressed by type — the label is locale-dependent. */
    readonly submitButton: Locator;

    constructor(page: Page) {
        super(page);

        this.usernameInput = page.locator('input#username');
        this.passwordInput = page.locator('input#password');
        this.submitButton = page.locator('button[type="submit"]');
    }

    /** Navigate to the sign-in screen. Plain `goto`, matching the lifted spec. */
    async gotoLogin(): Promise<void> {
        await this.page.goto(this.pageUrl);
    }

    /** Fill both fields and submit. */
    async signIn(username: string, password: string): Promise<void> {
        await this.usernameInput.fill(username);
        await this.passwordInput.fill(password);
        await this.submitButton.click();
    }
}

export default LoginPage;
