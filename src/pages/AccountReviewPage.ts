/**
 * @fileoverview Page Object for the Account Review page.
 *
 * {@link AccountReviewPage} encapsulates all locators and actions for the
 * Account Review screen, including guarantor search, note creation, save
 * confirmation, and history verification.
 *
 * @module pages/AccountReviewPage
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const reviewPage = new AccountReviewPage(page);
 * await reviewPage.searchGuarantor('28114');
 * await reviewPage.selectRow();
 * await reviewPage.fillNote('Follow up needed');
 * await reviewPage.clickSave();
 * await reviewPage.confirmSave();
 * await reviewPage.assertSaveNotification();
 * ```
 */
import { APIRequestContext, expect, Locator, Page, TestInfo } from '@playwright/test';
import { allure } from 'allure-playwright';
import { BasePage } from './BasePage';
import { executeWithAuthRetry } from '../auth/requestBuilder';
import { ConfigProperties, getConfigValue } from '../enums/configProperties';
import { isStatusCodeEqualTo, verifyJsonKeyValues } from '../utils/apiResponseUtils';

/**
 * Page Object representing the Account Review screen.
 *
 * Extends {@link BasePage} with locators and actions specific to guarantor
 * account review, note management, and API-level verification.
 *
 * @class AccountReviewPage
 * @extends {BasePage}
 */
export class AccountReviewPage extends BasePage {
    /** @inheritdoc */
    readonly pageUrl: string = '/app/billing/collections/account-review';
    /** @inheritdoc */
    readonly pageTitle: string | RegExp = /Account Review/;

    // ─── Tab / Navigation ────────────────────────────────────

    /** The Account Review tab element. */
    readonly accountReviewTab: Locator;
    /** Search Criteria heading. */
    readonly searchCriteriaHeading: Locator;

    // ─── Search Criteria ─────────────────────────────────────

    /** Guarantor ID search input field. */
    readonly guarantorIdInput: Locator;
    /** Search button. */
    readonly searchButton: Locator;

    // ─── Account Results ─────────────────────────────────────

    /** Select row checkbox in the results grid. */
    readonly selectRowCheckbox: Locator;
    /** Note textarea field. */
    readonly noteTextarea: Locator;
    /** Save button. */
    readonly saveButton: Locator;

    // ─── Save Confirmation Dialog ────────────────────────────

    /** "Saving Action?" dialog heading. */
    readonly saveDialogHeading: Locator;
    /** Yes button in the save confirmation dialog. */
    readonly yesButton: Locator;

    // ─── Notifications / History ─────────────────────────────

    /** "Action has been saved" success notification. */
    readonly saveNotification: Locator;
    /** Main content area for history assertions. */
    readonly mainContent: Locator;

    constructor(page: Page) {
        super(page);

        // Tab / Navigation
        this.accountReviewTab = page.getByRole('tab', { name: 'Account Review', selected: true });
        this.searchCriteriaHeading = page.getByRole('heading', { name: 'Search Criteria:' });

        // Search Criteria
        this.guarantorIdInput = page.locator('[id=":r7:"]');
        this.searchButton = page.getByRole('button', { name: 'Search' });

        // Account Results
        this.selectRowCheckbox = page.getByRole('checkbox', { name: 'Select row' });
        this.noteTextarea = page.locator('textarea').first();
        this.saveButton = page.getByRole('button', { name: 'Save' });

        // Save Confirmation Dialog
        this.saveDialogHeading = page.getByRole('heading', { name: 'Saving Action?' });
        this.yesButton = page.getByRole('button', { name: 'Yes' });

        // Notifications / History
        this.saveNotification = page.getByText('Action has been saved');
        this.mainContent = page.getByRole('main');
    }

    // ─── Assertions ──────────────────────────────────────────

    /** Asserts the Account Review tab and search criteria heading are visible. */
    async assertTabIsActive(): Promise<void> {
        this.logger.info('Asserting Account Review tab is active');
        await this.assertVisible(this.searchCriteriaHeading);
        await this.assertVisible(this.accountReviewTab);
    }

    // ─── Actions ─────────────────────────────────────────────

    /**
     * Searches for a guarantor by ID.
     * @param {string} guarantorId - The guarantor ID to search for
     */
    async searchGuarantor(guarantorId: string): Promise<void> {
        this.logger.info(`Searching for Guarantor ID: ${guarantorId}`);
        await this.click(this.guarantorIdInput);
        await this.type(this.guarantorIdInput, guarantorId);
        await this.click(this.searchButton);
    }

    /** Selects the row checkbox in the results grid. */
    async selectRow(): Promise<void> {
        this.logger.info('Selecting account row');
        await this.check(this.selectRowCheckbox);
    }

    /**
     * Fills the note textarea with the given text.
     * @param {string} noteText - The note text to enter
     */
    async fillNote(noteText: string): Promise<void> {
        this.logger.info(`Filling note: ${noteText}`);
        await this.type(this.noteTextarea, noteText);
    }

    /** Clicks the Save button. */
    async clickSave(): Promise<void> {
        this.logger.info('Clicking Save button');
        await this.click(this.saveButton);
    }

    /** Confirms the save action by clicking Yes in the dialog. */
    async confirmSave(): Promise<void> {
        this.logger.info('Confirming save action');
        await this.assertVisible(this.saveDialogHeading);
        await this.click(this.yesButton);
    }

    // ─── Verification ────────────────────────────────────────

    /** Asserts the save success notification is visible. */
    async assertSaveNotification(): Promise<void> {
        this.logger.info('Asserting save notification is visible');
        await this.assertVisible(this.saveNotification);
    }

    /**
     * Asserts the note text appears in the account history.
     * @param {string} noteText - The note text to verify
     */
    async assertNoteInHistory(noteText: string): Promise<void> {
        this.logger.info(`Asserting note in history: ${noteText}`);
        await expect(this.mainContent).toContainText(`Added Account Note: ${noteText}`);
    }

    /** Asserts the note textarea is not editable (before selecting a row). */
    async assertTextareaNotEditable(): Promise<void> {
        this.logger.info('Asserting textarea is not editable');
        const editable = await this.isEditable(this.noteTextarea);
        expect(editable).toBeFalsy();
    }

    /** Asserts the note textarea is editable (after selecting a row). */
    async assertTextareaEditable(): Promise<void> {
        this.logger.info('Asserting textarea is editable');
        const editable = await this.isEditable(this.noteTextarea);
        expect(editable).toBeTruthy();
    }



   
}