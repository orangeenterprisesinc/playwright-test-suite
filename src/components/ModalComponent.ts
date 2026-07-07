/**
 * @fileoverview Reusable modal/dialog component for interacting with overlay dialogs.
 *
 * Provides methods for closing (via button, overlay click, or Escape key), confirming,
 * canceling, reading title/content, and asserting modal state.
 *
 * @module components/ModalComponent
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const modal = new ModalComponent(page);
 * await modal.waitForVisible();
 * await modal.assertTitle('Confirm Deletion');
 * await modal.confirm();
 * await modal.assertClosed();
 * ```
 */
import { expect, Locator, Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

/**
 * Reusable component for interacting with modal dialogs.
 *
 * Auto-discovers common modal elements (title, content, close/confirm/cancel buttons, overlay)
 * and provides high-level methods for interaction and assertion.
 *
 * @class ModalComponent
 * @extends {BaseComponent}
 */
export class ModalComponent extends BaseComponent {
    /** Modal title (heading or `.modal-title`). */
    readonly title: Locator;
    /** Modal body content area. */
    readonly content: Locator;
    /** Close button (X button or `[aria-label="Close"]`). */
    readonly closeButton: Locator;
    /** Confirm/OK/Yes/Submit button. */
    readonly confirmButton: Locator;
    /** Cancel/No button. */
    readonly cancelButton: Locator;
    /** Background overlay/backdrop. */
    readonly overlay: Locator;

    /**
     * Creates a ModalComponent scoped to the given root selector.
     * @param {Page} page - Playwright Page instance
     * @param {string} [rootSelector='[role="dialog"]'] - CSS selector for the modal root
     */
    constructor(page: Page, rootSelector: string = '[role="dialog"]') {
        super(page, rootSelector);
        this.title = this.getByRole('heading').or(this.locator('.modal-title'));
        this.content = this.locator('.modal-content').or(this.locator('.modal-body'));
        this.closeButton = this.getByRole('button', { name: /close/i }).or(
            this.locator('[aria-label="Close"]'),
        );
        this.confirmButton = this.getByRole('button', { name: /confirm|ok|yes|submit/i });
        this.cancelButton = this.getByRole('button', { name: /cancel|no/i });
        this.overlay = page.locator('.modal-overlay').or(page.locator('.modal-backdrop'));
    }

    /** Closes the modal by clicking the close (X) button. */
    async close(): Promise<void> {
        this.logger.info('Closing modal');
        await this.closeButton.click();
        await this.waitForHidden();
    }

    /** Closes the modal by clicking the background overlay. */
    async closeByOverlay(): Promise<void> {
        this.logger.info('Closing modal by clicking overlay');
        await this.overlay.click({ position: { x: 10, y: 10 } });
        await this.waitForHidden();
    }

    /** Closes the modal by pressing the Escape key. */
    async closeByEscape(): Promise<void> {
        this.logger.info('Closing modal by pressing Escape');
        await this.page.keyboard.press('Escape');
        await this.waitForHidden();
    }

    /** Clicks the confirm/OK/Yes button. Does NOT wait for the modal to close. */
    async confirm(): Promise<void> {
        this.logger.info('Confirming modal');
        await this.confirmButton.click();
    }

    /** Clicks the cancel/No button and waits for the modal to close. */
    async cancel(): Promise<void> {
        this.logger.info('Canceling modal');
        await this.cancelButton.click();
        await this.waitForHidden();
    }

    /**
     * Returns the modal title text (trimmed).
     * @returns {Promise<string>} The modal title
     */
    async getTitle(): Promise<string> {
        const text = await this.title.textContent();
        return text?.trim() || '';
    }

    /**
     * Returns the modal body content text (trimmed).
     * @returns {Promise<string>} The modal content
     */
    async getContent(): Promise<string> {
        const text = await this.content.textContent();
        return text?.trim() || '';
    }

    /** Asserts the modal is open (visible). */
    async assertOpen(): Promise<void> {
        await expect(this.root).toBeVisible();
    }

    /** Asserts the modal is closed (hidden). */
    async assertClosed(): Promise<void> {
        await expect(this.root).toBeHidden();
    }

    /**
     * Asserts the modal title matches the expected text or pattern.
     * @param {string | RegExp} expectedTitle - Expected title
     */
    async assertTitle(expectedTitle: string | RegExp): Promise<void> {
        await expect(this.title).toHaveText(expectedTitle);
    }

    /**
     * Asserts the modal content contains the given text.
     * @param {string} text - Text to search for
     */
    async assertContentContains(text: string): Promise<void> {
        await expect(this.content).toContainText(text);
    }

    /** Asserts the confirm button is visible. */
    async assertConfirmButtonVisible(): Promise<void> {
        await expect(this.confirmButton).toBeVisible();
    }

    /** Asserts the cancel button is visible. */
    async assertCancelButtonVisible(): Promise<void> {
        await expect(this.cancelButton).toBeVisible();
    }

    /**
     * Checks whether the modal is currently open.
     * @returns {Promise<boolean>} `true` if the modal is visible
     */
    async isOpen(): Promise<boolean> {
        return await this.root.isVisible();
    }

    /**
     * Checks whether the confirm button is enabled.
     * @returns {Promise<boolean>} `true` if the confirm button is enabled
     */
    async isConfirmEnabled(): Promise<boolean> {
        return await this.confirmButton.isEnabled();
    }
}
